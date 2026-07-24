// Integration tests for the SIGNER endpoint handlers (§6 #1-#3). Needs a live
// Postgres with the v0.7 tables; skipped by default, run with RUN_DB_TESTS=1.
// A fake GovernanceRuntime supplies the frozen EIP-712 domain + the on-chain read
// stubs (isApprover / memberSignerOf); real ethers Wallets produce the
// client-held-key signatures so the recover + verify path is exercised end to end.

import { id, Wallet } from 'ethers';
import { afterAll, describe, expect, it } from 'vitest';

import { getPrisma } from '../../db/client';
import { buildDomain } from '../../blockchain/signing/typed-data';
import type { GovernanceRuntime } from '../../blockchain/relay/governance-runtime';
import type { BlockchainConfig } from '../../blockchain/types';
import type { AuthContext } from '../core/auth';
import { createPrismaIdempotencyStore, defaultAuthorizeAdmin, type PrismaIdempotencyDb } from '../core';

import {
  handleSignerChallenge,
  handleSignerRegister,
  handleSignerRotate,
  type SignerDeps,
} from './handlers';

const RUN = process.env.RUN_DB_TESTS === '1';

const prisma = getPrisma();
const CONTRACT = '0x4309ba5d47fbc45d980988b0d5b0202b8ac7db33';
const CHAIN_ID = 1439;
const PEPPER = 'test-pepper-abcdef0123456789';

// Mutable on-chain read results the tests drive.
let approverResult = true;
let currentSignerKey = '0x0000000000000000000000000000000000000000';

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
    async memberSignerOf() { return currentSignerKey; },
    async isApprover() { return approverResult; },
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
  privateKey: `0x${'11'.repeat(32)}`,
  pepper: PEPPER,
  confirmations: 2,
  explorerBaseUrl: 'http://localhost',
  contractDeployBlock: 0,
  redisUrl: 'redis://localhost:6379',
  internalApiToken: 'test-internal-token-1234567890',
};

const deps: SignerDeps = {
  prisma,
  runtime: fakeRuntime,
  config,
  authorizeAdmin: defaultAuthorizeAdmin,
  idempotencyStore: createPrismaIdempotencyStore(prisma as unknown as PrismaIdempotencyDb),
};

const adminAuth: AuthContext = { actorId: 'admin-1', isAdmin: true, isInternal: false };
const anonAuth: AuthContext = { actorId: null, isAdmin: false, isInternal: false };

const freshCommunity = (): string => `sig-test-${Math.random().toString(36).slice(2)}`;

// Idempotency keys must be unique PER RUN: a fixed key persisted by a previous
// run (the store only clears on a full DB reset) would collide with this run's
// different request body and yield 409 IDEMPOTENCY_CONFLICT. The suffix stays
// stable within a run so the intentional idempotent-replay assertion still holds.
const RUN_ID = Math.random().toString(36).slice(2);

interface Envelope {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  message: Record<string, string | number | boolean>;
}

// Extract the signing envelope from a challenge ApiResult body.
function envelopeOf(body: unknown): Envelope {
  return (body as { data: { envelope: Envelope } }).data.envelope;
}

// Structural signer shape so both Wallet and HDNodeWallet (Wallet.createRandom())
// satisfy it.
interface TypedDataSigner {
  signTypedData(
    domain: Record<string, unknown>,
    types: Record<string, unknown>,
    value: Record<string, string | number | boolean>,
  ): Promise<string>;
}

async function sign(wallet: TypedDataSigner, env: Envelope): Promise<string> {
  return wallet.signTypedData(env.domain, env.types, env.message);
}

describe.skipIf(!RUN)('signer handlers (integration)', () => {
  afterAll(async () => {
    approverResult = true;
    await prisma.$disconnect();
  });

  it('challenge: issues a MemberEnrollment envelope + persists a SignerChallenge (201)', async () => {
    const communityId = freshCommunity();
    const signer = Wallet.createRandom();
    const r = await handleSignerChallenge(deps, {
      memberId: 'm-1',
      body: { communityId, signerAddress: signer.address, purpose: 'enroll' },
      auth: adminAuth,
    });
    expect(r.status).to.equal(201);
    const env = envelopeOf(r.body);
    expect((env as unknown as { primaryType: string }).primaryType).to.equal('MemberEnrollment');
    const persisted = await prisma.signerChallenge.findFirst({
      where: { communityId, purpose: 'enroll' },
    });
    expect(persisted).not.to.equal(null);
    expect(persisted?.consumedAt).to.equal(null);
  });

  it('challenge: rejects a non-admin caller (403)', async () => {
    const r = await handleSignerChallenge(deps, {
      memberId: 'm-1',
      body: { communityId: freshCommunity(), signerAddress: Wallet.createRandom().address, purpose: 'enroll' },
      auth: anonAuth,
    });
    expect(r.status).to.equal(403);
  });

  it('register: recovers memberSig + approver authSig, queues enroll_member, upserts pending signer (202)', async () => {
    approverResult = true;
    const communityId = freshCommunity();
    const memberWallet = Wallet.createRandom();
    const approverWallet = Wallet.createRandom();

    const challenge = await handleSignerChallenge(deps, {
      memberId: 'm-1',
      body: { communityId, signerAddress: memberWallet.address, purpose: 'enroll' },
      auth: adminAuth,
    });
    const env = envelopeOf(challenge.body);
    const memberSig = await sign(memberWallet, env);
    const authSig = await sign(approverWallet, env);

    const body = { communityId, signerAddress: memberWallet.address, memberSig, authSig };
    const r = await handleSignerRegister(deps, { memberId: 'm-1', body, auth: adminAuth, idempotencyKey: `reg-${RUN_ID}` });
    expect(r.status).to.equal(202);
    const data = (r.body as { data: { chainActionId: string; signerStatus: string } }).data;
    expect(data.signerStatus).to.equal('pending');

    const action = await prisma.chainAction.findUnique({ where: { id: data.chainActionId } });
    expect(action?.kind).to.equal('enroll_member');
    expect(action?.status).to.equal('ready_to_submit');

    const signer = await prisma.memberSigner.findFirst({ where: { communityId } });
    expect(signer?.status).to.equal('pending');
    expect(signer?.signerAddress).to.equal(memberWallet.address);

    // idempotent replay: same key + body returns the same action without re-running.
    const replay = await handleSignerRegister(deps, { memberId: 'm-1', body, auth: adminAuth, idempotencyKey: `reg-${RUN_ID}` });
    expect(replay.status).to.equal(202);
    const replayData = (replay.body as { data: { chainActionId: string } }).data;
    expect(replayData.chainActionId).to.equal(data.chainActionId);
  });

  it('register: rejects an authSig that is not from an approver (403)', async () => {
    approverResult = false;
    const communityId = freshCommunity();
    const memberWallet = Wallet.createRandom();
    const outsiderWallet = Wallet.createRandom();

    const challenge = await handleSignerChallenge(deps, {
      memberId: 'm-2',
      body: { communityId, signerAddress: memberWallet.address, purpose: 'enroll' },
      auth: adminAuth,
    });
    const env = envelopeOf(challenge.body);
    const memberSig = await sign(memberWallet, env);
    const authSig = await sign(outsiderWallet, env);

    const r = await handleSignerRegister(deps, {
      memberId: 'm-2',
      body: { communityId, signerAddress: memberWallet.address, memberSig, authSig },
      auth: adminAuth,
      idempotencyKey: `reg-not-approver-${RUN_ID}`,
    });
    expect(r.status).to.equal(403);
    const err = (r.body as { error: { code: string } }).error;
    expect(err.code).to.equal('ENROLLMENT_NOT_AUTHORIZED');
    approverResult = true;
  });

  it('register: requires an Idempotency-Key (400)', async () => {
    const r = await handleSignerRegister(deps, {
      memberId: 'm-1',
      body: {
        communityId: freshCommunity(),
        signerAddress: Wallet.createRandom().address,
        memberSig: `0x${'ab'.repeat(65)}`,
        authSig: `0x${'cd'.repeat(65)}`,
      },
      auth: adminAuth,
      idempotencyKey: null,
    });
    expect(r.status).to.equal(400);
  });

  it('rotate: authorizes with the current registered key, queues rotate_key (202)', async () => {
    const communityId = freshCommunity();
    const currentWallet = Wallet.createRandom();
    const newWallet = Wallet.createRandom();
    currentSignerKey = currentWallet.address;

    const challenge = await handleSignerChallenge(deps, {
      memberId: 'm-3',
      body: { communityId, signerAddress: newWallet.address, purpose: 'rotate' },
      auth: adminAuth,
    });
    const env = envelopeOf(challenge.body);
    expect((env as unknown as { primaryType: string }).primaryType).to.equal('KeyRotation');
    const rotationSig = await sign(currentWallet, env);

    const r = await handleSignerRotate(deps, {
      memberId: 'm-3',
      body: { communityId, newSignerAddress: newWallet.address, rotationSigs: [rotationSig] },
      auth: adminAuth,
      idempotencyKey: `rot-${RUN_ID}`,
    });
    expect(r.status).to.equal(202);
    const data = (r.body as { data: { chainActionId: string; newSignerAddress: string } }).data;
    const action = await prisma.chainAction.findUnique({ where: { id: data.chainActionId } });
    expect(action?.kind).to.equal('rotate_key');
    expect(action?.status).to.equal('ready_to_submit');
    const signer = await prisma.memberSigner.findFirst({ where: { communityId } });
    expect(signer?.signerAddress).to.equal(newWallet.address);
    currentSignerKey = '0x0000000000000000000000000000000000000000';
  });
});
