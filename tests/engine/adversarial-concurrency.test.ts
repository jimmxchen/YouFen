// W4-2 · concurrency / race lens (C1–C3). Real six-service engine on the
// FakeEngineDb (serial transaction model): duplicate mints collide on the
// [contributionId, budgetSource] unique, an epoch-switch window refuses a mint
// cleanly, a budget can never be breached with zero balance pollution, and the
// community ledger sequence stays unique + gap-free across interleaved events.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  attachDbRecordForMint,
  ledgerSeqs,
  makeEngine,
  seedMintCommunity,
  type Engine,
} from './helpers';

describe('C1 · a double-clicked contribution mints exactly once', () => {
  let e: Engine;
  beforeEach(() => {
    e = makeEngine();
  });

  it('C1: the second click on the same contribution → ALREADY_MINTED (idempotency read)', async () => {
    seedMintCommunity(e.db);
    await e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1' });
    await expect(
      e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'ALREADY_MINTED' });
    expect(e.db.rows('tokenMintEvent')).toHaveLength(1);
  });

  it('C1: bypassing the service to insert a duplicate (contributionId, current_epoch) row → P2002 → ALREADY_MINTED', async () => {
    seedMintCommunity(e.db);
    // Directly plant the colliding row, then blind the idempotency pre-read so
    // the create() path is reached and the DB unique constraint fires.
    await e.db.tokenMintEvent.create({
      data: { communityId: 'c1', memberId: 'm1', contributionId: 'con1', budgetSource: 'current_epoch' },
    });
    (e.db.tokenMintEvent as unknown as { findFirst: () => Promise<null> }).findFirst = () => Promise.resolve(null);

    await expect(
      e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'ALREADY_MINTED' });
  });
});

describe('C2 · epoch switching races and budget breaches are refused cleanly', () => {
  it('C2: in the switch window (successor not yet active) a mint fails EPOCH_NOT_ACTIVE with no writes', async () => {
    const e = makeEngine();
    seedMintCommunity(e.db);

    // Close epoch #1 (spawns the successor), then model the window where the
    // successor has not been activated yet → no active epoch for the community.
    const closed = await e.epoch.closeEpoch('e1');
    if ('noop' in closed) throw new Error('unexpected noop');
    await e.db.tokenEpoch.update({ where: { id: closed.nextEpochId }, data: { status: 'upcoming' } });

    const supplyBefore = e.db.rows('communityTokenState')[0].currentTotalSupply;
    await expect(
      e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'EPOCH_NOT_ACTIVE' });
    // Clean refusal: no ledger row, supply untouched.
    expect(e.db.rows('tokenMintEvent')).toHaveLength(0);
    expect(e.db.rows('communityTokenState')[0].currentTotalSupply).toBe(supplyBefore);
  });

  it('C2: budget 100, two 80-mints in sequence — the second fails and leaves zero balance pollution', async () => {
    const e = makeEngine();
    seedMintCommunity(e.db, {
      supply: 1000n,
      epoch: { baseMintBudget: 100000n, effectiveRegularBudget: 100n, maxAdvanceAmount: 100000n },
      contribution: { approvedTokenAmount: 80n },
    });
    e.db.seedMember({ id: 'm2', communityId: 'c1', role: 'member' });
    e.db.seedContribution({ id: 'con2', communityId: 'c1', memberId: 'm2', ruleId: 'r1', approvedTokenAmount: 80n, status: 'approved', description: 'd', evidence: [] });

    // First 80 fits (remaining 100 → 20).
    await e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1' });
    // Second 80 cannot: remaining 20 < 80 → INSUFFICIENT_BUDGET, rolled back whole.
    await expect(
      e.mint.mintForContribution({ contributionId: 'con2', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BUDGET' });

    // Only the first mint stuck; the guard kept the budget from being breached.
    expect(e.db.rows('tokenMintEvent')).toHaveLength(1);
    expect(e.db.rows('communityTokenState')[0].currentTotalSupply).toBe(1080n);
    expect(e.db.rows('communityTokenState')[0].ledgerSeq).toBe(1n);
    expect(e.db.rows('tokenEpoch')[0].regularMintedAmount).toBe(80n);
    // The second member's balance row was rolled back (zero pollution).
    expect(e.db.rows('memberTokenBalance').find((b) => b.memberId === 'm2')).toBeUndefined();
  });
});

describe('C3 · the community ledger sequence is unique, monotonic and gap-free', () => {
  it('C3: six interleaved mint / advance / reversal events carry ledgerSeq 1..6 with no gaps or repeats', async () => {
    const e = makeEngine();
    const { db } = e;
    db.seedCommunity({ id: 'c1' });
    db.seedMember({ id: 'm1', communityId: 'c1', role: 'member' });
    db.seedState({ communityId: 'c1', currentTotalSupply: 0n, ledgerSeq: 0n });
    db.seedPolicy({
      communityId: 'c1', policyVersion: 1, memberMintCapRateBps: 10000, maxAdvanceRateBps: 2500,
      rules: [{ id: 'r1', tokenAmount: 1000 }],
    });

    // (1,2) genesis allocation → two token_mint ledger rows.
    await e.mint.mintInitialAllocation({
      communityId: 'c1',
      allocations: [{ memberId: 'm1', amount: 1000n }, { memberId: 'm2', amount: 1000n }],
      reason: 'genesis', approvedBy: 'founder',
    });

    db.seedEpoch({
      id: 'e1', communityId: 'c1', epochNumber: 1, status: 'active',
      baseMintBudget: 100000n, effectiveRegularBudget: 100n, regularMintedAmount: 0n,
      advancedMintedAmount: 0n, maxAdvanceAmount: 100000n, advanceDebtFromPreviousEpoch: 0n,
    });
    db.seedContribution({ id: 'con1', communityId: 'c1', memberId: 'm1', ruleId: 'r1', approvedTokenAmount: 100n, status: 'approved', description: 'd', evidence: [] });

    // (3) a regular contribution mint (exhausts the 100 regular budget).
    await e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1' });

    // (4) an advance mint on the same epoch.
    db.seedAdvanceRequest({
      id: 'adv1', communityId: 'c1', epochId: 'e1', memberId: 'm1',
      requestedAmount: 500n, approvedAmount: null, advanceRateBps: 50, status: 'approved',
      relatedParty: false, requestedBy: 'admin1', secondApprovedBy: 'admin2', proposalId: null,
    });
    await e.advance.execute({ requestId: 'adv1' });

    // (5) reverse the contribution mint; (6) reverse the advance mint.
    const regularMint = db.rows('tokenMintEvent').find((m) => m.budgetSource === 'current_epoch' && m.mintType === 'contribution');
    const advanceMint = db.rows('tokenMintEvent').find((m) => m.budgetSource === 'next_epoch_advance');
    await attachDbRecordForMint(db, regularMint?.id as string);
    await e.reversal.reverseMint({ originalMintEventId: regularMint?.id as string, reason: 'entry_error', approvedBy: 'admin' });
    await attachDbRecordForMint(db, advanceMint?.id as string);
    await e.reversal.reverseMint({ originalMintEventId: advanceMint?.id as string, reason: 'entry_error', approvedBy: 'admin' });

    expect(ledgerSeqs(db)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(db.rows('communityTokenState')[0].ledgerSeq).toBe(6n);
  });
});
