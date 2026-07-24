// W4-2 · adversarial governance lens (G1–G6). Real six-service engine on the
// FakeEngineDb: proves governance-bypass attacks are refused — continuous
// small-advance escalation, mid-vote minting, related-party self-approval,
// unrecorded-proposal execution, and two split-abuse vectors (G5/G6, red-team).

import { beforeEach, describe, expect, it } from 'vitest';

import {
  makeEngine,
  seedMintCommunity,
  seedSplit,
  type Engine,
} from './helpers';

const req = (amount: bigint, extra: Record<string, unknown> = {}) => ({
  communityId: 'c1',
  memberId: 'm1',
  amount,
  requestedBy: 'admin1',
  ...extra,
});

/** Advance-facing community: base 10_000, supply 100_000, no regular budget so
 *  the advance path is the only option; `advancedMinted` primes cumulative rate. */
function seedAdvanceCommunity(e: Engine, advancedMinted: bigint): void {
  seedMintCommunity(e.db, {
    supply: 100_000n,
    policy: { maxAdvanceRateBps: 2500 },
    epoch: {
      baseMintBudget: 10_000n,
      advancedMintedAmount: advancedMinted,
      effectiveRegularBudget: 0n,
      maxAdvanceAmount: 100_000n,
    },
  });
}

describe('G1 · continuous small advances escalate to a proposal, not double-admin', () => {
  let e: Engine;
  beforeEach(() => {
    e = makeEngine();
  });

  it('G1: a fresh 900 (900 bps) is dual-admin → pending_second_approval', async () => {
    seedAdvanceCommunity(e, 0n);
    const out = await e.advance.createRequest(req(900n));
    expect(out.status).toBe('pending_second_approval');
  });

  it('G1: 900 already advanced + another 900 (1800 bps) → pending_proposal (no double-admin bypass)', async () => {
    seedAdvanceCommunity(e, 900n); // cumulative (900+900)/10000 = 1800 bps > 1000
    const out = await e.advance.createRequest(req(900n));
    expect(out.status).toBe('pending_proposal');
  });
});

describe('G2 · minting during the voting window buys no governance weight', () => {
  let e: Engine;

  beforeEach(async () => {
    e = makeEngine();
    const { db } = e;
    db.seedCommunity({ id: 'c1' });
    db.seedState({ communityId: 'c1', currentTotalSupply: 100_000n, ledgerSeq: 0n });
    db.seedPolicy({
      communityId: 'c1',
      policyVersion: 1,
      memberMintCapRateBps: 10000,
      rules: [{ id: 'r1', tokenAmount: 1000 }],
    });
    db.seedEpoch({
      id: 'e1',
      communityId: 'c1',
      epochNumber: 1,
      status: 'active',
      baseMintBudget: 100000n,
      effectiveRegularBudget: 100000n,
      regularMintedAmount: 0n,
      advancedMintedAmount: 0n,
      maxAdvanceAmount: 100000n,
      advanceDebtFromPreviousEpoch: 0n,
    });
    // Supporters in the snapshot.
    db.seedMember({ id: 'm1', communityId: 'c1', role: 'member' });
    db.seedMember({ id: 'm2', communityId: 'c1', role: 'member' });
    db.seedBalance({ communityId: 'c1', memberId: 'm1', activeGovernanceBalance: 30n, totalBalance: 30n, tokensEarnedCurrentEpoch: 0n, tokensEarnedLifetime: 0n, tokensReversedLifetime: 0n });
    db.seedBalance({ communityId: 'c1', memberId: 'm2', activeGovernanceBalance: 70n, totalBalance: 70n, tokensEarnedCurrentEpoch: 0n, tokensEarnedLifetime: 0n, tokensReversedLifetime: 0n });
    // An intruder who only shows up AFTER activation (member + approved
    // contribution, but no balance row yet → excluded from the snapshot).
    db.seedMember({ id: 'm3', communityId: 'c1', role: 'member' });
    db.seedContribution({ id: 'con1', communityId: 'c1', memberId: 'm1', ruleId: 'r1', approvedTokenAmount: 100n, status: 'approved', description: 'd', evidence: [] });
    db.seedContribution({ id: 'con3', communityId: 'c1', memberId: 'm3', ruleId: 'r1', approvedTokenAmount: 100n, status: 'approved', description: 'd', evidence: [] });
  });

  it('G2: a supporter minted more mid-vote still votes at the FROZEN snapshot weight', async () => {
    const { proposalId } = await e.proposal.create({
      communityId: 'c1', title: 't', type: 'community_decision', createdBy: 'author', options: [{ id: 'approve' }, { id: 'reject' }],
    });
    await e.db.proposal.update({ where: { id: proposalId }, data: { minimumVoterCount: 1 } });
    await e.proposal.activate(proposalId);

    // Real mint during the voting window inflates m1's live balance to 130.
    await e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1' });
    const liveM1 = e.db.rows('memberTokenBalance').find((b) => b.memberId === 'm1');
    expect(liveM1?.activeGovernanceBalance).toBe(130n);

    await e.proposal.castVote({ proposalId, memberId: 'm1', optionId: 'approve' });
    const vote = e.db.rows('vote').find((v) => v.memberId === 'm1');
    expect(vote?.activeGovernanceBalanceSnapshot).toBe(30n); // counted weight = frozen snapshot
    expect(vote?.totalTokenBalanceSnapshot).toBe(130n); // live read, display-only
  });

  it('G2: a member first minted AFTER activation is outside the snapshot → castVote FORBIDDEN', async () => {
    const { proposalId } = await e.proposal.create({
      communityId: 'c1', title: 't', type: 'community_decision', createdBy: 'author', options: [{ id: 'approve' }, { id: 'reject' }],
    });
    await e.db.proposal.update({ where: { id: proposalId }, data: { minimumVoterCount: 1 } });
    await e.proposal.activate(proposalId);

    // Mint creates m3's balance row only now — after the snapshot was frozen.
    await e.mint.mintForContribution({ contributionId: 'con3', approverId: 'admin1' });
    expect(e.db.rows('memberTokenBalance').find((b) => b.memberId === 'm3')?.totalBalance).toBe(100n);

    await expect(
      e.proposal.castVote({ proposalId, memberId: 'm3', optionId: 'approve' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('G3 · related-party self-approval is forbidden', () => {
  let e: Engine;
  beforeEach(() => {
    e = makeEngine();
  });

  it('G3: advance secondApprove where approver === requestedBy → FORBIDDEN', async () => {
    const row = e.db.seedAdvanceRequest({
      id: 'advX', communityId: 'c1', epochId: 'e1', memberId: 'm1',
      requestedAmount: 800n, status: 'pending_second_approval',
      requestedBy: 'admin1', secondApprovedBy: null, relatedParty: false,
    });
    await expect(
      e.advance.secondApprove(row.id as string, 'admin1'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('G3: a related-party mint with no second approver and no proposal → SECOND_APPROVER_REQUIRED', async () => {
    seedMintCommunity(e.db, { role: 'owner' });
    await expect(
      e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'SECOND_APPROVER_REQUIRED' });
  });
});

describe('G4 · advance execute against a non-recorded proposal is refused', () => {
  it('G4: execute with a proposal still in "active" status → PROPOSAL_REQUIRED', async () => {
    const e = makeEngine();
    // cumulative (1500+500)/10000 = 2000 bps > 1000 → proposal governance required.
    seedAdvanceCommunity(e, 1500n);
    e.db.seedAdvanceRequest({
      id: 'advP', communityId: 'c1', epochId: 'e1', memberId: 'm1',
      requestedAmount: 500n, approvedAmount: null, advanceRateBps: 2000,
      status: 'approved', relatedParty: false, requestedBy: 'admin1',
      secondApprovedBy: null, proposalId: 'p1',
    });
    await e.db.proposal.create({ data: { id: 'p1', communityId: 'c1', title: 't', type: 'budget_advance', status: 'active' } });

    await expect(
      e.advance.execute({ requestId: 'advP' }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
  });
});

describe('G5 · a small dual-admin request cannot be laundered into a large split', () => {
  let e: Engine;
  beforeEach(() => {
    e = makeEngine();
  });

  it('G5: approvedAmount=100 request, split tries advancePart=400 → ADVANCE_CAP_EXCEEDED', async () => {
    // remaining 100, contribution 500 → advancePart 400; request ceiling = 100.
    seedSplit(e.db, { advance: { approvedAmount: 100n } });
    const remaining = 100n;
    const contributionAmount = 500n;
    const advancePart = contributionAmount - remaining;
    const ceiling = 100n;
    expect(advancePart).toBe(400n);
    expect(advancePart > ceiling).toBe(true);

    await expect(
      e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' }),
    ).rejects.toMatchObject({ code: 'ADVANCE_CAP_EXCEEDED' });
    // No partial ledger writes.
    expect(e.db.rows('tokenMintEvent')).toHaveLength(0);
  });

  it('G5: a split whose re-derived cumulative > 1000 bps with no proposal → PROPOSAL_REQUIRED', async () => {
    // base 1000, remaining 100, contribution 300 → advancePart 200; ceiling 200
    // (passes cap), cumulative (0+200)/1000 = 2000 bps → community_proposal.
    seedSplit(e.db, {
      contribution: { approvedTokenAmount: 300n },
      epoch: { baseMintBudget: 1000n, effectiveRegularBudget: 100n, maxAdvanceAmount: 1000n },
      advance: { requestedAmount: 200n, approvedAmount: 200n, proposalId: null },
    });
    const advancePart = 300n - 100n;
    const cumulativeBps = Number(((0n + advancePart) * 10000n) / 1000n);
    expect(advancePart).toBe(200n);
    expect(cumulativeBps).toBe(2000);

    await expect(
      e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
    expect(e.db.rows('tokenMintEvent')).toHaveLength(0);
  });
});

describe('G6 · a split-consumed request replayed through execute is idempotent', () => {
  it('G6: after a split consumes adv1, advance.execute returns the existing mint with no re-accounting', async () => {
    const e = makeEngine();
    seedSplit(e.db);

    // First: the split mint consumes adv1 (status → executed) and writes 2 events.
    const split = await e.mint.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' });
    expect(split.mintEvents).toHaveLength(2);
    expect(e.db.rows('tokenAdvanceRequest')[0].status).toBe('executed');

    const supplyAfterSplit = e.db.rows('communityTokenState')[0].currentTotalSupply;
    const submissionsAfterSplit = e.records.submissions.length;
    const advanceLeg = e.db.rows('tokenMintEvent').find((m) => m.budgetSource === 'next_epoch_advance');

    // Replay through execute: status is already 'executed' → idempotent re-yield.
    const replay = await e.advance.execute({ requestId: 'adv1' });

    expect(replay.mintEvents).toHaveLength(1);
    expect(replay.mintEvents[0].id).toBe(advanceLeg?.id);
    // No new ledger row, no supply change, no re-enqueue.
    expect(e.db.rows('tokenMintEvent')).toHaveLength(2);
    expect(e.db.rows('communityTokenState')[0].currentTotalSupply).toBe(supplyAfterSplit);
    expect(e.records.submissions).toHaveLength(submissionsAfterSplit);
  });
});
