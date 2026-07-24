import { id, Wallet } from 'ethers';
import { afterAll, describe, expect, it } from 'vitest';

import { getPrisma } from '../../db/client';
import { buildDomain } from '../../blockchain/signing/typed-data';
import type { GovernanceRuntime } from '../../blockchain/relay/governance-runtime';
import type { BlockchainConfig } from '../../blockchain/types';
import { createPrismaIdempotencyStore, type HeaderReader, type PrismaIdempotencyDb } from '../core';

import type { ReversalDeps } from './deps';
import {
  handleCreateReversalRequest,
  handleSignReversalRequest,
  handleSubmitReversalRequest,
} from './handlers';

// Integration — needs a live Postgres. Skipped by default; run with RUN_DB_TESTS=1.
const RUN = process.env.RUN_DB_TESTS === '1';

const prisma = getPrisma();
const CONTRACT = '0x4309ba5d47fbc45d980988b0d5b0202b8ac7db33';
const CHAIN_ID = 1439;
const INTERNAL_TOKEN = 'test-internal-token-1234567890';
const CREATE_ENDPOINT = 'POST /api/reversal-requests';
const ONE32 = `0x${'11'.repeat(32)}`;
const TWO32 = `0x${'22'.repeat(32)}`;

// Fake runtime: community exists with approverThreshold 1 (so a no-proposal
// reversal needs 2 distinct approvers), and every recovered signer is an approver.
const fakeRuntime: GovernanceRuntime = {
  sender: { async send() { return { txHash: id('t'), nonce: 0 }; }, async getReceipt() { return null; } },
  logProvider: { async getBlockNumber() { return 6; }, async getLogs() { return []; } },
  reader: {
    async getEpoch() {
      return {
        active: true, epochNumber: 0n, openingSupply: 0n, inflationRateBps: 0,
        baseMintBudget: 1000n, advanceDebtFromPrev: 0n, effectiveRegularBudget: 1000n,
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
    async isApprover() { return true; },
  },
  contractAddress: CONTRACT,
  chainId: CHAIN_ID,
  domain: buildDomain(CHAIN_ID, CONTRACT),
  deployBlock: 0,
  relayerAddress: '0x1111111111111111111111111111111111111111',
  async balanceOfRelayer() { return 1000n; },
  async headBlock() { return 6; },
};

const config: BlockchainConfig = {
  rpcUrl: 'http://localhost:8545',
  chainId: CHAIN_ID,
  contractAddress: CONTRACT,
  privateKey: `0x${'1'.repeat(64)}`,
  pepper: 'test-reversal-pepper-abcdef',
  confirmations: 2,
  explorerBaseUrl: 'http://localhost/explorer',
  contractDeployBlock: 0,
  redisUrl: 'redis://localhost:6379',
  internalApiToken: INTERNAL_TOKEN,
};

const deps: ReversalDeps = {
  prisma,
  runtime: fakeRuntime,
  authEnv: { internalApiToken: INTERNAL_TOKEN, cronSecret: null },
  config,
  idempotencyStore: createPrismaIdempotencyStore(prisma as unknown as PrismaIdempotencyDb),
};

const headers = (auth?: string): HeaderReader => ({
  get: (n: string) => (n.toLowerCase() === 'authorization' && auth !== undefined ? auth : null),
});

interface Envelope {
  readonly domain: { readonly name: string; readonly version: string; readonly chainId: number; readonly verifyingContract: string };
  readonly types: Record<string, { name: string; type: string }[]>;
  readonly message: Record<string, string>;
  readonly digest: string;
}
interface CreateData {
  readonly reversalRequestId: string;
  readonly requiredCount: number;
  readonly envelope: Envelope;
}

let createdRequestId: string | null = null;
const IDEM_KEY = `reversal-db-test-${Date.now()}`;

describe.skipIf(!RUN)('reversal-request handlers (integration)', () => {
  afterAll(async () => {
    if (createdRequestId !== null) {
      await prisma.chainAction.deleteMany({ where: { signatureRequestId: createdRequestId } }).catch(() => undefined);
      await prisma.signature.deleteMany({ where: { signatureRequestId: createdRequestId } }).catch(() => undefined);
      await prisma.signatureRequest.deleteMany({ where: { id: createdRequestId } }).catch(() => undefined);
    }
    await prisma.idempotencyKey.deleteMany({ where: { endpoint: CREATE_ENDPOINT, key: IDEM_KEY } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('rejects create from a non-admin caller (403)', async () => {
    const r = await handleCreateReversalRequest(deps, {
      headers: headers(),
      body: { communityId: 'c-rev', memberId: 'm-rev', originalRecordHash: ONE32, amount: '100', evidenceHash: TWO32 },
      idempotencyKey: IDEM_KEY,
    });
    expect(r.status).to.equal(403);
  });

  it('create -> dual approver sign -> ready ChainAction -> submit', async () => {
    // create (admin via internal Bearer token, with an Idempotency-Key)
    const created = await handleCreateReversalRequest(deps, {
      headers: headers(`Bearer ${INTERNAL_TOKEN}`),
      body: { communityId: 'c-rev', memberId: 'm-rev', originalRecordHash: ONE32, amount: '100', evidenceHash: TWO32 },
      idempotencyKey: IDEM_KEY,
    });
    expect(created.status).to.equal(201);
    const data = (created.body as { data: CreateData }).data;
    expect(data.requiredCount).to.equal(2); // max(approverThreshold=1, 2)
    createdRequestId = data.reversalRequestId;
    const env = data.envelope;

    // first approver signs — not yet ready
    const a1 = Wallet.createRandom();
    const sig1 = await a1.signTypedData(env.domain, env.types, env.message);
    const r1 = await handleSignReversalRequest(deps, {
      id: createdRequestId,
      headers: headers(),
      body: { signature: sig1 },
    });
    expect(r1.status).to.equal(200);
    const b1 = (r1.body as { data: { ready: boolean; distinctCount: number } }).data;
    expect(b1.ready).to.equal(false);
    expect(b1.distinctCount).to.equal(1);

    // second, distinct approver signs — threshold met, ChainAction queued
    const a2 = Wallet.createRandom();
    const sig2 = await a2.signTypedData(env.domain, env.types, env.message);
    const r2 = await handleSignReversalRequest(deps, {
      id: createdRequestId,
      headers: headers(),
      body: { signature: sig2 },
    });
    expect(r2.status).to.equal(200);
    const b2 = (r2.body as { data: { ready: boolean; chainActionId?: string } }).data;
    expect(b2.ready).to.equal(true);
    expect(b2.chainActionId).to.be.a('string');

    // submit confirms the action is queued at ready_to_submit
    const submitted = await handleSubmitReversalRequest(deps, {
      id: createdRequestId,
      headers: headers(`Bearer ${INTERNAL_TOKEN}`),
    });
    expect(submitted.status).to.equal(200);
    const sb = (submitted.body as { data: { status: string; chainActionId: string } }).data;
    expect(sb.status).to.equal('ready_to_submit');
    expect(sb.chainActionId).to.equal(b2.chainActionId);
  });
});
