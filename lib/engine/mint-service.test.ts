import { beforeEach, describe, expect, it } from 'vitest';

import { createMintService } from './mint-service';
import type { EngineDeps } from './types';
import {
  makeFakeBuildEnvelope,
  makeFakeEngineDb,
  makeFakeRecordsPort,
  type FakeEngineDb,
  type FakeRecordsPort,
} from './testing/fake-engine-db';

type Row = Record<string, unknown>;

const NOW = new Date('2026-07-23T00:00:00.000Z');

interface SeedOpts {
  role?: string;
  supply?: bigint;
  epoch?: Row;
  policy?: Row;
  contribution?: Row;
  balance?: Row;
}

/** Seed a self-consistent single-community scenario. Defaults land the happy
 *  path: 100-token approved contribution, ample budget, non-related member. */
function seedScenario(db: FakeEngineDb, opts: SeedOpts = {}): void {
  db.seedCommunity({ id: 'c1' });
  db.seedMember({ id: 'm1', communityId: 'c1', role: opts.role ?? 'member' });
  db.seedState({ communityId: 'c1', currentTotalSupply: opts.supply ?? 1000n, ledgerSeq: 0n });
  db.seedPolicy({
    communityId: 'c1',
    policyVersion: 1,
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

function makeDeps(db: FakeEngineDb, records: FakeRecordsPort): EngineDeps {
  return { db, records, buildEnvelope: makeFakeBuildEnvelope(), now: () => NOW };
}

function mintEvents(db: FakeEngineDb): Row[] {
  return db.rows('tokenMintEvent');
}

describe('createMintService.mintForContribution', () => {
  let db: FakeEngineDb;
  let records: FakeRecordsPort;

  beforeEach(() => {
    db = makeFakeEngineDb();
    records = makeFakeRecordsPort();
  });

  it('mints a single current-epoch event with the full snapshot field set', async () => {
    seedScenario(db);
    const svc = createMintService(makeDeps(db, records));

    const out = await svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' });

    expect(out.mintEvents).toHaveLength(1);
    expect(out.memberBalanceAfter).toBe(100n);
    expect(out.totalSupplyAfter).toBe(1100n);

    const [ev] = mintEvents(db);
    expect(ev.mintType).toBe('contribution');
    expect(ev.budgetSource).toBe('current_epoch');
    expect(ev.governanceStatus).toBe('active');
    expect(ev.amount).toBe(100n);
    expect(ev.memberBalanceBefore).toBe(0n);
    expect(ev.memberBalanceAfter).toBe(100n);
    expect(ev.totalSupplyBefore).toBe(1000n);
    expect(ev.totalSupplyAfter).toBe(1100n);
    expect(ev.activeGovernanceBefore).toBe(0n);
    expect(ev.activeGovernanceAfter).toBe(100n);
    expect(ev.tokenPolicyVersion).toBe(1);
    expect(ev.reason).toBe('desc');
    expect(ev.approvedBy).toBe('admin1');
    expect(ev.ruleId).toBe('r1');
    expect(ev.contributionId).toBe('con1');
    expect(ev.relatedParty).toBe(false);
    expect(ev.evidenceUrls).toEqual(['http://e']);
    expect(ev.governanceActivationEpoch).toBeNull();
    expect(ev.ledgerSeq).toBe(1);
    expect(ev.createdAt).toEqual(NOW);
    expect(typeof ev.ownershipPercentageBefore).toBe('number');
    expect(typeof ev.ownershipPercentageAfter).toBe('number');
    expect(ev.ownershipPercentageBefore).toBe(0);
    expect(ev.ownershipPercentageAfter).toBeGreaterThan(0);
    expect(ev.publicRecordId).toBe('rec_1');

    // Balance + supply persisted.
    const [bal] = db.rows('memberTokenBalance');
    expect(bal.totalBalance).toBe(100n);
    expect(bal.activeGovernanceBalance).toBe(100n);
    expect(bal.pendingGovernanceBalance).toBe(0n);
    expect(bal.tokensEarnedCurrentEpoch).toBe(100n);
    expect(bal.tokensEarnedLifetime).toBe(100n);
    expect(bal.lastMintAt).toEqual(NOW);
    const [state] = db.rows('communityTokenState');
    expect(state.currentTotalSupply).toBe(1100n);
    expect(state.ledgerSeq).toBe(1n);

    // Exactly one public record created + one submission (after the tx).
    expect(records.created).toHaveLength(1);
    expect(records.submissions).toEqual(['rec_1']);
  });

  it('allocates ledgerSeq and calls requestSubmission strictly after the tx commits', async () => {
    seedScenario(db);
    let committed = false;
    const rawTx = db.$transaction.bind(db);
    const wrappedDb = {
      ...db,
      $transaction: async <T>(fn: (tx: never) => Promise<T>): Promise<T> => {
        const r = (await rawTx(fn as never)) as T;
        committed = true;
        return r;
      },
    } as unknown as FakeEngineDb;
    const timedRecords: FakeRecordsPort = {
      ...records,
      createPendingRecord: (tx, input) => {
        expect(committed).toBe(false);
        return records.createPendingRecord(tx, input);
      },
      requestSubmission: (id) => {
        expect(committed).toBe(true);
        return records.requestSubmission(id);
      },
    };
    const svc = createMintService({
      db: wrappedDb,
      records: timedRecords,
      buildEnvelope: makeFakeBuildEnvelope(),
      now: () => NOW,
    });

    await svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' });
    expect(committed).toBe(true);
    expect(records.submissions).toEqual(['rec_1']);
  });

  it('rejects re-mint via the idempotency findFirst (ALREADY_MINTED)', async () => {
    seedScenario(db);
    db.seedContribution({ id: 'dup', communityId: 'c1', memberId: 'm1' });
    // Pre-existing current_epoch mint for con1.
    await db.tokenMintEvent.create({
      data: { communityId: 'c1', memberId: 'm1', contributionId: 'con1', budgetSource: 'current_epoch' },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'ALREADY_MINTED' });
  });

  it('rejects re-mint when only a prior next_epoch_advance (split, regular=0) event exists', async () => {
    // A pure-advance split (regular part == 0) leaves ONLY a next_epoch_advance
    // event. After an epoch switch, replaying the mint must still be blocked —
    // the idempotency read must not be scoped to budgetSource='current_epoch'.
    seedScenario(db);
    await db.tokenMintEvent.create({
      data: { communityId: 'c1', memberId: 'm1', contributionId: 'con1', budgetSource: 'next_epoch_advance' },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'ALREADY_MINTED' });
    // No second (current_epoch) mint was created.
    expect(mintEvents(db)).toHaveLength(1);
  });

  it('maps a P2002 unique violation on create to ALREADY_MINTED', async () => {
    seedScenario(db);
    // Seed the colliding row, but blind the idempotency read so create is reached.
    await db.tokenMintEvent.create({
      data: { communityId: 'c1', memberId: 'm1', contributionId: 'con1', budgetSource: 'current_epoch' },
    });
    (db.tokenMintEvent as unknown as { findFirst: () => Promise<null> }).findFirst = () =>
      Promise.resolve(null);
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'ALREADY_MINTED' });
  });

  it('throws NOT_FOUND when the contribution is missing', async () => {
    seedScenario(db);
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'nope', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_APPROVED when the contribution is not approved', async () => {
    seedScenario(db, { contribution: { status: 'pending' } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'NOT_APPROVED' });
  });

  it('throws EPOCH_NOT_ACTIVE when there is no active epoch', async () => {
    seedScenario(db, { epoch: { status: 'closed' } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'EPOCH_NOT_ACTIVE' });
  });

  it('throws RULE_VIOLATION when approved amount exceeds the rule cap', async () => {
    seedScenario(db, { contribution: { approvedTokenAmount: 2000n } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
  });

  it('throws RULE_VIOLATION when approved amount is non-positive', async () => {
    seedScenario(db, { contribution: { approvedTokenAmount: 0n } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'RULE_VIOLATION' });
  });

  it('throws MEMBER_CAP_EXCEEDED when earned + amount overruns the per-member cap', async () => {
    seedScenario(db, { policy: { memberMintCapRateBps: 500 } }); // cap = 1000*500/10000 = 50
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'MEMBER_CAP_EXCEEDED' });
  });

  it('measures the per-epoch cap against tokensEarnedCurrentEpoch, not lifetime earnings', async () => {
    // A member who minted a lot in PAST epochs (high lifetime) but whose per-epoch
    // meter was reset at epoch switch must still mint this epoch. cap = 1000*5000/10000 = 500.
    seedScenario(db, {
      policy: { memberMintCapRateBps: 5000, rules: [{ id: 'r1', tokenAmount: 1000 }] },
      balance: { tokensEarnedCurrentEpoch: 0n, tokensEarnedLifetime: 100000n },
    });
    const svc = createMintService(makeDeps(db, records));
    const out = await svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' });
    expect(out.mintEvents).toHaveLength(1);
    expect(out.memberBalanceAfter).toBe(100n);
  });

  it('throws MEMBER_CAP_EXCEEDED once this-epoch earnings plus the amount overrun the cap', async () => {
    // cap = 500; already earned 450 THIS epoch; 450 + 100 > 500.
    seedScenario(db, {
      policy: { memberMintCapRateBps: 5000, rules: [{ id: 'r1', tokenAmount: 1000 }] },
      balance: { tokensEarnedCurrentEpoch: 450n, tokensEarnedLifetime: 450n },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'MEMBER_CAP_EXCEEDED' });
  });

  it('throws SECOND_APPROVER_REQUIRED for a related party without dual approval', async () => {
    seedScenario(db, { role: 'owner' });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'SECOND_APPROVER_REQUIRED' });
  });

  it('accepts a related party when a distinct second approver is supplied', async () => {
    seedScenario(db, { role: 'manager' });
    const svc = createMintService(makeDeps(db, records));
    const out = await svc.mintForContribution({
      contributionId: 'con1',
      approverId: 'admin1',
      secondApproverId: 'admin2',
    });
    expect(out.mintEvents).toHaveLength(1);
    const [ev] = mintEvents(db);
    expect(ev.relatedParty).toBe(true);
    expect(ev.secondApprovedBy).toBe('admin2');
  });

  it('throws FORBIDDEN when the second approver equals the approver (self-approval)', async () => {
    seedScenario(db, { role: 'owner' });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({
        contributionId: 'con1',
        approverId: 'admin1',
        secondApproverId: 'admin1',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a related party whose proposalId points at no proposal (bogus string)', async () => {
    seedScenario(db, { role: 'owner' });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({
        contributionId: 'con1',
        approverId: 'admin1',
        proposalId: 'totally-bogus-proposal-id',
      }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
    expect(mintEvents(db)).toHaveLength(0);
  });

  it('rejects a related party whose proposal is not yet recorded', async () => {
    seedScenario(db, { role: 'owner' });
    await db.proposal.create({
      data: { id: 'prop1', communityId: 'c1', status: 'active', type: 'related_party_mint' },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', proposalId: 'prop1' }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
  });

  it('rejects a related party whose proposal is the wrong type', async () => {
    seedScenario(db, { role: 'owner' });
    await db.proposal.create({
      data: { id: 'prop1', communityId: 'c1', status: 'recorded', type: 'community_decision' },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', proposalId: 'prop1' }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
  });

  it('rejects a related party whose recorded proposal belongs to another community', async () => {
    seedScenario(db, { role: 'owner' });
    await db.proposal.create({
      data: { id: 'prop1', communityId: 'other', status: 'recorded', type: 'related_party_mint' },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', proposalId: 'prop1' }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
  });

  it('rejects a related party whose recorded proposal was voted down (winningOptionId=reject)', async () => {
    seedScenario(db, { role: 'owner' });
    await db.proposal.create({
      data: {
        id: 'prop1',
        communityId: 'c1',
        status: 'recorded',
        type: 'related_party_mint',
        winningOptionId: 'reject',
        voterCount: 5,
        minimumVoterCount: 3,
        specialMintRecipientId: 'm1',
      },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', proposalId: 'prop1' }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
    expect(mintEvents(db)).toHaveLength(0);
  });

  it('rejects a related party whose approved proposal did not meet quorum', async () => {
    seedScenario(db, { role: 'owner' });
    await db.proposal.create({
      data: {
        id: 'prop1',
        communityId: 'c1',
        status: 'recorded',
        type: 'related_party_mint',
        winningOptionId: 'approve',
        voterCount: 2,
        minimumVoterCount: 3,
        specialMintRecipientId: 'm1',
      },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', proposalId: 'prop1' }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
    expect(mintEvents(db)).toHaveLength(0);
  });

  it('rejects a related party whose approved proposal targets a different member', async () => {
    seedScenario(db, { role: 'owner' });
    await db.proposal.create({
      data: {
        id: 'prop1',
        communityId: 'c1',
        status: 'recorded',
        type: 'related_party_mint',
        winningOptionId: 'approve',
        voterCount: 5,
        minimumVoterCount: 3,
        specialMintRecipientId: 'someone-else',
      },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', proposalId: 'prop1' }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
    expect(mintEvents(db)).toHaveLength(0);
  });

  it('accepts a related party backed by a passed related_party_mint proposal targeting the member', async () => {
    seedScenario(db, { role: 'owner' });
    await db.proposal.create({
      data: {
        id: 'prop1',
        communityId: 'c1',
        status: 'recorded',
        type: 'related_party_mint',
        winningOptionId: 'approve',
        voterCount: 5,
        minimumVoterCount: 3,
        specialMintRecipientId: 'm1',
      },
    });
    const svc = createMintService(makeDeps(db, records));
    const out = await svc.mintForContribution({
      contributionId: 'con1',
      approverId: 'admin1',
      proposalId: 'prop1',
    });
    expect(out.mintEvents).toHaveLength(1);
    const [ev] = mintEvents(db);
    expect(ev.relatedParty).toBe(true);
    expect(ev.proposalId).toBe('prop1');
  });

  it('rejects reusing a passed related_party_mint proposal for a second contribution (CONFLICT)', async () => {
    // A passed related_party_mint proposal authorizes ONE special mint for its
    // target member. Once the first approved contribution has consumed it, the
    // same proposalId must not be replayable across the member's later approved
    // contributions — otherwise one community vote becomes a standing minting
    // license, no further governance required.
    seedScenario(db, { role: 'owner' });
    await db.proposal.create({
      data: {
        id: 'prop1',
        communityId: 'c1',
        status: 'recorded',
        type: 'related_party_mint',
        winningOptionId: 'approve',
        voterCount: 5,
        minimumVoterCount: 3,
        specialMintRecipientId: 'm1',
      },
    });
    // A second, independently approved contribution for the same target member.
    db.seedContribution({
      id: 'con2',
      communityId: 'c1',
      memberId: 'm1',
      ruleId: 'r1',
      approvedTokenAmount: 100n,
      status: 'approved',
      description: 'desc2',
      evidence: ['http://e2'],
    });
    const svc = createMintService(makeDeps(db, records));

    // First mint consumes the one-time authorization.
    const out = await svc.mintForContribution({
      contributionId: 'con1',
      approverId: 'admin1',
      proposalId: 'prop1',
    });
    expect(out.mintEvents).toHaveLength(1);

    // Replaying the SAME passed proposal for a different contribution must fail.
    await expect(
      svc.mintForContribution({ contributionId: 'con2', approverId: 'admin1', proposalId: 'prop1' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    // No mint row for con2 was created.
    expect(mintEvents(db).filter((e) => e.contributionId === 'con2')).toHaveLength(0);
  });

  it('throws INSUFFICIENT_BUDGET when the regular budget is short and no advance is attached', async () => {
    seedScenario(db, { epoch: { effectiveRegularBudget: 1000n, regularMintedAmount: 950n } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1' }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BUDGET' });
  });
});

// ---- Split path (Carol §29.3): remaining 100, needed 500 ----

function seedSplit(
  db: FakeEngineDb,
  opts: { epoch?: Row; advance?: Row; contribution?: Row } = {},
): void {
  seedScenario(db, {
    supply: 1000n,
    policy: { memberMintCapRateBps: 10000, rules: [{ id: 'r1', tokenAmount: 1000 }] },
    contribution: { approvedTokenAmount: 500n, ...opts.contribution },
    epoch: {
      baseMintBudget: 100000n, // keep cumulative advance rate small
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

describe('createMintService.mintForContribution split path', () => {
  let db: FakeEngineDb;
  let records: FakeRecordsPort;

  beforeEach(() => {
    db = makeFakeEngineDb();
    records = makeFakeRecordsPort();
  });

  it('splits 500 into 100 regular + 400 advance with a chained snapshot and two records', async () => {
    seedSplit(db);
    const svc = createMintService(makeDeps(db, records));

    const out = await svc.mintForContribution({
      contributionId: 'con1',
      approverId: 'admin1',
      advanceRequestId: 'adv1',
    });

    expect(out.mintEvents).toHaveLength(2);
    expect(out.memberBalanceAfter).toBe(500n);
    expect(out.totalSupplyAfter).toBe(1500n);

    const evs = mintEvents(db).sort(
      (a, b) => Number(a.ledgerSeq) - Number(b.ledgerSeq),
    );
    const [reg, adv] = evs;
    // Regular part
    expect(reg.budgetSource).toBe('current_epoch');
    expect(reg.governanceStatus).toBe('active');
    expect(reg.amount).toBe(100n);
    expect(reg.memberBalanceBefore).toBe(0n);
    expect(reg.memberBalanceAfter).toBe(100n);
    expect(reg.totalSupplyBefore).toBe(1000n);
    expect(reg.totalSupplyAfter).toBe(1100n);
    expect(reg.ledgerSeq).toBe(1);
    expect(reg.advanceRequestId).toBeNull();
    // Advance part
    expect(adv.budgetSource).toBe('next_epoch_advance');
    expect(adv.governanceStatus).toBe('pending');
    expect(adv.amount).toBe(400n);
    expect(adv.governanceActivationEpoch).toBe(2);
    expect(adv.advanceRequestId).toBe('adv1');
    expect(adv.ledgerSeq).toBe(2);
    // Snapshot chain: advance.before == regular.after
    expect(adv.memberBalanceBefore).toBe(reg.memberBalanceAfter);
    expect(adv.totalSupplyBefore).toBe(reg.totalSupplyAfter);
    expect(adv.memberBalanceAfter).toBe(500n);
    expect(adv.totalSupplyAfter).toBe(1500n);
    // active governance unchanged across the advance leg
    expect(adv.activeGovernanceBefore).toBe(100n);
    expect(adv.activeGovernanceAfter).toBe(100n);

    // Balance split across active/pending
    const [bal] = db.rows('memberTokenBalance');
    expect(bal.totalBalance).toBe(500n);
    expect(bal.activeGovernanceBalance).toBe(100n);
    expect(bal.pendingGovernanceBalance).toBe(400n);
    expect(bal.tokensEarnedCurrentEpoch).toBe(100n);
    expect(bal.tokensEarnedLifetime).toBe(500n);

    // Two public records, both submitted after the tx.
    expect(records.created).toHaveLength(2);
    expect(records.submissions).toHaveLength(2);
    expect(reg.publicRecordId).toBe('rec_1');
    expect(adv.publicRecordId).toBe('rec_2');

    // Hardening (c): the advance request is consumed exactly once -> executed.
    const [req] = db.rows('tokenAdvanceRequest');
    expect(req.status).toBe('executed');
    expect(req.approvedAmount).toBe(400n);
    expect(req.executedAt).toEqual(NOW);
  });

  it('hardening (a): rejects when advancePart exceeds the request cap (ADVANCE_CAP_EXCEEDED)', async () => {
    seedSplit(db, { advance: { requestedAmount: 300n, approvedAmount: null } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' }),
    ).rejects.toMatchObject({ code: 'ADVANCE_CAP_EXCEEDED' });
  });

  it('hardening (b): re-derived cumulative rate forcing a proposal path throws PROPOSAL_REQUIRED', async () => {
    // remaining 100, amount 300 -> advancePart 200; base 1000 -> 2000 bps -> community_proposal
    seedSplit(db, {
      contribution: { approvedTokenAmount: 300n },
      epoch: { baseMintBudget: 1000n, effectiveRegularBudget: 100n, maxAdvanceAmount: 1000n },
      advance: { requestedAmount: 200n, proposalId: null },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' }),
    ).rejects.toMatchObject({ code: 'PROPOSAL_REQUIRED' });
  });

  it('hardening (b): the community_proposal path succeeds with a recorded proposal', async () => {
    seedSplit(db, {
      contribution: { approvedTokenAmount: 300n },
      epoch: { baseMintBudget: 1000n, effectiveRegularBudget: 100n, maxAdvanceAmount: 1000n },
      advance: { requestedAmount: 200n, proposalId: 'prop1' },
    });
    await db.proposal.create({ data: { id: 'prop1', communityId: 'c1', status: 'recorded' } });
    const svc = createMintService(makeDeps(db, records));
    const out = await svc.mintForContribution({
      contributionId: 'con1',
      approverId: 'admin1',
      advanceRequestId: 'adv1',
    });
    expect(out.mintEvents).toHaveLength(2);
  });

  it('throws ADVANCE_RATE_EXCEEDED when the cumulative advance rate is system-forbidden', async () => {
    // remaining 100, amount 500 -> advancePart 400; base 1000 -> 4000 bps -> system_forbidden
    seedSplit(db, {
      epoch: { baseMintBudget: 1000n, effectiveRegularBudget: 100n, maxAdvanceAmount: 1000n },
      advance: { requestedAmount: 400n },
    });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' }),
    ).rejects.toMatchObject({ code: 'ADVANCE_RATE_EXCEEDED' });
  });

  it('throws SECOND_APPROVER_REQUIRED when the dual_admin advance lacks a distinct second approver', async () => {
    seedSplit(db, { advance: { secondApprovedBy: null } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' }),
    ).rejects.toMatchObject({ code: 'SECOND_APPROVER_REQUIRED' });
  });

  it('throws INVALID_STATUS when the advance request is not approved', async () => {
    seedSplit(db, { advance: { status: 'pending' } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS' });
  });

  it('throws INVALID_STATUS when the contribution is not covered by the advance request', async () => {
    seedSplit(db, { advance: { contributionIds: ['other'] } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATUS' });
  });

  it('throws ROLLING_ADVANCE_FORBIDDEN when prior-epoch debt is outstanding', async () => {
    seedSplit(db, { epoch: { advanceDebtFromPreviousEpoch: 50n } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' }),
    ).rejects.toMatchObject({ code: 'ROLLING_ADVANCE_FORBIDDEN' });
  });

  it('rolls the whole tx back with zero side effects when the sql advance guard blocks (0 rows)', async () => {
    // maxAdvanceAmount below advancePart forces incrementAdvancedMintedGuarded -> 0
    seedSplit(db, { epoch: { maxAdvanceAmount: 100n } });
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintForContribution({ contributionId: 'con1', approverId: 'admin1', advanceRequestId: 'adv1' }),
    ).rejects.toMatchObject({ code: 'ADVANCE_CAP_EXCEEDED' });

    // Zero side effects.
    expect(mintEvents(db)).toHaveLength(0);
    const [bal] = db.rows('memberTokenBalance');
    expect(bal.totalBalance).toBe(0n);
    const [state] = db.rows('communityTokenState');
    expect(state.currentTotalSupply).toBe(1000n);
    expect(state.ledgerSeq).toBe(0n);
    const [req] = db.rows('tokenAdvanceRequest');
    expect(req.status).toBe('approved');
    expect(records.created).toHaveLength(0);
    expect(records.submissions).toHaveLength(0);
  });
});

describe('createMintService.mintInitialAllocation', () => {
  let db: FakeEngineDb;
  let records: FakeRecordsPort;

  beforeEach(() => {
    db = makeFakeEngineDb();
    records = makeFakeRecordsPort();
    db.seedCommunity({ id: 'c1' });
    db.seedState({ communityId: 'c1', currentTotalSupply: 0n, ledgerSeq: 0n });
    db.seedPolicy({ communityId: 'c1', policyVersion: 1 });
  });

  it('seeds allocations, conserving supply and emitting one record each', async () => {
    const svc = createMintService(makeDeps(db, records));
    const out = await svc.mintInitialAllocation({
      communityId: 'c1',
      allocations: [
        { memberId: 'm1', amount: 100n },
        { memberId: 'm2', amount: 200n },
      ],
      reason: 'genesis',
      approvedBy: 'founder',
    });

    expect(out.mintEvents).toHaveLength(2);
    expect(out.totalSupplyAfter).toBe(300n);

    const evs = mintEvents(db).sort((a, b) => Number(a.ledgerSeq) - Number(b.ledgerSeq));
    expect(evs.every((e) => e.mintType === 'initial_allocation')).toBe(true);
    expect(evs.every((e) => e.budgetSource === 'current_epoch')).toBe(true);
    expect(evs.every((e) => e.governanceStatus === 'active')).toBe(true);
    expect(evs.every((e) => e.reason === 'genesis')).toBe(true);
    expect(evs.every((e) => e.approvedBy === 'founder')).toBe(true);
    expect(evs.map((e) => e.ledgerSeq)).toEqual([1, 2]);
    expect(evs.map((e) => e.amount)).toEqual([100n, 200n]);

    // Conservation: sum of amounts == supply delta.
    const total = evs.reduce((s, e) => s + (e.amount as bigint), 0n);
    const [state] = db.rows('communityTokenState');
    expect(state.currentTotalSupply).toBe(total);

    // Balances
    const balByMember = new Map(db.rows('memberTokenBalance').map((b) => [b.memberId, b]));
    expect(balByMember.get('m1')?.totalBalance).toBe(100n);
    expect(balByMember.get('m1')?.activeGovernanceBalance).toBe(100n);
    expect(balByMember.get('m1')?.tokensEarnedLifetime).toBe(100n);
    expect(balByMember.get('m2')?.totalBalance).toBe(200n);

    expect(records.created).toHaveLength(2);
    expect(records.submissions).toHaveLength(2);
  });

  it('rejects a second seeding attempt (ALREADY_MINTED)', async () => {
    const svc = createMintService(makeDeps(db, records));
    await svc.mintInitialAllocation({
      communityId: 'c1',
      allocations: [{ memberId: 'm1', amount: 100n }],
      reason: 'genesis',
      approvedBy: 'founder',
    });
    await expect(
      svc.mintInitialAllocation({
        communityId: 'c1',
        allocations: [{ memberId: 'm2', amount: 50n }],
        reason: 'genesis-2',
        approvedBy: 'founder',
      }),
    ).rejects.toMatchObject({ code: 'ALREADY_MINTED' });
  });

  it('throws VALIDATION_ERROR on a non-positive allocation amount', async () => {
    const svc = createMintService(makeDeps(db, records));
    await expect(
      svc.mintInitialAllocation({
        communityId: 'c1',
        allocations: [{ memberId: 'm1', amount: 0n }],
        reason: 'genesis',
        approvedBy: 'founder',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
