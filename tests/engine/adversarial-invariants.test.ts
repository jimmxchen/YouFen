// W4-2 · fund-conservation invariants (I1–I4). Real six-service engine on the
// FakeEngineDb: every value-moving path must conserve tokens — split legs sum to
// the approved amount, advance debt rolls forward without evaporating, a reversal
// restores all three ledgers, and Σmint − Σreversal equals the supply delta.

import { describe, expect, it } from 'vitest';

import { attachDbRecordForMint, makeEngine, seedSplit, type Engine } from './helpers';
import type { FakeEngineDb } from '../../lib/engine/testing/fake-engine-db';

type Row = Record<string, unknown>;

function epochByNumber(db: FakeEngineDb, n: number): Row {
  const row = db.rows('tokenEpoch').find((r) => r.epochNumber === n);
  if (!row) throw new Error(`epoch #${n} not found`);
  return row;
}

describe('I1 · split mint conserves the approved amount and the supply delta', () => {
  it('I1: Carol 500 = 100 regular + 400 advance; two events sum to 500 and supply rises exactly 500', async () => {
    const e = makeEngine();
    seedSplit(e.db); // contribution 500, supply 1000

    const out = await e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' });

    expect(out.mintEvents).toHaveLength(2);
    const amounts = e.db.rows('tokenMintEvent').map((m) => m.amount as bigint).sort((a, b) => Number(a - b));
    expect(amounts).toEqual([100n, 400n]);
    const sum = amounts.reduce((s, a) => s + a, 0n);
    const approved = e.db.rows('contribution').find((c) => c.id === 'con1')?.approvedTokenAmount as bigint;
    expect(sum).toBe(approved); // 500 == approvedTokenAmount
    // Supply rose by exactly the approved amount: 1000 → 1500.
    expect(e.db.rows('communityTokenState')[0].currentTotalSupply).toBe(1500n);
  });
});

describe('I2 · advance debt rolls forward across three epochs without evaporating', () => {
  it('I2: E1 advances 1500; E2 services 1000, E3 services 500; Σ actual repayment === 1500', async () => {
    const e = makeEngine();
    const { db } = e;
    db.seedCommunity({ id: 'c1' });
    // Supply held constant at 10_000 so every derived base = 10000*1000/10000 = 1000.
    db.seedState({ communityId: 'c1', currentTotalSupply: 10_000n, ledgerSeq: 0n });
    db.seedPolicy({ communityId: 'c1', policyVersion: 1, monthlyInflationRateBps: 1000, maxAdvanceRateBps: 2000, epochDurationDays: 30 });
    db.seedEpoch({
      id: 'e1', communityId: 'c1', epochNumber: 1, status: 'active',
      openingSupply: 10_000n, baseMintBudget: 1_000n,
      advanceDebtFromPreviousEpoch: 0n, advancedMintedAmount: 1_500n,
      effectiveRegularBudget: 1_000n, regularMintedAmount: 0n, maxAdvanceAmount: 200n,
      inflationRateBps: 1000, endTime: new Date('2026-02-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const r1 = await e.epoch.closeEpoch(epochByNumber(db, 1).id as string);
    if ('noop' in r1) throw new Error('unexpected noop');
    const r2 = await e.epoch.closeEpoch(r1.nextEpochId);
    if ('noop' in r2) throw new Error('unexpected noop');
    const r3 = await e.epoch.closeEpoch(r2.nextEpochId);
    if ('noop' in r3) throw new Error('unexpected noop');

    const e2 = epochByNumber(db, 2);
    const e3 = epochByNumber(db, 3);
    const e4 = epochByNumber(db, 4);
    // Debt chain: 1500 carried in, serviced 1000 → 500 carried, serviced 500 → 0.
    expect(e2.advanceDebtFromPreviousEpoch).toBe(1_500n);
    expect(e2.effectiveRegularBudget).toBe(0n);
    expect(e3.advanceDebtFromPreviousEpoch).toBe(500n);
    expect(e3.effectiveRegularBudget).toBe(500n);
    expect(e4.advanceDebtFromPreviousEpoch).toBe(0n);
    expect(e4.effectiveRegularBudget).toBe(1_000n);

    // Actual repayment per epoch = debtIn − debtCarriedOut (no new advances).
    const repaidE2 = (e2.advanceDebtFromPreviousEpoch as bigint) - (e3.advanceDebtFromPreviousEpoch as bigint);
    const repaidE3 = (e3.advanceDebtFromPreviousEpoch as bigint) - (e4.advanceDebtFromPreviousEpoch as bigint);
    expect(repaidE2).toBe(1_000n);
    expect(repaidE3).toBe(500n);
    expect(repaidE2 + repaidE3).toBe(1_500n); // conserved: equals E1's original advance
  });
});

describe('I3 · a full reversal restores all three ledgers and never mutates the mint row', () => {
  it('I3: mint 500 then reverse 500 → member, governance, supply return to origin; reversedLifetime 500', async () => {
    const e = makeEngine();
    const { db } = e;
    db.seedState({ communityId: 'c1', currentTotalSupply: 1_500n, ledgerSeq: 0n });
    db.seedBalance({
      communityId: 'c1', memberId: 'm1',
      totalBalance: 500n, activeGovernanceBalance: 500n, pendingGovernanceBalance: 0n,
      tokensReversedLifetime: 0n,
    });
    await db.tokenMintEvent.create({
      data: {
        id: 'mint1', communityId: 'c1', memberId: 'm1', epochId: 'e1', epochNumber: 1,
        mintType: 'contribution', budgetSource: 'current_epoch', amount: 500n,
        governanceActivationEpoch: null, governanceStatus: 'active',
        memberBalanceBefore: 0n, memberBalanceAfter: 500n, totalSupplyBefore: 1000n, totalSupplyAfter: 1500n,
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

    const bal = db.rows('memberTokenBalance')[0];
    expect(bal.totalBalance).toBe(0n);
    expect(bal.activeGovernanceBalance).toBe(0n);
    expect(bal.pendingGovernanceBalance).toBe(0n);
    expect(bal.tokensReversedLifetime).toBe(500n);
    // Supply back to the pre-mint origin.
    expect(db.rows('communityTokenState')[0].currentTotalSupply).toBe(1_000n);
    // Append-only: the original mint row's amount is untouched.
    expect(db.rows('tokenMintEvent').find((m) => m.id === 'mint1')?.amount).toBe(500n);
    // One reversal event of exactly 500.
    expect(db.rows('tokenReversalEvent')[0].amount).toBe(500n);
  });
});

describe('I4 · Σ(mint) − Σ(reversal) equals the supply delta across the whole lifecycle', () => {
  it('I4: genesis allocation + contribution mint + reversal all balance against currentTotalSupply', async () => {
    const e = makeEngine();
    const { db } = e;
    const initialSupply = 0n;
    db.seedCommunity({ id: 'c1' });
    db.seedMember({ id: 'm1', communityId: 'c1', role: 'member' });
    db.seedState({ communityId: 'c1', currentTotalSupply: initialSupply, ledgerSeq: 0n });
    db.seedPolicy({
      communityId: 'c1', policyVersion: 1, memberMintCapRateBps: 10000,
      rules: [{ id: 'r1', tokenAmount: 1000 }],
    });

    // (1) genesis: mintInitialAllocation.
    await e.mint.mintInitialAllocation({
      communityId: 'c1',
      allocations: [{ memberId: 'm1', amount: 1000n }, { memberId: 'm2', amount: 500n }],
      reason: 'genesis', approvedBy: 'founder',
    });

    // (2) a regular contribution mint in an active epoch.
    db.seedEpoch({
      id: 'e1', communityId: 'c1', epochNumber: 1, status: 'active',
      baseMintBudget: 100000n, effectiveRegularBudget: 100000n, regularMintedAmount: 0n,
      advancedMintedAmount: 0n, maxAdvanceAmount: 100000n, advanceDebtFromPreviousEpoch: 0n,
    });
    db.seedContribution({ id: 'con1', communityId: 'c1', memberId: 'm1', ruleId: 'r1', approvedTokenAmount: 100n, status: 'approved', description: 'd', evidence: [] });
    await e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1' });

    // (3) reverse that contribution mint.
    const contributionMint = db.rows('tokenMintEvent').find((m) => m.mintType === 'contribution');
    await attachDbRecordForMint(db, contributionMint?.id as string);
    await e.reversal.reverseMint({ originalMintEventId: contributionMint?.id as string, amount: 100n, reason: 'entry_error', approvedBy: 'admin' });

    const mintSum = db.rows('tokenMintEvent').reduce((s, m) => s + (m.amount as bigint), 0n);
    const reversalSum = db.rows('tokenReversalEvent').reduce((s, r) => s + (r.amount as bigint), 0n);
    const finalSupply = db.rows('communityTokenState')[0].currentTotalSupply as bigint;

    expect(mintSum).toBe(1600n); // 1000 + 500 + 100
    expect(reversalSum).toBe(100n);
    expect(mintSum - reversalSum).toBe(finalSupply - initialSupply);
    expect(finalSupply).toBe(1500n);
  });
});
