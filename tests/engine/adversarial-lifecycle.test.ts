// W4-2 · epoch / policy lifecycle lens (L1–L4). Real six-service engine on the
// FakeEngineDb: governance activation flips the right rows at epoch rollover (a
// forged activationEpoch is inert at the event layer), the per-epoch earned
// meter resets, a token_policy_change flows proposal → pending → closeEpoch, and
// a mint can be reversed at most once.

import { describe, expect, it } from 'vitest';

import { makeEngine, NOW, type Engine } from './helpers';
import type { FakeEngineDb } from '../../lib/engine/testing/fake-engine-db';

type Row = Record<string, unknown>;

function epochByNumber(db: FakeEngineDb, n: number): Row {
  const row = db.rows('tokenEpoch').find((r) => r.epochNumber === n);
  if (!row) throw new Error(`epoch #${n} not found`);
  return row;
}

/** Seed a community with a token state, policy, and one active epoch #1. */
function seedEpochCommunity(db: FakeEngineDb, epochOver: Row = {}): void {
  db.seedCommunity({ id: 'c1' });
  db.seedState({ communityId: 'c1', currentTotalSupply: 100_000n, ledgerSeq: 0n });
  db.seedPolicy({ communityId: 'c1', policyVersion: 1, monthlyInflationRateBps: 1000, maxAdvanceRateBps: 2000, memberMintCapRateBps: 500, epochDurationDays: 30 });
  db.seedEpoch({
    id: 'e1', communityId: 'c1', epochNumber: 1, status: 'active',
    openingSupply: 100_000n, baseMintBudget: 10_000n, advanceDebtFromPreviousEpoch: 0n,
    effectiveRegularBudget: 10_000n, maxAdvanceAmount: 2_000n, regularMintedAmount: 0n,
    advancedMintedAmount: 0n, unusedRegularBudget: 0n, inflationRateBps: 1000,
    endTime: new Date('2026-08-01T00:00:00.000Z'), createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...epochOver,
  });
}

describe('L1 · governance activation flips exactly the rows due at the opening epoch', () => {
  it('L1: E1 pending governance activates on close; a forged activationEpoch=3 event stays inert at the event layer', async () => {
    const e = makeEngine();
    const { db } = e;
    seedEpochCommunity(db);
    // A member with pending governance from an E1 advance.
    db.seedBalance({ communityId: 'c1', memberId: 'm1', activeGovernanceBalance: 0n, pendingGovernanceBalance: 500n });
    // Event due to open at epoch #2, plus a forged event claiming epoch #3.
    await db.tokenMintEvent.create({ data: { id: 'me_due', communityId: 'c1', memberId: 'm1', governanceStatus: 'pending', governanceActivationEpoch: 2 } });
    await db.tokenMintEvent.create({ data: { id: 'me_forged', communityId: 'c1', memberId: 'm1', governanceStatus: 'pending', governanceActivationEpoch: 3 } });

    const result = await e.epoch.closeEpoch('e1');
    if ('noop' in result) throw new Error('unexpected noop');

    // Balance layer: whole-row roll pending → active (total conserved).
    const bal = db.rows('memberTokenBalance').find((b) => b.memberId === 'm1');
    expect(bal?.activeGovernanceBalance).toBe(500n);
    expect(bal?.pendingGovernanceBalance).toBe(0n);
    // Event layer: only the activationEpoch==2 event flips; the forged #3 is inert.
    expect(db.rows('tokenMintEvent').find((m) => m.id === 'me_due')?.governanceStatus).toBe('active');
    expect(db.rows('tokenMintEvent').find((m) => m.id === 'me_forged')?.governanceStatus).toBe('pending');
  });
});

describe('L2 · the per-epoch earned meter resets and the next cap is recomputed', () => {
  it('L2: tokensEarnedCurrentEpoch zeroes for every member and the next epoch base is re-derived', async () => {
    const e = makeEngine();
    const { db } = e;
    seedEpochCommunity(db);
    db.seedBalance({ communityId: 'c1', memberId: 'm1', tokensEarnedCurrentEpoch: 777n });
    db.seedBalance({ communityId: 'c1', memberId: 'm2', tokensEarnedCurrentEpoch: 12n });

    const result = await e.epoch.closeEpoch('e1');
    if ('noop' in result) throw new Error('unexpected noop');

    for (const b of db.rows('memberTokenBalance')) {
      expect(b.tokensEarnedCurrentEpoch).toBe(0n);
    }
    // New epoch base = supply * inflation / 10000 = 100000 * 1000/10000 = 10000;
    // the per-member cap (base * memberMintCapRateBps/10000) is recomputed from it.
    const next = epochByNumber(db, 2);
    expect(next.baseMintBudget).toBe(10_000n);
    expect(next.effectiveRegularBudget).toBe(10_000n);
  });
});

describe('L3 · a token_policy_change flows proposal → pending version → closeEpoch activation', () => {
  it('L3: approval arms a pending version; close applies the new bps, emits chain policy_version + DB-only inflation_rate_change', async () => {
    const e = makeEngine();
    const { db } = e;
    db.seedCommunity({ id: 'c1' });
    db.seedState({ communityId: 'c1', currentTotalSupply: 100_000n, ledgerSeq: 0n });
    db.seedPolicy({ id: 'pol1', communityId: 'c1', policyVersion: 1, monthlyInflationRateBps: 1000, maxAdvanceRateBps: 2000, memberMintCapRateBps: 500, epochDurationDays: 30, rules: ['r0'] });
    db.seedEpoch({
      id: 'e5', communityId: 'c1', epochNumber: 5, status: 'active',
      openingSupply: 100_000n, baseMintBudget: 10_000n, advanceDebtFromPreviousEpoch: 0n,
      effectiveRegularBudget: 10_000n, maxAdvanceAmount: 2_000n, regularMintedAmount: 0n,
      advancedMintedAmount: 0n, unusedRegularBudget: 0n, inflationRateBps: 1000,
      endTime: new Date('2026-08-01T00:00:00.000Z'), createdAt: new Date('2026-07-01T00:00:00.000Z'),
    });
    db.seedBalance({ communityId: 'c1', memberId: 'm1', activeGovernanceBalance: 100n, totalBalance: 100n });

    // Proposal: raise inflation to 2000 bps.
    const { proposalId } = await e.proposal.create({
      communityId: 'c1', title: 'raise inflation', type: 'token_policy_change', createdBy: 'author',
      options: [{ id: 'approve' }, { id: 'reject' }],
      metadata: { policyChangePayload: { monthlyInflationRateBps: 2000, maxAdvanceRateBps: 3000, memberMintCapRateBps: 800 } },
    });
    await db.proposal.update({ where: { id: proposalId }, data: { minimumVoterCount: 1 } });
    await e.proposal.activate(proposalId);
    await e.proposal.castVote({ proposalId, memberId: 'm1', optionId: 'approve' });
    await db.proposal.update({ where: { id: proposalId }, data: { endTime: new Date(NOW.getTime() - 1000) } });
    await e.proposal.end(proposalId);

    // A pending version is armed but live params are unchanged pre-rollover.
    expect(db.rows('communityTokenPolicy')[0].policyVersion).toBe(1);
    expect(db.rows('communityTokenPolicy')[0].pendingPolicyEffectiveEpoch).toBe(6);

    // Close epoch #5 → activates the pending version for epoch #6.
    const result = await e.epoch.closeEpoch('e5');
    if ('noop' in result) throw new Error('unexpected noop');

    // New epoch uses the activated 2000 bps: base = 100000 * 2000/10000 = 20000.
    const next = epochByNumber(db, 6);
    expect(next.baseMintBudget).toBe(20_000n);
    expect(next.inflationRateBps).toBe(2000);

    // Live policy flipped, pending cleared.
    const pol = db.rows('communityTokenPolicy')[0];
    expect(pol.policyVersion).toBe(2);
    expect(pol.monthlyInflationRateBps).toBe(2000);
    expect(pol.pendingPolicyVersionId).toBeNull();

    // On-chain policy_version: a records-port (chain-eligible) record, backfilled
    // onto the immutable version row, and enqueued after the tx commits.
    const versionRow = db.rows('tokenPolicyVersion').find((v) => v.version === 2);
    const pvRecordId = versionRow?.publicRecordId as string;
    expect(pvRecordId).toBeTruthy();
    expect(e.records.created.some((c) => c.id === pvRecordId)).toBe(true);
    expect(e.records.submissions).toContain(pvRecordId);

    // DB-only inflation_rate_change: terminal 'recorded', chain-ineligible, never enqueued.
    const inflationRec = db.rows('publicRecord').find((r) => r.recordType === 'inflation_rate_change');
    expect(inflationRec?.status).toBe('recorded');
    expect(inflationRec?.chainEligible).toBe(false);
    expect(e.records.submissions).not.toContain(inflationRec?.id);
  });
});

describe('L4 · a mint can be reversed at most once', () => {
  it('L4: a second reversal of the same mint → ALREADY_REVERSED', async () => {
    const e = makeEngine();
    const { db } = e;
    db.seedState({ communityId: 'c1', currentTotalSupply: 1_000n, ledgerSeq: 0n });
    db.seedBalance({ communityId: 'c1', memberId: 'm1', totalBalance: 100n, activeGovernanceBalance: 100n, tokensReversedLifetime: 0n });
    await db.tokenMintEvent.create({
      data: {
        id: 'mint1', communityId: 'c1', memberId: 'm1', epochId: 'e1', epochNumber: 1,
        mintType: 'contribution', budgetSource: 'current_epoch', amount: 100n,
        governanceActivationEpoch: null, governanceStatus: 'active',
        memberBalanceBefore: 0n, memberBalanceAfter: 100n, totalSupplyBefore: 900n, totalSupplyAfter: 1000n,
        tokenPolicyVersion: 1, reason: 'r', approvedBy: 'admin', advanceRequestId: null,
        publicRecordId: 'rec_orig', relatedParty: false, ledgerSeq: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await db.publicRecord.create({
      data: {
        id: 'rec_orig', communityId: 'c1', recordType: 'token_mint', status: 'verified',
        chainEligible: true, envelopeJson: '{}', recordHash: `0x${'ab'.repeat(32)}`,
        sourceTable: 'TokenMintEvent', sourceId: 'mint1',
      },
    });

    await e.reversal.reverseMint({ originalMintEventId: 'mint1', reason: 'entry_error', approvedBy: 'admin' });
    await expect(
      e.reversal.reverseMint({ originalMintEventId: 'mint1', reason: 'entry_error', approvedBy: 'admin' }),
    ).rejects.toMatchObject({ code: 'ALREADY_REVERSED' });
    expect(db.rows('tokenReversalEvent')).toHaveLength(1);
  });
});
