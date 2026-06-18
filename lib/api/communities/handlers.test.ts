import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AuthContext } from '../core/auth';

import {
  handleGetTokenPolicy,
  handleCreatePolicyProposal,
  handleListPolicyVersions,
  handleListEpochs,
  handleGetLedger,
  LEDGER_FILTERS,
  type CommunitiesDeps,
} from './handlers';

// ---- Fakes -----------------------------------------------------------------

interface FakeDb {
  communityTokenPolicy: { findUnique: ReturnType<typeof vi.fn> };
  communityTokenState: { findUnique: ReturnType<typeof vi.fn> };
  tokenPolicyVersion: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  tokenEpoch: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  tokenMintEvent: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  tokenReversalEvent: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  publicRecord: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
}

function makeDb(): FakeDb {
  return {
    communityTokenPolicy: { findUnique: vi.fn() },
    communityTokenState: { findUnique: vi.fn() },
    tokenPolicyVersion: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    tokenEpoch: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    tokenMintEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    tokenReversalEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    publicRecord: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

function makeDeps(db: FakeDb, over: Partial<CommunitiesDeps> = {}): CommunitiesDeps {
  return {
    db: db as unknown as CommunitiesDeps['db'],
    proposal: { create: vi.fn().mockResolvedValue({ proposalId: 'prop_1' }) },
    authorize: () => true,
    ...over,
  };
}

const adminCtx: AuthContext = { actorId: 'admin_1', isAdmin: true, isInternal: true };
const guestCtx: AuthContext = { actorId: null, isAdmin: false, isInternal: false };

function policyRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pol_1',
    communityId: 'c_1',
    tokenName: 'Axo',
    tokenSymbol: 'AXO',
    initialSupply: 1000n,
    currentTotalSupply: 5000n,
    epochDurationDays: 30,
    monthlyInflationRateBps: 200,
    maxAdvanceRateBps: 1000,
    memberMintCapRateBps: 1000,
    policyVersion: 3,
    effectiveEpoch: 2,
    rules: [],
    isTransferable: false,
    pendingPolicyVersionId: null,
    pendingPolicyEffectiveEpoch: null,
    ...over,
  };
}

function mintRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'mint_1',
    communityId: 'c_1',
    memberId: 'm_1',
    epochId: 'e_1',
    epochNumber: 1,
    mintType: 'contribution',
    budgetSource: 'current_epoch',
    amount: 100n,
    governanceActivationEpoch: null,
    memberBalanceBefore: 0n,
    memberBalanceAfter: 100n,
    totalSupplyBefore: 4900n,
    totalSupplyAfter: 5000n,
    tokenPolicyVersion: 3,
    reason: 'contribution',
    approvedBy: 'admin_1',
    publicRecordId: 'pr_1',
    governanceStatus: 'active',
    ownershipPercentageBefore: 0,
    ownershipPercentageAfter: 2,
    contributionId: 'con_1',
    proposalId: null,
    relatedParty: false,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    ...over,
  };
}

function reversalRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'rev_1',
    communityId: 'c_1',
    memberId: 'm_2',
    originalMintEventId: 'mint_9',
    amount: 50n,
    reason: 'entry_error',
    totalBalanceAfter: 10n,
    totalSupplyAfter: 4950n,
    approvedBy: 'admin_1',
    publicRecordId: 'pr_2',
    activeGovernanceBalanceAfter: 10n,
    pendingGovernanceBalanceAfter: 0n,
    proposalId: null,
    createdAt: new Date('2026-07-21T00:00:00.000Z'),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- GET token-policy ------------------------------------------------------

describe('handleGetTokenPolicy', () => {
  it('200 returns policy with currentTotalSupply from CommunityTokenState (bigint as string, bps integer)', async () => {
    const db = makeDb();
    db.communityTokenPolicy.findUnique.mockResolvedValue(policyRow());
    db.communityTokenState.findUnique.mockResolvedValue({ currentTotalSupply: 7777n });
    const res = await handleGetTokenPolicy(makeDeps(db), { communityId: 'c_1' });

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect(data.currentTotalSupply).toBe('7777');
    expect(data.monthlyInflationRateBps).toBe(200);
    expect(typeof data.monthlyInflationRateBps).toBe('number');
    expect(data.pendingVersion).toBeNull();
    expect(db.communityTokenState.findUnique).toHaveBeenCalledWith({
      where: { communityId: 'c_1' },
    });
  });

  it('200 includes a pending version summary when pendingPolicyVersionId is set', async () => {
    const db = makeDb();
    db.communityTokenPolicy.findUnique.mockResolvedValue(
      policyRow({ pendingPolicyVersionId: 'ver_9' }),
    );
    db.communityTokenState.findUnique.mockResolvedValue({ currentTotalSupply: 100n });
    db.tokenPolicyVersion.findUnique.mockResolvedValue({
      version: 4,
      effectiveEpoch: 3,
      monthlyInflationRateBps: 150,
      maxAdvanceRateBps: 800,
      memberMintCapRateBps: 900,
    });
    const res = await handleGetTokenPolicy(makeDeps(db), { communityId: 'c_1' });

    expect(res.status).toBe(200);
    const data = res.body.data as { pendingVersion: Record<string, unknown> };
    expect(data.pendingVersion).toEqual({
      version: 4,
      effectiveEpoch: 3,
      monthlyInflationRateBps: 150,
      maxAdvanceRateBps: 800,
      memberMintCapRateBps: 900,
    });
    expect(db.tokenPolicyVersion.findUnique).toHaveBeenCalledWith({ where: { id: 'ver_9' } });
  });

  it('404 when no policy exists for the community', async () => {
    const db = makeDb();
    db.communityTokenPolicy.findUnique.mockResolvedValue(null);
    const res = await handleGetTokenPolicy(makeDeps(db), { communityId: 'ghost' });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});

// ---- POST token-policy/proposals -------------------------------------------

describe('handleCreatePolicyProposal', () => {
  it('201 delegates to proposal.create with a token_policy_change payload', async () => {
    const db = makeDb();
    const deps = makeDeps(db);
    const res = await handleCreatePolicyProposal(deps, {
      communityId: 'c_1',
      body: { monthlyInflationRateBps: 250, maxAdvanceRateBps: 1200, memberMintCapRateBps: 900 },
      auth: adminCtx,
    });

    expect(res.status).toBe(201);
    const data = res.body.data as { proposalId: string; message: string };
    expect(data.proposalId).toBe('prop_1');
    expect(typeof data.message).toBe('string');
    expect(deps.proposal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 'c_1',
        type: 'token_policy_change',
        options: [{ id: 'approve' }, { id: 'reject' }],
        metadata: {
          policyChangePayload: {
            monthlyInflationRateBps: 250,
            maxAdvanceRateBps: 1200,
            memberMintCapRateBps: 900,
          },
        },
      }),
    );
  });

  it('passes optional rules through to the policyChangePayload', async () => {
    const db = makeDb();
    const deps = makeDeps(db);
    await handleCreatePolicyProposal(deps, {
      communityId: 'c_1',
      body: {
        monthlyInflationRateBps: 100,
        maxAdvanceRateBps: 100,
        memberMintCapRateBps: 100,
        rules: [{ id: 'r1' }],
      },
      auth: adminCtx,
    });
    const arg = (deps.proposal.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.metadata.policyChangePayload.rules).toEqual([{ id: 'r1' }]);
  });

  it('403 FORBIDDEN when the caller is not an admin, without touching proposal.create', async () => {
    const db = makeDb();
    const deps = makeDeps(db, { authorize: () => false });
    const res = await handleCreatePolicyProposal(deps, {
      communityId: 'c_1',
      body: { monthlyInflationRateBps: 1, maxAdvanceRateBps: 1, memberMintCapRateBps: 1 },
      auth: guestCtx,
    });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
    expect(deps.proposal.create).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR when a bps field is missing or non-integer', async () => {
    const db = makeDb();
    const deps = makeDeps(db);
    const res = await handleCreatePolicyProposal(deps, {
      communityId: 'c_1',
      body: { monthlyInflationRateBps: 1.5, maxAdvanceRateBps: 1 },
      auth: adminCtx,
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(deps.proposal.create).not.toHaveBeenCalled();
  });
});

// ---- GET token-policy/versions ---------------------------------------------

describe('handleListPolicyVersions', () => {
  it('200 lists versions scoped to the community policy id, desc, with meta and publicRecordId', async () => {
    const db = makeDb();
    db.communityTokenPolicy.findUnique.mockResolvedValue(policyRow({ id: 'pol_1' }));
    db.tokenPolicyVersion.findMany.mockResolvedValue([
      {
        id: 'v2',
        version: 2,
        effectiveEpoch: 2,
        monthlyInflationRateBps: 150,
        maxAdvanceRateBps: 800,
        memberMintCapRateBps: 900,
        rules: [],
        proposalId: 'p2',
        publicRecordId: 'pr_v2',
        createdAt: new Date('2026-07-10T00:00:00.000Z'),
      },
    ]);
    db.tokenPolicyVersion.count.mockResolvedValue(5);
    const res = await handleListPolicyVersions(makeDeps(db), {
      communityId: 'c_1',
      page: 2,
      limit: 10,
    });

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 5, page: 2, limit: 10 });
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows[0].publicRecordId).toBe('pr_v2');
    expect(rows[0].monthlyInflationRateBps).toBe(150);
    expect(db.tokenPolicyVersion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { policyId: 'pol_1' },
        orderBy: { version: 'desc' },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('404 when the community has no policy', async () => {
    const db = makeDb();
    db.communityTokenPolicy.findUnique.mockResolvedValue(null);
    const res = await handleListPolicyVersions(makeDeps(db), {
      communityId: 'ghost',
      page: 1,
      limit: 20,
    });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});

// ---- GET token-epochs ------------------------------------------------------

describe('handleListEpochs', () => {
  it('200 lists epochs desc by epochNumber with bigint strings, publicRecordId, and meta', async () => {
    const db = makeDb();
    db.tokenEpoch.findMany.mockResolvedValue([
      {
        id: 'e_2',
        communityId: 'c_1',
        epochNumber: 2,
        openingSupply: 5000n,
        inflationRateBps: 200,
        baseMintBudget: 100n,
        advanceDebtFromPreviousEpoch: 0n,
        regularMintedAmount: 40n,
        advancedMintedAmount: 0n,
        status: 'active',
        startTime: new Date('2026-07-01T00:00:00.000Z'),
        endTime: null,
        effectiveRegularBudget: 100n,
        maxAdvanceAmount: 10n,
        unusedRegularBudget: 60n,
        closedAt: null,
        publicRecordId: 'pr_e2',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);
    db.tokenEpoch.count.mockResolvedValue(2);
    const res = await handleListEpochs(makeDeps(db), { communityId: 'c_1', page: 1, limit: 20 });

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20 });
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows[0].openingSupply).toBe('5000');
    expect(rows[0].inflationRateBps).toBe(200);
    expect(rows[0].publicRecordId).toBe('pr_e2');
    expect(db.tokenEpoch.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1' },
        orderBy: { epochNumber: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
  });
});

// ---- GET token-ledger ------------------------------------------------------

describe('handleGetLedger', () => {
  it('400 on an illegal filter value', async () => {
    const db = makeDb();
    const res = await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'bogus',
      page: 1,
      limit: 20,
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('all: merges mint + reversal streams ordered by createdAt desc', async () => {
    const db = makeDb();
    db.tokenMintEvent.findMany.mockResolvedValue([mintRow()]);
    db.tokenMintEvent.count.mockResolvedValue(1);
    db.tokenReversalEvent.findMany.mockResolvedValue([reversalRow()]);
    db.tokenReversalEvent.count.mockResolvedValue(1);
    db.publicRecord.findMany.mockResolvedValue([
      { id: 'pr_1', status: 'verified', txHash: '0xaa' },
      { id: 'pr_2', status: 'pending', txHash: null },
    ]);
    const res = await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'all',
      page: 1,
      limit: 20,
    });

    expect(res.status).toBe(200);
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    // reversal (2026-07-21) is newer than mint (2026-07-20) -> first.
    expect(rows[0].eventType).toBe('reversal');
    expect(rows[1].eventType).toBe('mint');
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20 });
    // DB-side pagination: each stream is fetched with a bounded take (skip+limit),
    // never the full ledger.
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    );
    expect(db.tokenReversalEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    );
  });

  it('regular_mint filters mint by contribution + current_epoch and skips reversals', async () => {
    const db = makeDb();
    await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'regular_mint',
      page: 1,
      limit: 20,
    });
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1', mintType: 'contribution', budgetSource: 'current_epoch' },
      }),
    );
    expect(db.tokenReversalEvent.findMany).not.toHaveBeenCalled();
  });

  it('advance_mint filters mint by next_epoch_advance budgetSource', async () => {
    const db = makeDb();
    await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'advance_mint',
      page: 1,
      limit: 20,
    });
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1', budgetSource: 'next_epoch_advance' },
      }),
    );
    expect(db.tokenReversalEvent.findMany).not.toHaveBeenCalled();
  });

  it('initial_allocation filters mint by mintType', async () => {
    const db = makeDb();
    await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'initial_allocation',
      page: 1,
      limit: 20,
    });
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1', mintType: 'initial_allocation' },
      }),
    );
  });

  it('special_reward filters mint by mintType', async () => {
    const db = makeDb();
    await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'special_reward',
      page: 1,
      limit: 20,
    });
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1', mintType: 'special_reward' },
      }),
    );
  });

  it('related_party filters mint by relatedParty=true', async () => {
    const db = makeDb();
    await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'related_party',
      page: 1,
      limit: 20,
    });
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1', relatedParty: true },
      }),
    );
  });

  it('reversal queries only the reversal stream', async () => {
    const db = makeDb();
    await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'reversal',
      page: 1,
      limit: 20,
    });
    expect(db.tokenReversalEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { communityId: 'c_1' } }),
    );
    expect(db.tokenMintEvent.findMany).not.toHaveBeenCalled();
  });

  it('pending_governance filters mint by governanceStatus=pending', async () => {
    const db = makeDb();
    await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'pending_governance',
      page: 1,
      limit: 20,
    });
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1', governanceStatus: 'pending' },
      }),
    );
  });

  it('injective_verified resolves verified record ids then filters both streams by them', async () => {
    const db = makeDb();
    db.publicRecord.findMany.mockResolvedValueOnce([{ id: 'pr_1' }, { id: 'pr_2' }]);
    db.tokenMintEvent.findMany.mockResolvedValue([mintRow({ publicRecordId: 'pr_1' })]);
    db.tokenReversalEvent.findMany.mockResolvedValue([]);
    db.publicRecord.findMany.mockResolvedValueOnce([
      { id: 'pr_1', status: 'verified', txHash: '0xbb' },
    ]);
    const res = await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'injective_verified',
      page: 1,
      limit: 20,
    });

    expect(res.status).toBe(200);
    expect(db.publicRecord.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ communityId: 'c_1', status: 'verified' }),
      }),
    );
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1', publicRecordId: { in: ['pr_1', 'pr_2'] } },
      }),
    );
  });

  it('bounds the injective record-id resolution scan by the page window (take + recency order), never a full scan', async () => {
    const db = makeDb();
    db.publicRecord.findMany.mockResolvedValueOnce([{ id: 'pr_1' }]);
    db.tokenMintEvent.findMany.mockResolvedValue([]);
    db.tokenReversalEvent.findMany.mockResolvedValue([]);
    db.publicRecord.findMany.mockResolvedValueOnce([]);
    await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'injective_verified',
      page: 2,
      limit: 20,
    });
    // page 2 @ limit 20 -> skip 20, bounded take = skip + limit = 40. The scan
    // must never materialize every matching record id into memory/the in-list.
    expect(db.publicRecord.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 40, orderBy: { createdAt: 'desc' } }),
    );
  });

  it('injective total reflects the true match count via publicRecord.count, not the bounded id window', async () => {
    const db = makeDb();
    // The id-resolution scan returns a full page window of `take` ids (clamped by
    // the DoS bound), yet the true number of verified records is far larger.
    const windowIds = Array.from({ length: 20 }, (_, i) => ({ id: `pr_${i}` }));
    db.publicRecord.findMany.mockResolvedValueOnce(windowIds); // id resolution
    db.tokenMintEvent.findMany.mockResolvedValue([]);
    db.tokenReversalEvent.findMany.mockResolvedValue([]);
    db.publicRecord.findMany.mockResolvedValueOnce([]); // page-row record hydration
    db.publicRecord.count
      .mockResolvedValueOnce(10000) // mint-eligible verified records
      .mockResolvedValueOnce(0); // reversal-eligible verified records
    const res = await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'injective_verified',
      page: 1,
      limit: 20,
    });

    expect(res.status).toBe(200);
    // Total is the true match count, NOT clamped to the (skip + limit) id window.
    expect(res.body.meta).toEqual({ total: 10000, page: 1, limit: 20 });
    // The clamped event in-list count must never back the total for injective filters.
    expect(db.tokenMintEvent.count).not.toHaveBeenCalled();
    expect(db.tokenReversalEvent.count).not.toHaveBeenCalled();
    expect(db.publicRecord.count).toHaveBeenCalledWith({
      where: {
        communityId: 'c_1',
        status: 'verified',
        recordType: { in: ['token_mint', 'advance_mint'] },
      },
    });
    expect(db.publicRecord.count).toHaveBeenCalledWith({
      where: { communityId: 'c_1', status: 'verified', recordType: 'token_reversal' },
    });
  });

  it('verification_failed resolves failed record ids and filters by them', async () => {
    const db = makeDb();
    db.publicRecord.findMany.mockResolvedValueOnce([{ id: 'pr_9' }]);
    db.tokenMintEvent.findMany.mockResolvedValue([]);
    db.tokenReversalEvent.findMany.mockResolvedValue([]);
    await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'verification_failed',
      page: 1,
      limit: 20,
    });
    expect(db.publicRecord.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ communityId: 'c_1', status: 'failed' }),
      }),
    );
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { communityId: 'c_1', publicRecordId: { in: ['pr_9'] } },
      }),
    );
  });

  it('maps injectiveStatus three states: verified->confirmed, failed->failed, other->pending', async () => {
    const db = makeDb();
    db.tokenMintEvent.findMany.mockResolvedValue([
      mintRow({ id: 'm_v', publicRecordId: 'pr_v', createdAt: new Date('2026-07-23T00:00:00.000Z') }),
      mintRow({ id: 'm_f', publicRecordId: 'pr_f', createdAt: new Date('2026-07-22T00:00:00.000Z') }),
      mintRow({ id: 'm_p', publicRecordId: 'pr_p', createdAt: new Date('2026-07-21T00:00:00.000Z') }),
    ]);
    db.tokenReversalEvent.findMany.mockResolvedValue([]);
    db.publicRecord.findMany.mockResolvedValue([
      { id: 'pr_v', status: 'verified', txHash: '0x1' },
      { id: 'pr_f', status: 'failed', txHash: null },
      { id: 'pr_p', status: 'confirming', txHash: null },
    ]);
    const res = await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'all',
      page: 1,
      limit: 20,
    });

    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows[0].injectiveStatus).toBe('confirmed');
    expect(rows[0].txHash).toBe('0x1');
    expect(rows[1].injectiveStatus).toBe('failed');
    expect(rows[2].injectiveStatus).toBe('pending');
  });

  it('paginates the merged stream (page 2 of a 3-item stream at limit 2)', async () => {
    const db = makeDb();
    db.tokenMintEvent.findMany.mockResolvedValue([
      mintRow({ id: 'a', createdAt: new Date('2026-07-23T00:00:00.000Z') }),
      mintRow({ id: 'b', createdAt: new Date('2026-07-22T00:00:00.000Z') }),
      mintRow({ id: 'c', createdAt: new Date('2026-07-21T00:00:00.000Z') }),
    ]);
    db.tokenMintEvent.count.mockResolvedValue(3);
    db.tokenReversalEvent.findMany.mockResolvedValue([]);
    db.publicRecord.findMany.mockResolvedValue([]);
    const res = await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'all',
      page: 2,
      limit: 2,
    });

    expect(res.body.meta).toEqual({ total: 3, page: 2, limit: 2 });
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('c');
    // page 2 @ limit 2 -> skip 2, bounded take = skip + limit = 4.
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 4 }),
    );
  });

  it('bounds memory: total comes from count(), rows fetched via a bounded take (no full-ledger scan)', async () => {
    const db = makeDb();
    // Simulate a large community: count() reports 1000 rows, but the handler must
    // only ever pull the page window (take = skip + limit) into the process.
    db.tokenMintEvent.count.mockResolvedValue(1000);
    db.tokenReversalEvent.count.mockResolvedValue(500);
    db.tokenMintEvent.findMany.mockResolvedValue([mintRow()]);
    db.tokenReversalEvent.findMany.mockResolvedValue([reversalRow()]);
    db.publicRecord.findMany.mockResolvedValue([]);

    const res = await handleGetLedger(makeDeps(db), {
      communityId: 'c_1',
      filter: 'all',
      page: 1,
      limit: 20,
    });

    // Total is the DB aggregate sum, independent of how many rows were materialized.
    expect(res.body.meta).toEqual({ total: 1500, page: 1, limit: 20 });
    // Neither stream is read without a bounded take.
    expect(db.tokenMintEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
    expect(db.tokenReversalEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
    expect(db.tokenMintEvent.count).toHaveBeenCalledWith({ where: { communityId: 'c_1' } });
    expect(db.tokenReversalEvent.count).toHaveBeenCalledWith({ where: { communityId: 'c_1' } });
  });

  it('exposes exactly the ten canonical filter values', () => {
    expect(LEDGER_FILTERS).toEqual([
      'all',
      'regular_mint',
      'advance_mint',
      'initial_allocation',
      'special_reward',
      'related_party',
      'reversal',
      'pending_governance',
      'injective_verified',
      'verification_failed',
    ]);
  });
});
