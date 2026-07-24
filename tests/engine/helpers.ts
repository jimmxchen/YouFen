// Shared harness for the adversarial engine integration suite (W4-2). Assembles
// the six REAL engine services on top of the in-memory FakeEngineDb (W2-A) —
// wired together by hand (no runtime.ts import): the real PolicyService backs
// both the epoch-service PolicyActivationPort and the proposal-service
// settlement callback, so token_policy_change proposals flow end-to-end through
// closeEpoch. Fully offline: no real DB / Redis / chain / Anthropic API.

import { createAdvanceService } from '../../lib/engine/advance-service';
import { createEpochService } from '../../lib/engine/epoch-service';
import { createMintService } from '../../lib/engine/mint-service';
import { createPolicyService } from '../../lib/engine/policy-service';
import { createProposalService } from '../../lib/engine/proposal-service';
import { createReversalService } from '../../lib/engine/reversal-service';
import {
  makeFakeBuildEnvelope,
  makeFakeEngineDb,
  makeFakeRecordsPort,
  type FakeEngineDb,
  type FakeRecordsPort,
} from '../../lib/engine/testing/fake-engine-db';
import type { EngineDeps, Hex32 } from '../../lib/engine/types';

/** A single deterministic clock for every service in a harness. */
export const NOW = new Date('2026-07-23T00:00:00.000Z');

type Row = Record<string, unknown>;

/** Deterministic non-crypto hex32 hash ports (fake-only, offline). */
function fakeHex(seed: string): Hex32 {
  let out = '';
  for (let i = 0; i < 64; i += 1) {
    out += ((seed.charCodeAt(i % seed.length) * (i + 3) + i * 17) % 16).toString(16);
  }
  return `0x${out}` as Hex32;
}
export const fakeHashMemberId = (c: string, m: string): Hex32 => fakeHex(`m:${c}:${m}`);
export const fakeHashOptionId = (p: string, o: string): Hex32 => fakeHex(`o:${p}:${o}`);

export interface Engine {
  readonly db: FakeEngineDb;
  readonly records: FakeRecordsPort;
  readonly policy: ReturnType<typeof createPolicyService>;
  readonly mint: ReturnType<typeof createMintService>;
  readonly advance: ReturnType<typeof createAdvanceService>;
  readonly epoch: ReturnType<typeof createEpochService>;
  readonly reversal: ReturnType<typeof createReversalService>;
  readonly proposal: ReturnType<typeof createProposalService>;
}

/** Build a fresh, self-consistent engine: one FakeEngineDb, one RecordsPort, one
 *  monotonic envelope builder, shared by all six real service instances. */
export function makeEngine(): Engine {
  const db = makeFakeEngineDb();
  const records = makeFakeRecordsPort();
  const buildEnvelope = makeFakeBuildEnvelope();
  const base: EngineDeps = { db, records, buildEnvelope, now: () => NOW };

  const policy = createPolicyService(base);
  const mint = createMintService(base);
  const advance = createAdvanceService(base);
  const reversal = createReversalService(base);
  const epoch = createEpochService({ ...base, policyActivation: policy });
  const proposal = createProposalService({
    ...base,
    policy,
    hashMemberId: fakeHashMemberId,
    hashOptionId: fakeHashOptionId,
  });

  return { db, records, policy, mint, advance, epoch, reversal, proposal };
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

export interface CommunityOpts {
  role?: string;
  supply?: bigint;
  policy?: Row;
  epoch?: Row;
  contribution?: Row;
  balance?: Row;
}

/** Seed a self-consistent single-community mint scenario (mirrors the W3-1 happy
 *  path): 100-token approved contribution, ample budget, non-related member. */
export function seedMintCommunity(db: FakeEngineDb, opts: CommunityOpts = {}): void {
  db.seedCommunity({ id: 'c1' });
  db.seedMember({ id: 'm1', communityId: 'c1', role: opts.role ?? 'member' });
  db.seedState({ communityId: 'c1', currentTotalSupply: opts.supply ?? 1000n, ledgerSeq: 0n });
  db.seedPolicy({
    communityId: 'c1',
    policyVersion: 1,
    monthlyInflationRateBps: 1000,
    maxAdvanceRateBps: 2500,
    memberMintCapRateBps: 10000,
    rules: [{ id: 'r1', tokenAmount: 1000 }],
    ...opts.policy,
  });
  db.seedEpoch({
    id: 'e1',
    communityId: 'c1',
    epochNumber: 1,
    status: 'active',
    baseMintBudget: 1000n,
    effectiveRegularBudget: 1000n,
    regularMintedAmount: 0n,
    advancedMintedAmount: 0n,
    maxAdvanceAmount: 1000n,
    advanceDebtFromPreviousEpoch: 0n,
    ...opts.epoch,
  });
  db.seedBalance({
    communityId: 'c1',
    memberId: 'm1',
    tokensEarnedCurrentEpoch: 0n,
    tokensEarnedLifetime: 0n,
    tokensReversedLifetime: 0n,
    ...opts.balance,
  });
  db.seedContribution({
    id: 'con1',
    communityId: 'c1',
    memberId: 'm1',
    ruleId: 'r1',
    approvedTokenAmount: 100n,
    status: 'approved',
    description: 'desc',
    evidence: ['http://e'],
    ...opts.contribution,
  });
}

/** Layer a split-ready advance request onto a mint community (remaining 100,
 *  needed 500 → 100 regular + 400 advance) for the hardened split-mint path. */
export function seedSplit(
  db: FakeEngineDb,
  opts: { epoch?: Row; advance?: Row; contribution?: Row } = {},
): void {
  seedMintCommunity(db, {
    supply: 1000n,
    contribution: { approvedTokenAmount: 500n, ...opts.contribution },
    epoch: {
      baseMintBudget: 100000n, // keep the cumulative advance rate small
      effectiveRegularBudget: 100n,
      regularMintedAmount: 0n,
      advancedMintedAmount: 0n,
      maxAdvanceAmount: 1000n,
      advanceDebtFromPreviousEpoch: 0n,
      ...opts.epoch,
    },
  });
  db.seedAdvanceRequest({
    id: 'adv1',
    communityId: 'c1',
    epochId: 'e1',
    memberId: 'm1',
    status: 'approved',
    contributionIds: ['con1'],
    requestedAmount: 400n,
    approvedAmount: null,
    relatedParty: false,
    secondApprovedBy: 'admin2',
    requestedBy: 'admin1',
    proposalId: null,
    ...opts.advance,
  });
}

let recordHashCounter = 0;

/** Materialize the on-chain PublicRecord row a service-created mint points at,
 *  so the reversal service can reverse-look-up its recordHash. (The fake
 *  RecordsPort holds chain records off-DB; reversal reads db.publicRecord.)
 *  recordHash is unique per call — the [recordHash] @@unique is enforced. */
export async function attachDbRecordForMint(
  db: FakeEngineDb,
  mintEventId: string,
): Promise<void> {
  const mint = db.rows('tokenMintEvent').find((r) => r.id === mintEventId);
  if (!mint) throw new Error(`mint ${mintEventId} not found`);
  recordHashCounter += 1;
  await db.publicRecord.create({
    data: {
      id: mint.publicRecordId as string,
      communityId: mint.communityId,
      recordType: 'token_mint',
      status: 'verified',
      chainEligible: true,
      envelopeJson: '{}',
      recordHash: `0x${recordHashCounter.toString(16).padStart(64, '0')}`,
      sourceTable: 'TokenMintEvent',
      sourceId: mintEventId,
    },
  });
}

/** All ledgerSeq values carried by ledger events (mints + reversals), ascending. */
export function ledgerSeqs(db: FakeEngineDb): number[] {
  const fromMints = db.rows('tokenMintEvent').map((r) => Number(r.ledgerSeq));
  const fromReversals = db.rows('tokenReversalEvent').map((r) => Number(r.ledgerSeq));
  return [...fromMints, ...fromReversals].sort((a, b) => a - b);
}
