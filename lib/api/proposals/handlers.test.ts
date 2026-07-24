import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EngineError } from '../../engine/errors';
import type { AuthContext, IdempotencyRow, IdempotencyStore } from '../core';

import {
  handleCreateProposal,
  handleStartProposal,
  handleGetSnapshot,
  handleVote,
  handleEndProposal,
  type ProposalsDeps,
  type ProposalEnginePort,
  type MembershipPort,
  type SnapshotReaderPort,
  type ProposalSnapshotRow,
} from './handlers';

// ---- Fixtures / builders --------------------------------------------------

function makeEngine(overrides: Partial<ProposalEnginePort> = {}): ProposalEnginePort {
  return {
    create: vi.fn().mockResolvedValue({ proposalId: 'p_1' }),
    activate: vi.fn().mockResolvedValue({ snapshotRecordId: 'rec_snap' }),
    castVote: vi.fn().mockResolvedValue({ voteId: 'v_1' }),
    end: vi.fn().mockResolvedValue({
      winningOptionId: 'approve',
      voterCount: 4,
      totalVoteWeight: 1500n,
      quorumMet: true,
      resultRecordId: 'rec_res',
    }),
    ...overrides,
  };
}

function makeMembership(isMember = true): MembershipPort {
  return { isMember: vi.fn().mockResolvedValue(isMember) };
}

function snapRow(overrides: Partial<ProposalSnapshotRow> = {}): ProposalSnapshotRow {
  return {
    id: 'p_1',
    communityId: 'c_1',
    status: 'active',
    snapshotAt: new Date('2026-07-22T00:00:00.000Z'),
    epochIdSnapshot: 'e_1',
    epochNumberSnapshot: 3,
    totalSupplySnapshot: 10000n,
    activeGovernanceSupplySnapshot: 8000n,
    tokenPolicyVersionSnapshot: 2,
    snapshotPublicRecordId: 'rec_snap',
    ...overrides,
  };
}

function makeSnapshotReader(overrides: Partial<SnapshotReaderPort> = {}): SnapshotReaderPort {
  return {
    findProposal: vi.fn().mockResolvedValue(snapRow()),
    countMembers: vi.fn().mockResolvedValue(5),
    findMemberWeight: vi.fn().mockResolvedValue(1200n),
    ...overrides,
  };
}

function makeStore(): IdempotencyStore {
  const map = new Map<string, IdempotencyRow>();
  return {
    find: async (endpoint, key) => map.get(`${endpoint}:${key}`) ?? null,
    save: async (endpoint, key, requestHash, responseStatus, responseBody) => {
      map.set(`${endpoint}:${key}`, { requestHash, responseStatus, responseBody });
    },
  };
}

function makeDeps(overrides: Partial<ProposalsDeps> = {}): ProposalsDeps {
  return {
    engine: makeEngine(),
    membership: makeMembership(true),
    snapshot: makeSnapshotReader(),
    idempotency: makeStore(),
    authorizeAdmin: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const memberAuth: AuthContext = { actorId: 'm_1', isAdmin: false, isInternal: false };
const adminAuth: AuthContext = { actorId: 'admin_1', isAdmin: true, isInternal: false };
const internalAuth: AuthContext = { actorId: null, isAdmin: false, isInternal: true };

function createBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    communityId: 'c_1',
    type: 'community_decision',
    title: 'Fund the mural',
    description: 'A description that is long enough.',
    options: [
      { id: 'approve', label: 'Approve' },
      { id: 'reject', label: 'Reject' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- POST /api/proposals (create, idempotent) -----------------------------

describe('handleCreateProposal', () => {
  it('201 creates a community_decision proposal for a member', async () => {
    const deps = makeDeps();
    const res = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody(),
      idempotencyKey: 'k1',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect((res.body.data as { proposalId: string }).proposalId).toBe('p_1');
    expect(deps.engine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 'c_1',
        type: 'community_decision',
        title: 'Fund the mural',
        createdBy: 'm_1',
        options: [
          { id: 'approve', label: 'Approve' },
          { id: 'reject', label: 'Reject' },
        ],
      }),
    );
  });

  it('201 token_policy_change carries the three-bps payload in metadata', async () => {
    const deps = makeDeps();
    const res = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody({
        type: 'token_policy_change',
        policyChangePayload: {
          monthlyInflationRateBps: 100,
          maxAdvanceRateBps: 5000,
          memberMintCapRateBps: 200,
        },
      }),
      idempotencyKey: 'k2',
    });

    expect(res.status).toBe(201);
    const arg = (deps.engine.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.type).toBe('token_policy_change');
    expect(arg.metadata.policyChangePayload).toEqual({
      monthlyInflationRateBps: 100,
      maxAdvanceRateBps: 5000,
      memberMintCapRateBps: 200,
    });
  });

  it('201 budget_advance maps advanceAmount + advanceRequestId', async () => {
    const deps = makeDeps();
    const res = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody({
        type: 'budget_advance',
        advanceAmount: '500',
        policyChangePayload: { advanceRequestId: 'adv_1' },
      }),
      idempotencyKey: 'k3',
    });

    expect(res.status).toBe(201);
    const arg = (deps.engine.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.type).toBe('budget_advance');
    expect(arg.metadata.advanceAmount).toBe(500n);
    expect(arg.metadata.policyChangePayload.advanceRequestId).toBe('adv_1');
  });

  it('201 special_mint maps recipient + amount', async () => {
    const deps = makeDeps();
    const res = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody({
        type: 'special_mint',
        specialMintRecipientId: 'm_2',
        specialMintAmount: '250',
      }),
      idempotencyKey: 'k4',
    });

    expect(res.status).toBe(201);
    const arg = (deps.engine.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.type).toBe('special_mint');
    expect(arg.metadata.specialMintRecipientId).toBe('m_2');
    expect(arg.metadata.specialMintAmount).toBe(250n);
  });

  it('201 related_party_mint maps recipient + amount + note', async () => {
    const deps = makeDeps();
    const res = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody({
        type: 'related_party_mint',
        specialMintRecipientId: 'owner_1',
        specialMintAmount: '999',
        relatedPartyNote: 'founder bonus',
      }),
      idempotencyKey: 'k5',
    });

    expect(res.status).toBe(201);
    const arg = (deps.engine.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.type).toBe('related_party_mint');
    expect(arg.metadata.relatedPartyNote).toBe('founder bonus');
  });

  it('201 token_reversal maps targetMintEventId', async () => {
    const deps = makeDeps();
    const res = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody({
        type: 'token_reversal',
        policyChangePayload: { targetMintEventId: 'mint_9' },
      }),
      idempotencyKey: 'k6',
    });

    expect(res.status).toBe(201);
    const arg = (deps.engine.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.type).toBe('token_reversal');
    expect(arg.metadata.policyChangePayload.targetMintEventId).toBe('mint_9');
  });

  it('403 FORBIDDEN when the caller is not a community member (no engine call)', async () => {
    const deps = makeDeps({ membership: makeMembership(false) });
    const res = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody(),
      idempotencyKey: 'k7',
    });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
    expect(deps.engine.create).not.toHaveBeenCalled();
  });

  it('403 FORBIDDEN when there is no actor identity', async () => {
    const deps = makeDeps();
    const res = await handleCreateProposal(deps, {
      auth: { actorId: null, isAdmin: false, isInternal: false },
      body: createBody(),
      idempotencyKey: 'k8',
    });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
    expect(deps.membership.isMember).not.toHaveBeenCalled();
  });

  it('400 IDEMPOTENCY_KEY_REQUIRED when the header is absent', async () => {
    const deps = makeDeps();
    const res = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody(),
      idempotencyKey: null,
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(deps.engine.create).not.toHaveBeenCalled();
  });

  it('replays the stored 201 on a repeated key without re-running the engine', async () => {
    const deps = makeDeps();
    const first = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody(),
      idempotencyKey: 'dup',
    });
    const second = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody(),
      idempotencyKey: 'dup',
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(deps.engine.create).toHaveBeenCalledTimes(1);
  });

  it('400 VALIDATION_ERROR when fewer than two options are supplied', async () => {
    const deps = makeDeps();
    const res = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody({ options: [{ id: 'approve' }] }),
      idempotencyKey: 'k9',
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(deps.engine.create).not.toHaveBeenCalled();
  });

  it('400 when the engine rejects a bad type-specific payload (VALIDATION_ERROR)', async () => {
    const deps = makeDeps({
      engine: makeEngine({
        create: vi.fn().mockRejectedValue(new EngineError('VALIDATION_ERROR', 'bad payload')),
      }),
    });
    const res = await handleCreateProposal(deps, {
      auth: memberAuth,
      body: createBody({ type: 'special_mint', specialMintRecipientId: 'm_2', specialMintAmount: '10' }),
      idempotencyKey: 'k10',
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
  });
});

// ---- POST /api/proposals/:id/start (activate, admin) ----------------------

describe('handleStartProposal', () => {
  it('200 returns snapshotRecordId on a successful activation', async () => {
    const deps = makeDeps();
    const res = await handleStartProposal(deps, { auth: adminAuth, proposalId: 'p_1' });

    expect(res.status).toBe(200);
    expect((res.body.data as { snapshotRecordId: string }).snapshotRecordId).toBe('rec_snap');
    expect(deps.engine.activate).toHaveBeenCalledWith('p_1');
  });

  it('200 {idempotent:true} when the proposal is already active (noop)', async () => {
    const deps = makeDeps({ engine: makeEngine({ activate: vi.fn().mockResolvedValue({ noop: true }) }) });
    const res = await handleStartProposal(deps, { auth: adminAuth, proposalId: 'p_1' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ idempotent: true });
  });

  it('403 FORBIDDEN when the caller is not an admin (no engine call)', async () => {
    const deps = makeDeps({ authorizeAdmin: vi.fn().mockResolvedValue(false) });
    const res = await handleStartProposal(deps, { auth: memberAuth, proposalId: 'p_1' });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
    expect(deps.engine.activate).not.toHaveBeenCalled();
  });

  it('404 when the engine reports the proposal is missing', async () => {
    const deps = makeDeps({
      engine: makeEngine({ activate: vi.fn().mockRejectedValue(new EngineError('NOT_FOUND', 'gone')) }),
    });
    const res = await handleStartProposal(deps, { auth: adminAuth, proposalId: 'ghost' });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('409 when the epoch is not active for the snapshot', async () => {
    const deps = makeDeps({
      engine: makeEngine({ activate: vi.fn().mockRejectedValue(new EngineError('EPOCH_NOT_ACTIVE', 'no epoch')) }),
    });
    const res = await handleStartProposal(deps, { auth: adminAuth, proposalId: 'p_1' });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('EPOCH_NOT_ACTIVE');
  });
});

// ---- GET /api/proposals/:id/snapshot (public) -----------------------------

describe('handleGetSnapshot', () => {
  it('200 returns the frozen snapshot with member count', async () => {
    const deps = makeDeps();
    const res = await handleGetSnapshot(deps, { proposalId: 'p_1', memberId: null });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      proposalId: 'p_1',
      status: 'active',
      snapshotAt: new Date('2026-07-22T00:00:00.000Z').toISOString(),
      epochIdSnapshot: 'e_1',
      epochNumberSnapshot: 3,
      totalSupplySnapshot: '10000',
      activeGovernanceSupplySnapshot: '8000',
      tokenPolicyVersionSnapshot: 2,
      memberCount: 5,
      snapshotPublicRecordId: 'rec_snap',
    });
  });

  it('409 when the proposal is not yet activated (no snapshot)', async () => {
    const deps = makeDeps({
      snapshot: makeSnapshotReader({
        findProposal: vi.fn().mockResolvedValue(snapRow({ status: 'draft', snapshotAt: null })),
      }),
    });
    const res = await handleGetSnapshot(deps, { proposalId: 'p_1', memberId: null });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
  });

  it('404 when the proposal does not exist', async () => {
    const deps = makeDeps({
      snapshot: makeSnapshotReader({ findProposal: vi.fn().mockResolvedValue(null) }),
    });
    const res = await handleGetSnapshot(deps, { proposalId: 'ghost', memberId: null });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('200 attaches memberWeight when a memberId query is supplied', async () => {
    const deps = makeDeps();
    const res = await handleGetSnapshot(deps, { proposalId: 'p_1', memberId: 'm_1' });

    expect(res.status).toBe(200);
    const data = res.body.data as { memberWeight: string };
    expect(data.memberWeight).toBe('1200');
    expect(deps.snapshot.findMemberWeight).toHaveBeenCalledWith('p_1', 'm_1');
  });

  it('200 memberWeight null when the queried member is outside the snapshot', async () => {
    const deps = makeDeps({
      snapshot: makeSnapshotReader({ findMemberWeight: vi.fn().mockResolvedValue(null) }),
    });
    const res = await handleGetSnapshot(deps, { proposalId: 'p_1', memberId: 'stranger' });

    expect(res.status).toBe(200);
    const data = res.body.data as { memberWeight: string | null };
    expect(data.memberWeight).toBeNull();
  });
});

// ---- POST /api/proposals/:id/vote (member) --------------------------------

describe('handleVote', () => {
  it('201 casts a new vote', async () => {
    const deps = makeDeps();
    const res = await handleVote(deps, {
      auth: memberAuth,
      proposalId: 'p_1',
      body: { memberId: 'm_1', optionId: 'approve' },
    });

    expect(res.status).toBe(201);
    expect((res.body.data as { voteId: string }).voteId).toBe('v_1');
    expect(deps.engine.castVote).toHaveBeenCalledWith({
      proposalId: 'p_1',
      memberId: 'm_1',
      optionId: 'approve',
    });
  });

  it('200 {idempotent:true} on a repeated vote', async () => {
    const deps = makeDeps({
      engine: makeEngine({ castVote: vi.fn().mockResolvedValue({ voteId: 'v_1', idempotent: true }) }),
    });
    const res = await handleVote(deps, {
      auth: memberAuth,
      proposalId: 'p_1',
      body: { memberId: 'm_1', optionId: 'approve' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ idempotent: true });
  });

  it('403 FORBIDDEN when the member is outside the voting snapshot', async () => {
    const deps = makeDeps({
      engine: makeEngine({ castVote: vi.fn().mockRejectedValue(new EngineError('FORBIDDEN', 'not in snapshot')) }),
    });
    const res = await handleVote(deps, {
      auth: memberAuth,
      proposalId: 'p_1',
      body: { memberId: 'stranger', optionId: 'approve' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('409 when voting on an ended proposal', async () => {
    const deps = makeDeps({
      engine: makeEngine({ castVote: vi.fn().mockRejectedValue(new EngineError('INVALID_STATUS', 'closed')) }),
    });
    const res = await handleVote(deps, {
      auth: memberAuth,
      proposalId: 'p_1',
      body: { memberId: 'm_1', optionId: 'approve' },
    });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
  });

  it('400 VALIDATION_ERROR when optionId is missing', async () => {
    const deps = makeDeps();
    const res = await handleVote(deps, {
      auth: memberAuth,
      proposalId: 'p_1',
      body: { memberId: 'm_1' },
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(deps.engine.castVote).not.toHaveBeenCalled();
  });
});

// ---- POST /api/proposals/:id/end (admin/internal) -------------------------

describe('handleEndProposal', () => {
  it('200 returns the settled result with totalVoteWeight as a string', async () => {
    const deps = makeDeps();
    const res = await handleEndProposal(deps, { auth: adminAuth, proposalId: 'p_1' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      winningOptionId: 'approve',
      voterCount: 4,
      totalVoteWeight: '1500',
      quorumMet: true,
      resultRecordId: 'rec_res',
    });
    expect(deps.engine.end).toHaveBeenCalledWith('p_1');
  });

  it('200 allows an internal-token caller to end (permission matrix)', async () => {
    const authorizeAdmin = vi.fn((ctx: AuthContext) => ctx.isAdmin || ctx.isInternal);
    const deps = makeDeps({ authorizeAdmin });
    const res = await handleEndProposal(deps, { auth: internalAuth, proposalId: 'p_1' });

    expect(res.status).toBe(200);
    expect(authorizeAdmin).toHaveBeenCalled();
  });

  it('200 {idempotent:true} when the proposal was already ended (noop)', async () => {
    const deps = makeDeps({ engine: makeEngine({ end: vi.fn().mockResolvedValue({ noop: true }) }) });
    const res = await handleEndProposal(deps, { auth: adminAuth, proposalId: 'p_1' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ idempotent: true });
  });

  it('409 when the proposal is not yet due (INVALID_STATUS)', async () => {
    const deps = makeDeps({
      engine: makeEngine({ end: vi.fn().mockRejectedValue(new EngineError('INVALID_STATUS', 'not due')) }),
    });
    const res = await handleEndProposal(deps, { auth: adminAuth, proposalId: 'p_1' });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
  });

  it('403 FORBIDDEN when neither admin nor internal (no engine call)', async () => {
    const deps = makeDeps({ authorizeAdmin: vi.fn().mockResolvedValue(false) });
    const res = await handleEndProposal(deps, { auth: memberAuth, proposalId: 'p_1' });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
    expect(deps.engine.end).not.toHaveBeenCalled();
  });
});
