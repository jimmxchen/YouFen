import { id } from 'ethers';
import { afterAll, describe, expect, it } from 'vitest';

import { getPrisma } from '../../db/client';
import { buildDomain } from '../../blockchain/signing/typed-data';
import type { GovernanceRuntime } from '../../blockchain/relay/governance-runtime';
import type { HeaderReader } from '../core/auth';

import { handleChainHealth, handleChainSubmit, type ChainHandlerDeps } from './handlers';

// Integration — needs a live Postgres. Skipped by default; run with RUN_DB_TESTS=1.
const RUN = process.env.RUN_DB_TESTS === '1';

const prisma = getPrisma();
const CONTRACT = '0x4309ba5d47fbc45d980988b0d5b0202b8ac7db33';
const INTERNAL_TOKEN = 'test-internal-token-1234567890';

const fakeRuntime: GovernanceRuntime = {
  sender: { async send() { return { txHash: id('t'), nonce: 0 }; }, async getReceipt() { return null; } },
  logProvider: { async getBlockNumber() { return 6; }, async getLogs() { return []; } },
  reader: {
    async getEpoch() {
      return {
        active: true, epochNumber: 0n, openingSupply: 0n, inflationRateBps: 0,
        baseMintBudget: 0n, advanceDebtFromPrev: 0n, effectiveRegularBudget: 0n,
        maxAdvanceAmount: 0n, regularMinted: 0n, advanceMinted: 0n,
      };
    },
    async communities() {
      return {
        exists: true, currentEpochNumber: 0n, currentTotalSupply: 0n, activePolicyVersion: 1,
        inflationRateBps: 0, maxAdvanceRateBps: 0, memberMintCapRateBps: 0, minVoterCount: 0,
        approverThreshold: 1, owner: '0x0000000000000000000000000000000000000000',
      };
    },
    async balanceOf() { return 0n; },
    async governanceBalanceAt() { return 0n; },
    async recordExists() { return false; },
    async memberSignerOf() { return '0x0000000000000000000000000000000000000000'; },
    async isApprover() { return false; },
  },
  contractAddress: CONTRACT,
  chainId: 1439,
  domain: buildDomain(1439, CONTRACT),
  deployBlock: 0,
  relayerAddress: '0x1111111111111111111111111111111111111111',
  async balanceOfRelayer() { return 1000n; },
  async headBlock() { return 6; },
};

const deps: ChainHandlerDeps = {
  prisma,
  runtime: fakeRuntime,
  authEnv: { internalApiToken: INTERNAL_TOKEN, cronSecret: null },
};

const headers = (auth?: string): HeaderReader => ({
  get: (n: string) => (n.toLowerCase() === 'authorization' && auth !== undefined ? auth : null),
});

describe.skipIf(!RUN)('chain cron handlers (integration)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects a caller without the internal Bearer token (403)', async () => {
    const r = await handleChainSubmit(deps, { headers: headers() });
    expect(r.status).to.equal(403);
  });

  it('accepts the internal Bearer token and returns a submit summary (200)', async () => {
    const r = await handleChainSubmit(deps, { headers: headers(`Bearer ${INTERNAL_TOKEN}`) });
    expect(r.status).to.equal(200);
  });

  it('health reports RPC head + relayer balance from the runtime', async () => {
    const r = await handleChainHealth(deps, { headers: headers(`Bearer ${INTERNAL_TOKEN}`) });
    expect(r.status).to.equal(200);
    const body = r.body as { data?: { rpcHead?: number; relayerBalanceWei?: string } };
    expect(body.data?.rpcHead).to.equal(6);
    expect(body.data?.relayerBalanceWei).to.equal('1000');
  });
});
