import { beforeEach, describe, expect, it } from 'vitest';

import { createAdvanceService } from './advance-service';
import { EngineError } from './errors';
import {
  makeFakeBuildEnvelope,
  makeFakeEngineDb,
  makeFakeRecordsPort,
  type FakeEngineDb,
  type FakeRecordsPort,
} from './testing/fake-engine-db';
import type { EngineDeps } from './types';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const C = 'c1';

interface Harness {
  db: FakeEngineDb;
  records: FakeRecordsPort;
  svc: ReturnType<typeof createAdvanceService>;
}

interface HarnessOpts {
  memberRole?: string;
  advancedMinted?: bigint;
  advanceDebt?: bigint;
  effectiveRegularBudget?: bigint;
  maxAdvanceAmount?: bigint;
  maxAdvanceRateBps?: number;
  epochStatus?: string;
}

/** Baseline: normal budget exhausted (advance is the only path), base 10_000,
 *  supply 100_000, policy maxAdvanceRateBps 2500. */
function harness(opts: HarnessOpts = {}): Harness {
  const db = makeFakeEngineDb();
  const records = makeFakeRecordsPort();
  db.seedCommunity({ id: C });
  db.seedMember({ id: 'm1', communityId: C, role: opts.memberRole ?? 'member' });
  db.seedState({ communityId: C, currentTotalSupply: 100_000n, ledgerSeq: 0n });
  db.seedPolicy({ communityId: C, maxAdvanceRateBps: opts.maxAdvanceRateBps ?? 2500, policyVersion: 1 });
  db.seedEpoch({
    id: 'e1',
    communityId: C,
    epochNumber: 1,
    baseMintBudget: 10_000n,
    advancedMintedAmount: opts.advancedMinted ?? 0n,
    advanceDebtFromPreviousEpoch: opts.advanceDebt ?? 0n,
    effectiveRegularBudget: opts.effectiveRegularBudget ?? 0n,
    regularMintedAmount: 0n,
    maxAdvanceAmount: opts.maxAdvanceAmount ?? 2_500n,
    status: opts.epochStatus ?? 'active',
  });
  db.seedBalance({ communityId: C, memberId: 'm1' });
  const deps: EngineDeps = { db, records, buildEnvelope: makeFakeBuildEnvelope(), now: () => NOW };
  return { db, records, svc: createAdvanceService(deps) };
}

/** Seed an already-approved advance request row ready for execute(). */
function seedApproved(db: FakeEngineDb, over: Record<string, unknown> = {}): string {
  const row = db.seedAdvanceRequest({
    communityId: C, epochId: 'e1', memberId: 'm1', requestedAmount: 500n, approvedAmount: null,
    advanceRateBps: 500, reason: 'help', status: 'approved', relatedParty: false,
    requestedBy: 'admin1', secondApprovedBy: 'admin2', proposalId: null, ...over,
  });
  return row.id as string;
}

async function seedProposal(db: FakeEngineDb, id: string, status: string): Promise<void> {
  await db.proposal.create({ data: { id, communityId: C, title: 't', type: 'budget_advance', status } });
}

const req = (amount: bigint, extra: Record<string, unknown> = {}) => ({
  communityId: C, memberId: 'm1', amount, requestedBy: 'admin1', ...extra,
});

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toBeInstanceOf(EngineError);
  await expect(p).rejects.toMatchObject({ code });
}

describe('advance-service · createRequest cumulative-rate threshold table', () => {
  it('0 advance (standard_rule) → CONFLICT', async () => {
    await expectCode(harness().svc.createRequest(req(0n)), 'CONFLICT');
  });

  it('800 bps (dual_admin) → pending_second_approval, advanceRateBps recorded', async () => {
    const { db, svc } = harness();
    const out = await svc.createRequest(req(800n));
    expect(out.status).toBe('pending_second_approval');
    const row = db.rows('tokenAdvanceRequest').find((r) => r.id === out.requestId);
    expect(row?.advanceRateBps).toBe(800);
    expect(row?.relatedParty).toBe(false);
  });

  it('continuous 900+900 relative to 10000 → second forces community_proposal', async () => {
    // First 900 on a fresh epoch is dual_admin.
    expect((await harness().svc.createRequest(req(900n))).status).toBe('pending_second_approval');
    // With 900 already advanced, another 900 → cumulative 1800 bps → proposal.
    expect((await harness({ advancedMinted: 900n }).svc.createRequest(req(900n))).status).toBe('pending_proposal');
  });

  it('2600 bps → system_forbidden → ADVANCE_RATE_EXCEEDED', async () => {
    await expectCode(harness().svc.createRequest(req(2600n)), 'ADVANCE_RATE_EXCEEDED');
  });

  it('advanceRateBps clamps to 2500 when cumulative sits just under forbidden', async () => {
    const { db, svc } = harness({ advancedMinted: 2000n }); // (2000+500)/10000 = 2500 → proposal
    const out = await svc.createRequest(req(500n));
    const row = db.rows('tokenAdvanceRequest').find((r) => r.id === out.requestId);
    expect(row?.advanceRateBps).toBe(2500);
  });

  it('related-party target (manager) routes a small advance to community_proposal', async () => {
    const out = await harness({ memberRole: 'manager' }).svc.createRequest(req(300n));
    expect(out.status).toBe('pending_proposal');
  });

  it('isSpecialNoContribution forces community_proposal even at cumulative 0', async () => {
    const out = await harness().svc.createRequest(req(0n, { isSpecialNoContribution: true }));
    expect(out.status).toBe('pending_proposal');
  });

  it('persists caller contributionIds so the split-mint recovery path is reachable', async () => {
    const { db, svc } = harness();
    const out = await svc.createRequest(req(800n, { contributionIds: ['con_1', 'con_2'] }));
    const row = db.rows('tokenAdvanceRequest').find((r) => r.id === out.requestId);
    expect(row?.contributionIds).toEqual(['con_1', 'con_2']);
  });

  it('defaults contributionIds to [] when the caller omits them', async () => {
    const { db, svc } = harness();
    const out = await svc.createRequest(req(800n));
    const row = db.rows('tokenAdvanceRequest').find((r) => r.id === out.requestId);
    expect(row?.contributionIds).toEqual([]);
  });

  it('no active epoch → EPOCH_NOT_ACTIVE', async () => {
    await expectCode(harness({ epochStatus: 'closed' }).svc.createRequest(req(800n)), 'EPOCH_NOT_ACTIVE');
  });

  it('outstanding debt from previous epoch → ROLLING_ADVANCE_FORBIDDEN', async () => {
    await expectCode(harness({ advanceDebt: 100n }).svc.createRequest(req(800n)), 'ROLLING_ADVANCE_FORBIDDEN');
  });
});

describe('advance-service · secondApprove (dual-admin)', () => {
  it('approves a pending_second_approval by a distinct admin', async () => {
    const { db, svc } = harness();
    const { requestId } = await svc.createRequest(req(800n));
    const out = await svc.secondApprove(requestId, 'admin2');
    expect(out.status).toBe('approved');
    const row = db.rows('tokenAdvanceRequest').find((r) => r.id === requestId);
    expect(row?.secondApprovedBy).toBe('admin2');
    expect(row?.approvedAt).toBeInstanceOf(Date);
  });

  it('self-approval (approver === requestedBy) → FORBIDDEN', async () => {
    const { svc } = harness();
    const { requestId } = await svc.createRequest(req(800n));
    await expectCode(svc.secondApprove(requestId, 'admin1'), 'FORBIDDEN');
  });

  it('secondApprove on a pending_proposal request → INVALID_STATUS', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { status: 'pending_proposal', secondApprovedBy: null });
    await expectCode(svc.secondApprove(id, 'admin2'), 'INVALID_STATUS');
  });

  it('idempotent: already approved with same secondApprovedBy → returns current', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { secondApprovedBy: 'admin2' });
    expect((await svc.secondApprove(id, 'admin2')).status).toBe('approved');
  });

  it('approved with a different second approver → INVALID_STATUS', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { secondApprovedBy: 'admin2' });
    await expectCode(svc.secondApprove(id, 'adminX'), 'INVALID_STATUS');
  });
});

describe('advance-service · attachProposal', () => {
  it('attaches a proposal to a pending_proposal request', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { status: 'pending_proposal', secondApprovedBy: null });
    expect((await svc.attachProposal(id, 'p1')).status).toBe('pending_proposal');
    expect(db.rows('tokenAdvanceRequest').find((r) => r.id === id)?.proposalId).toBe('p1');
  });

  it('re-attaching the same proposal id is idempotent', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { status: 'pending_proposal', secondApprovedBy: null });
    await svc.attachProposal(id, 'p1');
    expect((await svc.attachProposal(id, 'p1')).status).toBe('pending_proposal');
  });

  it('attaching a different proposal id → CONFLICT', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { status: 'pending_proposal', secondApprovedBy: null, proposalId: 'p1' });
    await expectCode(svc.attachProposal(id, 'p2'), 'CONFLICT');
  });

  it('attach on a non-pending_proposal request → INVALID_STATUS', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { status: 'pending_second_approval', secondApprovedBy: null });
    await expectCode(svc.attachProposal(id, 'p1'), 'INVALID_STATUS');
  });
});

describe('advance-service · reject', () => {
  it('rejects a pending_second_approval', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { status: 'pending_second_approval', secondApprovedBy: null });
    expect((await svc.reject(id, 'admin2')).status).toBe('rejected');
  });

  it('rejects a pending_proposal', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { status: 'pending_proposal', secondApprovedBy: null });
    expect((await svc.reject(id, 'admin2')).status).toBe('rejected');
  });

  it('re-rejecting a rejected request is an idempotent no-op', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { status: 'rejected', secondApprovedBy: null });
    expect((await svc.reject(id, 'admin2')).status).toBe('rejected');
  });

  it('rejecting an approved request → INVALID_STATUS', async () => {
    const { db, svc } = harness();
    await expectCode(svc.reject(seedApproved(db), 'admin2'), 'INVALID_STATUS');
  });
});

describe('advance-service · execute (§6.4 fund transaction)', () => {
  it('mints an advance and keeps four ledgers consistent', async () => {
    const { db, records, svc } = harness();
    const id = seedApproved(db, { requestedAmount: 500n });
    const outcome = await svc.execute({ requestId: id });

    expect(outcome.memberBalanceAfter).toBe(500n);
    expect(outcome.totalSupplyAfter).toBe(100_500n);
    expect(outcome.mintEvents).toHaveLength(1);
    expect(outcome.mintEvents[0].budgetSource).toBe('next_epoch_advance');
    expect(outcome.mintEvents[0].governanceStatus).toBe('pending');

    // (1) balance: total += amount, pending += amount, active unchanged.
    const bal = db.rows('memberTokenBalance').find((r) => r.memberId === 'm1');
    expect(bal?.totalBalance).toBe(500n);
    expect(bal?.pendingGovernanceBalance).toBe(500n);
    expect(bal?.activeGovernanceBalance).toBe(0n);
    // (2) supply increased.
    expect(db.rows('communityTokenState')[0].currentTotalSupply).toBe(100_500n);
    // (3) epoch advancedMinted increased.
    expect(db.rows('tokenEpoch')[0].advancedMintedAmount).toBe(500n);
    // (4) mint event snapshots + sourcing key.
    const mint = db.rows('tokenMintEvent')[0];
    expect(mint.mintType).toBe('special_reward');
    expect(mint.advanceRequestId).toBe(id);
    expect(mint.governanceActivationEpoch).toBe(2);
    expect(mint.approvedBy).toBe('admin1');
    expect(mint.secondApprovedBy).toBe('admin2');
    expect(mint.ledgerSeq).toBe(1);
    // request row terminal.
    const r = db.rows('tokenAdvanceRequest').find((x) => x.id === id);
    expect(r?.status).toBe('executed');
    expect(r?.approvedAmount).toBe(500n);
    expect(r?.executedAt).toBeInstanceOf(Date);
    // only the advance_mint record is enqueued (budget_advance is DB-only).
    expect(records.submissions).toHaveLength(1);
  });

  it('is idempotent via advanceRequestId re-lookup (no double accounting)', async () => {
    const { db, records, svc } = harness();
    const id = seedApproved(db, { requestedAmount: 500n });
    const first = await svc.execute({ requestId: id });
    const second = await svc.execute({ requestId: id });

    expect(second.mintEvents[0].id).toBe(first.mintEvents[0].id);
    expect(second.totalSupplyAfter).toBe(first.totalSupplyAfter);
    expect(second.memberBalanceAfter).toBe(first.memberBalanceAfter);
    // no new mint event, no new records, no re-enqueue.
    expect(db.rows('tokenMintEvent')).toHaveLength(1);
    expect(db.rows('publicRecord')).toHaveLength(1); // budget_advance (DB-only)
    expect(records.created).toHaveLength(1); // advance_mint (chain-eligible)
    expect(records.submissions).toHaveLength(1);
    expect(db.rows('communityTokenState')[0].currentTotalSupply).toBe(100_500n);
  });

  it('supply increases while activeGovernance stays flat', async () => {
    const { db, svc } = harness();
    await svc.execute({ requestId: seedApproved(db, { requestedAmount: 700n }) });
    const bal = db.rows('memberTokenBalance').find((r) => r.memberId === 'm1');
    expect(bal?.activeGovernanceBalance).toBe(0n);
    expect(bal?.pendingGovernanceBalance).toBe(700n);
    expect(db.rows('communityTokenState')[0].currentTotalSupply).toBe(100_700n);
  });

  it('two public records; budget_advance is recorded, chain-ineligible, not enqueued', async () => {
    const { db, records, svc } = harness();
    const id = seedApproved(db, { requestedAmount: 500n });
    await svc.execute({ requestId: id });

    // budget_advance is the DB-only record in the publicRecord table.
    const recs = db.rows('publicRecord');
    expect(recs).toHaveLength(1);
    const dbOnly = recs[0];
    expect(dbOnly.recordType).toBe('budget_advance');
    expect(dbOnly.status).toBe('recorded');
    expect(dbOnly.chainEligible).toBe(false);
    // advance_mint is the chain-eligible record held by the RecordsPort.
    expect(records.created).toHaveLength(1);
    const chainRec = records.created[0];
    // only the advance_mint record was enqueued; the DB-only id never was.
    expect(records.submissions).toEqual([chainRec.id]);
    expect(records.submissions).not.toContain(dbOnly.id);
    // backfills.
    expect(db.rows('tokenAdvanceRequest').find((r) => r.id === id)?.publicRecordId).toBe(dbOnly.id);
    expect(db.rows('tokenMintEvent')[0].publicRecordId).toBe(chainRec.id);
  });

  it('proposal path: unrecorded proposal → PROPOSAL_REQUIRED', async () => {
    const { db, svc } = harness({ advancedMinted: 1500n }); // (1500+500)/10000 = 2000 > 1000 → proposal
    seedApproved(db, { id: 'req_prop', requestedAmount: 500n, advanceRateBps: 2000, proposalId: 'p1', secondApprovedBy: null });
    await seedProposal(db, 'p1', 'active');
    await expectCode(svc.execute({ requestId: 'req_prop' }), 'PROPOSAL_REQUIRED');
  });

  it('proposal path: recorded proposal → executes', async () => {
    const { db, svc } = harness({ advancedMinted: 1500n });
    seedApproved(db, { id: 'req_prop2', requestedAmount: 500n, advanceRateBps: 2000, proposalId: 'p1', secondApprovedBy: null });
    await seedProposal(db, 'p1', 'recorded');
    expect((await svc.execute({ requestId: 'req_prop2' })).mintEvents).toHaveLength(1);
    expect(db.rows('tokenEpoch')[0].advancedMintedAmount).toBe(2000n);
  });

  it('missing proposalId when proposal is required → PROPOSAL_REQUIRED', async () => {
    const { db, svc } = harness({ advancedMinted: 1500n });
    const id = seedApproved(db, { requestedAmount: 500n, advanceRateBps: 2000, proposalId: null, secondApprovedBy: null });
    await expectCode(svc.execute({ requestId: id }), 'PROPOSAL_REQUIRED');
  });

  it('dual-admin path missing distinct second approver → SECOND_APPROVER_REQUIRED', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { requestedAmount: 500n, secondApprovedBy: null });
    await expectCode(svc.execute({ requestId: id }), 'SECOND_APPROVER_REQUIRED');
  });

  it('second approver equal to requester → SECOND_APPROVER_REQUIRED', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { requestedAmount: 500n, secondApprovedBy: 'admin1' });
    await expectCode(svc.execute({ requestId: id }), 'SECOND_APPROVER_REQUIRED');
  });

  it('non-approved status → INVALID_STATUS', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { status: 'pending_second_approval', secondApprovedBy: null });
    await expectCode(svc.execute({ requestId: id }), 'INVALID_STATUS');
  });

  it('epoch no longer active at execute → EPOCH_NOT_ACTIVE', async () => {
    const { db, svc } = harness({ epochStatus: 'closed' });
    await expectCode(svc.execute({ requestId: seedApproved(db, { requestedAmount: 500n }) }), 'EPOCH_NOT_ACTIVE');
  });

  it('regular budget sufficient → CONFLICT (should have used normal mint)', async () => {
    const { db, svc } = harness({ effectiveRegularBudget: 10_000n });
    await expectCode(svc.execute({ requestId: seedApproved(db, { requestedAmount: 500n }) }), 'CONFLICT');
  });

  it('outstanding debt at execute → ROLLING_ADVANCE_FORBIDDEN', async () => {
    const { db, svc } = harness({ advanceDebt: 50n });
    await expectCode(svc.execute({ requestId: seedApproved(db, { requestedAmount: 500n }) }), 'ROLLING_ADVANCE_FORBIDDEN');
  });

  it('cumulative recheck beyond policy cap → ADVANCE_RATE_EXCEEDED', async () => {
    // (2400+500)/10000 = 2900 > 2500 policy cap; maxAdvanceAmount high so guard is not the blocker.
    const { db, svc } = harness({ advancedMinted: 2400n, maxAdvanceRateBps: 2500, maxAdvanceAmount: 100_000n });
    const id = seedApproved(db, { requestedAmount: 500n, advanceRateBps: 2500, proposalId: 'p1', secondApprovedBy: null });
    await seedProposal(db, 'p1', 'recorded');
    await expectCode(svc.execute({ requestId: id }), 'ADVANCE_RATE_EXCEEDED');
  });

  it('epoch advance cap guard blocks the SQL update → ADVANCE_CAP_EXCEEDED', async () => {
    // rate cap passes (maxAdvanceRateBps high) but epoch maxAdvanceAmount is too small.
    const { db, svc } = harness({ maxAdvanceRateBps: 10_000, maxAdvanceAmount: 100n });
    const id = seedApproved(db, { requestedAmount: 500n });
    await expectCode(svc.execute({ requestId: id }), 'ADVANCE_CAP_EXCEEDED');
    // rolled back: no mint, no supply change.
    expect(db.rows('tokenMintEvent')).toHaveLength(0);
    expect(db.rows('communityTokenState')[0].currentTotalSupply).toBe(100_000n);
  });

  it('unknown request id → NOT_FOUND', async () => {
    await expectCode(harness().svc.execute({ requestId: 'nope' }), 'NOT_FOUND');
  });

  it('concurrency: an approved request that already minted replays instead of double-minting', async () => {
    const { db, records, svc } = harness();
    const id = seedApproved(db, { requestedAmount: 500n });
    // A rival transaction already committed its advance mint (keyed by
    // advanceRequestId) while this snapshot still observes status 'approved'.
    // The post-lock guard must replay that mint, never mint a second time.
    await db.tokenMintEvent.create({
      data: {
        id: 'mint_rival', communityId: C, memberId: 'm1', advanceRequestId: id,
        amount: 500n, governanceStatus: 'pending', publicRecordId: 'rec_rival',
        memberBalanceAfter: 500n, totalSupplyAfter: 100_500n,
      },
    });
    const outcome = await svc.execute({ requestId: id });
    expect(outcome.mintEvents[0].id).toBe('mint_rival');
    expect(outcome.totalSupplyAfter).toBe(100_500n);
    // No second mint, no supply mutation, no new chain records / submissions.
    expect(db.rows('tokenMintEvent')).toHaveLength(1);
    expect(db.rows('communityTokenState')[0].currentTotalSupply).toBe(100_000n);
    expect(records.created).toHaveLength(0);
    expect(records.submissions).toHaveLength(0);
  });

  it('§6.2 hard cap: cumulative > 2500 bps is forbidden even when the policy cap is laxer', async () => {
    // Policy permits 10000 bps, but §6.2 forbids cumulative advance beyond 2500 bps.
    const { db, svc } = harness({ advancedMinted: 2000n, maxAdvanceRateBps: 10_000, maxAdvanceAmount: 100_000n });
    const id = seedApproved(db, { requestedAmount: 2000n, advanceRateBps: 2500, proposalId: 'phc', secondApprovedBy: null });
    await seedProposal(db, 'phc', 'recorded'); // (2000+2000)/10000 = 4000 bps
    await expectCode(svc.execute({ requestId: id }), 'ADVANCE_RATE_EXCEEDED');
  });

  it('special-no-contribution executes via its recorded proposal without a second approver', async () => {
    // A special mint takes the pending_proposal route at any bps; at execute it is
    // authorized by its recorded proposal, never dead-locked on a second approver.
    const { db, svc } = harness();
    const id = seedApproved(db, { requestedAmount: 500n, proposalId: 'psp', secondApprovedBy: null });
    await seedProposal(db, 'psp', 'recorded');
    const outcome = await svc.execute({ requestId: id });
    expect(outcome.mintEvents).toHaveLength(1);
    expect(db.rows('tokenEpoch')[0].advancedMintedAmount).toBe(500n);
  });
});

describe('advance-service · six-state illegal transitions', () => {
  let db: FakeEngineDb;
  let svc: ReturnType<typeof createAdvanceService>;

  beforeEach(() => {
    const h = harness();
    db = h.db;
    svc = h.svc;
  });

  it('executed → reject is illegal (INVALID_STATUS)', async () => {
    await expectCode(svc.reject(seedApproved(db, { status: 'executed' }), 'admin2'), 'INVALID_STATUS');
  });

  it('executed → secondApprove is illegal (INVALID_STATUS)', async () => {
    await expectCode(svc.secondApprove(seedApproved(db, { status: 'executed' }), 'admin2'), 'INVALID_STATUS');
  });

  it('draft → secondApprove is illegal (INVALID_STATUS)', async () => {
    await expectCode(
      svc.secondApprove(seedApproved(db, { status: 'draft', secondApprovedBy: null }), 'admin2'),
      'INVALID_STATUS',
    );
  });

  it('rejected → attachProposal is illegal (INVALID_STATUS)', async () => {
    await expectCode(
      svc.attachProposal(seedApproved(db, { status: 'rejected', secondApprovedBy: null }), 'p9'),
      'INVALID_STATUS',
    );
  });
});

describe('advance-service · execute cross-service lock ordering', () => {
  // Deadlock avoidance: mint-service and reversal-service both lock state BEFORE
  // balance (epoch -> state -> balance); execute() must match or a concurrent
  // advance-execute + token-reversal deadlocks (40P01). The fake DB has no real
  // row locks, so we assert the FOR UPDATE acquisition order instead.
  it('acquires epoch then state then balance', async () => {
    const { db, svc } = harness();
    const id = seedApproved(db, { requestedAmount: 500n });
    const order: string[] = [];
    const original = db.$queryRaw.bind(db);
    (db as unknown as { $queryRaw: typeof db.$queryRaw }).$queryRaw =
      (async <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
        const sql = strings.join(' ');
        if (sql.includes('FOR UPDATE')) {
          if (sql.includes('"CommunityTokenState"')) order.push('state');
          else if (sql.includes('"MemberTokenBalance"')) order.push('balance');
          else if (sql.includes('"TokenEpoch"')) order.push('epoch');
        }
        return original(strings, ...values) as Promise<T>;
      }) as typeof db.$queryRaw;

    await svc.execute({ requestId: id });

    expect(order).toEqual(['epoch', 'state', 'balance']);
  });
});
