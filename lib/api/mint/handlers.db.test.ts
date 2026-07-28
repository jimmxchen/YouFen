// Integration test for the MINT write vertical (docs/BLOCKCHAIN-DESIGN-v0.7.md
// §6 #4-#7). Needs a live Postgres with the v0.7 tables. Skipped by default; run
// with RUN_DB_TESTS=1. Uses a fake GovernanceRuntime (no RPC) but a REAL approver
// Wallet so the signature is recovered exactly as in production, and drives a
// mint request through sign -> ready -> ChainAction -> submit.

import { Wallet } from 'ethers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getPrisma } from '../../db/client';
import { buildDomain } from '../../blockchain/signing/typed-data';
import type { GovernanceRuntime } from '../../blockchain/relay/governance-runtime';
import type { BlockchainConfig } from '../../blockchain/types';
import type { HeaderReader } from '../core/auth';
import { defaultAuthorizeAdmin } from '../core/auth';
import { createPrismaIdempotencyStore, type PrismaIdempotencyDb } from '../core/idempotency';

import { setMintDepsForTesting, type MintDeps } from './deps';
import {
  handleMintRequest,
  handleSignMintRequest,
  handleSubmitMintRequest,
} from './handlers';

const RUN = process.env.RUN_DB_TESTS === '1';

const prisma = getPrisma();
const CONTRACT = '0x4309ba5d47fbc45d980988b0d5b0202b8ac7db33';
const CHAIN_ID = 1439;
const INTERNAL_TOKEN = 'test-internal-token-1234567890';

// A real approver key: the fake runtime treats only this address as an approver.
const approver = Wallet.createRandom();
const stranger = Wallet.createRandom();

const config: BlockchainConfig = {
  rpcUrl: 'http://localhost:0',
  chainId: CHAIN_ID,
  contractAddress: CONTRACT,
  privateKey: `0x${'11'.repeat(32)}`,
  pepper: 'test-pepper-value-abcdef',
  confirmations: 2,
  explorerBaseUrl: 'http://localhost:0',
  contractDeployBlock: 0,
  redisUrl: 'redis://localhost:6379',
  internalApiToken: INTERNAL_TOKEN,
};

const fakeRuntime: GovernanceRuntime = {
  sender: { async send() { return { txHash: `0x${'ab'.repeat(32)}`, nonce: 0 }; }, async getReceipt() { return null; } },
  logProvider: { async getBlockNumber() { return 1; }, async getLogs() { return []; } },
  reader: {
    async getEpoch() {
      return {
        active: true, epochNumber: 0n, openingSupply: 1_000_000n, inflationRateBps: 1000,
        baseMintBudget: 1_000_000n, advanceDebtFromPrev: 0n, effectiveRegularBudget: 1_000_000n,
        maxAdvanceAmount: 250_000n, regularMinted: 0n, advanceMinted: 0n,
      };
    },
    async communities() {
      return {
        exists: true, currentEpochNumber: 0n, currentTotalSupply: 1_000_000n, activePolicyVersion: 1,
        inflationRateBps: 1000, maxAdvanceRateBps: 2500, memberMintCapRateBps: 5000, minVoterCount: 1,
        approverThreshold: 1, owner: '0x0000000000000000000000000000000000000000',
      };
    },
    async balanceOf() { return 0n; },
    async governanceBalanceAt() { return 0n; },
    async recordExists() { return false; },
    async memberSignerOf() { return '0x0000000000000000000000000000000000000000'; },
    async isApprover(_communityIdHash: string, account: string) {
      return account.toLowerCase() === approver.address.toLowerCase();
    },
  },
  contractAddress: CONTRACT,
  chainId: CHAIN_ID,
  domain: buildDomain(CHAIN_ID, CONTRACT),
  deployBlock: 0,
  relayerAddress: '0x1111111111111111111111111111111111111111',
  async balanceOfRelayer() { return 1000n; },
  async headBlock() { return 1; },
};

const deps: MintDeps = {
  prisma,
  runtime: fakeRuntime,
  authEnv: { internalApiToken: INTERNAL_TOKEN, cronSecret: null },
  config,
  idempotency: createPrismaIdempotencyStore(prisma as unknown as PrismaIdempotencyDb),
  authorizeAdmin: defaultAuthorizeAdmin,
  now: () => new Date(),
};

const headers = (auth?: string): HeaderReader => ({
  get: (n: string) => (n.toLowerCase() === 'authorization' && auth !== undefined ? auth : null),
});
const adminHeaders = headers(`Bearer ${INTERNAL_TOKEN}`);

interface Envelope {
  readonly domain: Record<string, unknown>;
  readonly types: Record<string, unknown>;
  readonly message: Record<string, string | number | boolean>;
  readonly digest: string;
}

let contributionId = '';
let mintRequestId = '';
let recordHash = '';

describe.skipIf(!RUN)('mint write vertical (integration)', () => {
  beforeAll(async () => {
    setMintDepsForTesting(deps);
    const contribution = await prisma.contribution.create({
      data: {
        communityId: `c_${Date.now()}`,
        memberId: `m_${Date.now()}`,
        description: 'integration mint request',
        suggestedTokenAmount: 500n,
        evidence: [],
        submittedBy: 'test',
        status: 'approved',
      },
    });
    contributionId = contribution.id;
  });

  afterAll(async () => {
    try {
      await prisma.signature.deleteMany({ where: { signatureRequestId: mintRequestId } });
      await prisma.chainAction.deleteMany({ where: { signatureRequestId: mintRequestId } });
      await prisma.signatureRequest.deleteMany({ where: { id: mintRequestId } });
      await prisma.contribution.deleteMany({ where: { id: contributionId } });
      await prisma.idempotencyKey.deleteMany({
        where: { endpoint: `POST /api/contributions/${contributionId}/mint-request` },
      });
    } finally {
      setMintDepsForTesting(null);
      await prisma.$disconnect();
    }
  });

  it('rejects a mint-request from a non-admin caller (403)', async () => {
    const r = await handleMintRequest(deps, {
      headers: headers(),
      contributionId,
      body: { relatedParty: false },
      idempotencyKey: 'mint-key-guard',
    });
    expect(r.status).to.equal(403);
  });

  it('builds a mint request + EIP-712 envelope for an admin (201)', async () => {
    const r = await handleMintRequest(deps, {
      headers: adminHeaders,
      contributionId,
      body: { relatedParty: false },
      idempotencyKey: 'mint-key-1',
    });
    expect(r.status).to.equal(201);
    const data = (r.body as { data: { mintRequestId: string; requiredApprovers: number; recordHash: string; envelope: Envelope } }).data;
    expect(data.requiredApprovers).to.equal(1);
    expect(data.mintRequestId).to.be.a('string');
    mintRequestId = data.mintRequestId;
    recordHash = data.recordHash;
    expect(recordHash).to.match(/^0x[0-9a-f]{64}$/);
  });

  it('rejects a signature from a non-approver (403)', async () => {
    const request = await prisma.signatureRequest.findUnique({ where: { id: mintRequestId } });
    const env = request!.typedData as unknown as Envelope;
    const sig = await stranger.signTypedData(env.domain, env.types as never, env.message);
    const r = await handleSignMintRequest(deps, {
      headers: headers(),
      mintRequestId,
      body: { signature: sig },
    });
    expect(r.status).to.equal(403);
    expect((r.body as { error: { code: string } }).error.code).to.equal('NOT_AN_APPROVER');
  });

  it('collects an approver signature and readies a ChainAction (200)', async () => {
    const request = await prisma.signatureRequest.findUnique({ where: { id: mintRequestId } });
    const env = request!.typedData as unknown as Envelope;
    const sig = await approver.signTypedData(env.domain, env.types as never, env.message);
    const r = await handleSignMintRequest(deps, {
      headers: headers(),
      mintRequestId,
      body: { signature: sig },
    });
    expect(r.status).to.equal(200);
    const data = (r.body as { data: { ready: boolean; chainActionId: string; chainActionStatus: string } }).data;
    expect(data.ready).to.equal(true);
    expect(data.chainActionId).to.be.a('string');
    expect(data.chainActionStatus).to.equal('ready_to_submit');
  });

  it('submit is an idempotent trigger returning the ready ChainAction (202)', async () => {
    const r = await handleSubmitMintRequest(deps, {
      headers: adminHeaders,
      mintRequestId,
      idempotencyKey: null,
    });
    expect(r.status).to.equal(202);
    const data = (r.body as { data: { chainActionId: string; status: string } }).data;
    expect(data.chainActionId).to.be.a('string');
    expect(data.status).to.equal('ready_to_submit');
  });
});
