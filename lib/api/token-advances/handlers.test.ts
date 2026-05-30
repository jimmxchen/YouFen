import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EngineError } from '../../engine/errors';
import type { AuthContext } from '../core';
import type { IdempotencyRow, IdempotencyStore } from '../core';

import {
  handleCreateAdvance,
  handleCreateProposal,
  handleExecuteAdvance,
  handleGetAdvance,
  handleSecondApprove,
  type AdvanceDeps,
  type AdvanceRequestRow,
} from './handlers';

// ---- fixtures ---------------------------------------------------------------

function row(overrides: Partial<AdvanceRequestRow> = {}): AdvanceRequestRow {
  return {
    id: 'adv_1',
    communityId: 'c_1',
    epochId: 'ep_1',
    memberId: 'm_1',
    requestedAmount: 500n,
    approvedAmount: null,
    advanceRateBps: 800,
    reason: 'buffer for tooling',
    status: 'pending_second_approval',
    relatedParty: false,
    requestedBy: 'admin_a',
    secondApprovedBy: null,
    proposalId: null,
    publicRecordId: null,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    ...overrides,
  };
}

function makeReader(value: AdvanceRequestRow | null): AdvanceDeps['reader'] {
  return { findById: vi.fn().mockResolvedValue(value) };
}

/** An in-memory idempotency store (mirrors the Prisma adapter semantics). */
function memStore(): IdempotencyStore {
  const rows = new Map<string, IdempotencyRow>();
  return {
    find: async (endpoint, key) => rows.get(`${endpoint}:${key}`) ?? null,
    save: async (endpoint, key, requestHash, responseStatus, responseBody) => {
      rows.set(`${endpoint}:${key}`, { requestHash, responseStatus, responseBody });
    },
  };
}

function makeDeps(overrides: Partial<AdvanceDeps> = {}): AdvanceDeps {
  return {
    advance: {
      createRequest: vi.fn(),
      secondApprove: vi.fn(),
      attachProposal: vi.fn(),
      execute: vi.fn(),
    },
    proposal: { create: vi.fn() },
    reader: makeReader(row()),
    authorizeAdmin: vi.fn().mockResolvedValue(true),
    idempotencyStore: memStore(),
    ...overrides,
  };
}

const ADMIN: AuthContext = { actorId: 'admin_a', isAdmin: true, isInternal: false, actorVerified: true };
const INTERNAL: AuthContext = { actorId: 'svc', isAdmin: false, isInternal: true };
const NO_ACTOR: AuthContext = { actorId: null, isAdmin: true, isInternal: false };

const CREATE_BODY = {
  communityId: 'c_1',
  memberId: 'm_1',
  requestedAmount: '500',
  reason: 'buffer for tooling',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- POST /api/token-advances ----------------------------------------------

describe('handleCreateAdvance', () => {
  it('201 dual_admin path exposes advanceRateBps + approvalPath', async () => {
    const created = { requestId: 'adv_1', status: 'pending_second_approval' };
    const deps = makeDeps({
      advance: {
        createRequest: vi.fn().mockResolvedValue(created),
        secondApprove: vi.fn(),
        attachProposal: vi.fn(),
        execute: vi.fn(),
      },
      reader: makeReader(row({ advanceRateBps: 800, status: 'pending_second_approval' })),
    });
    const res = await handleCreateAdvance(deps, {
      body: CREATE_BODY,
      auth: ADMIN,
      idempotencyKey: 'k1',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      advanceRequestId: 'adv_1',
      status: 'pending_second_approval',
      advanceRateBps: 800,
      approvalPath: 'dual_admin',
    });
    expect(deps.advance.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 'c_1',
        memberId: 'm_1',
        amount: 500n,
        requestedBy: 'admin_a',
        reason: 'buffer for tooling',
      }),
    );
  });

  it('forwards contributionIds to the engine so split-mint recovery is reachable', async () => {
    const createRequest = vi
      .fn()
      .mockResolvedValue({ requestId: 'adv_1', status: 'pending_second_approval' });
    const deps = makeDeps({
      advance: { createRequest, secondApprove: vi.fn(), attachProposal: vi.fn(), execute: vi.fn() },
      reader: makeReader(row()),
    });
    const res = await handleCreateAdvance(deps, {
      body: { ...CREATE_BODY, contributionIds: ['con_1', 'con_2'] },
      auth: ADMIN,
      idempotencyKey: 'k-contrib',
    });

    expect(res.status).toBe(201);
    expect(createRequest).toHaveBeenCalledWith(
      expect.objectContaining({ contributionIds: ['con_1', 'con_2'] }),
    );
  });

  it('201 community_proposal path derives approvalPath from pending_proposal', async () => {
    const deps = makeDeps({
      advance: {
        createRequest: vi.fn().mockResolvedValue({ requestId: 'adv_1', status: 'pending_proposal' }),
        secondApprove: vi.fn(),
        attachProposal: vi.fn(),
        execute: vi.fn(),
      },
      reader: makeReader(row({ advanceRateBps: 1500, status: 'pending_proposal' })),
    });
    const res = await handleCreateAdvance(deps, {
      body: CREATE_BODY,
      auth: INTERNAL,
      idempotencyKey: 'k2',
    });

    expect(res.status).toBe(201);
    const data = res.body.data as Record<string, unknown>;
    expect(data.approvalPath).toBe('community_proposal');
    expect(data.advanceRateBps).toBe(1500);
  });

  it('403 FORBIDDEN when authorizeAdmin rejects, without touching the engine', async () => {
    const deps = makeDeps({ authorizeAdmin: vi.fn().mockResolvedValue(false) });
    const res = await handleCreateAdvance(deps, {
      body: CREATE_BODY,
      auth: ADMIN,
      idempotencyKey: 'k3',
    });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
    expect(deps.advance.createRequest).not.toHaveBeenCalled();
  });

  it('401 UNAUTHORIZED when the actor identity is missing', async () => {
    const deps = makeDeps();
    const res = await handleCreateAdvance(deps, {
      body: CREATE_BODY,
      auth: NO_ACTOR,
      idempotencyKey: 'k4',
    });

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
  });

  it('400 VALIDATION_ERROR when requestedAmount is not > 0', async () => {
    const deps = makeDeps();
    const res = await handleCreateAdvance(deps, {
      body: { ...CREATE_BODY, requestedAmount: '0' },
      auth: ADMIN,
      idempotencyKey: 'k5',
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_ERROR');
    expect(deps.advance.createRequest).not.toHaveBeenCalled();
  });

  it('400 IDEMPOTENCY_KEY_REQUIRED when the header is missing', async () => {
    const deps = makeDeps({
      advance: {
        createRequest: vi.fn().mockResolvedValue({ requestId: 'adv_1', status: 'pending_second_approval' }),
        secondApprove: vi.fn(),
        attachProposal: vi.fn(),
        execute: vi.fn(),
      },
    });
    const res = await handleCreateAdvance(deps, {
      body: CREATE_BODY,
      auth: ADMIN,
      idempotencyKey: null,
    });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(deps.advance.createRequest).not.toHaveBeenCalled();
  });

  it('replays the stored 201 without re-running the engine on same key', async () => {
    const createRequest = vi
      .fn()
      .mockResolvedValue({ requestId: 'adv_1', status: 'pending_second_approval' });
    const deps = makeDeps({
      advance: { createRequest, secondApprove: vi.fn(), attachProposal: vi.fn(), execute: vi.fn() },
    });
    const call = () =>
      handleCreateAdvance(deps, { body: CREATE_BODY, auth: ADMIN, idempotencyKey: 'dup' });

    const first = await call();
    const second = await call();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data).toEqual(first.body.data);
    expect(createRequest).toHaveBeenCalledTimes(1);
  });

  it('409 ADVANCE_RATE_EXCEEDED carries an explanatory details.reason', async () => {
    const deps = makeDeps({
      advance: {
        createRequest: vi.fn().mockRejectedValue(new EngineError('ADVANCE_RATE_EXCEEDED', 'over hard cap')),
        secondApprove: vi.fn(),
        attachProposal: vi.fn(),
        execute: vi.fn(),
      },
    });
    const res = await handleCreateAdvance(deps, {
      body: CREATE_BODY,
      auth: ADMIN,
      idempotencyKey: 'k6',
    });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('ADVANCE_RATE_EXCEEDED');
    expect(res.body.error?.details).toEqual({ reason: 'over hard cap' });
  });

  it('409 ROLLING_ADVANCE_FORBIDDEN when outstanding debt blocks the request', async () => {
    const deps = makeDeps({
      advance: {
        createRequest: vi.fn().mockRejectedValue(new EngineError('ROLLING_ADVANCE_FORBIDDEN', 'debt')),
        secondApprove: vi.fn(),
        attachProposal: vi.fn(),
        execute: vi.fn(),
      },
    });
    const res = await handleCreateAdvance(deps, {
      body: CREATE_BODY,
      auth: ADMIN,
      idempotencyKey: 'k7',
    });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('ROLLING_ADVANCE_FORBIDDEN');
  });
});

// ---- GET /api/token-advances/:id -------------------------------------------

describe('handleGetAdvance', () => {
  it('200 detail serializes bigints to strings', async () => {
    const deps = makeDeps({
      reader: makeReader(row({ requestedAmount: 500n, approvedAmount: 500n, status: 'approved' })),
    });
    const res = await handleGetAdvance(deps, { id: 'adv_1', auth: ADMIN });

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect(data.requestedAmount).toBe('500');
    expect(data.approvedAmount).toBe('500');
    expect(data.status).toBe('approved');
    expect(data.advanceRequestId).toBe('adv_1');
  });

  it('404 NOT_FOUND when the request does not exist', async () => {
    const deps = makeDeps({ reader: makeReader(null) });
    const res = await handleGetAdvance(deps, { id: 'ghost', auth: ADMIN });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('403 FORBIDDEN when the caller is not an admin', async () => {
    const deps = makeDeps({ authorizeAdmin: vi.fn().mockResolvedValue(false) });
    const res = await handleGetAdvance(deps, { id: 'adv_1', auth: ADMIN });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });
});

// ---- POST /api/token-advances/:id/second-approve ---------------------------

describe('handleSecondApprove', () => {
  it('200 approved on a distinct-admin approval', async () => {
    const deps = makeDeps({
      reader: makeReader(row({ status: 'pending_second_approval', requestedBy: 'admin_a' })),
      advance: {
        createRequest: vi.fn(),
        secondApprove: vi.fn().mockResolvedValue({ requestId: 'adv_1', status: 'approved' }),
        attachProposal: vi.fn(),
        execute: vi.fn(),
      },
    });
    const res = await handleSecondApprove(deps, {
      id: 'adv_1',
      auth: { actorId: 'admin_b', isAdmin: true, isInternal: false, actorVerified: true },
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ advanceRequestId: 'adv_1', status: 'approved' });
    expect(deps.advance.secondApprove).toHaveBeenCalledWith('adv_1', 'admin_b');
  });

  it('403 FORBIDDEN when the second approver is not credential-verified', async () => {
    // Separation of duties: an unverified (forgeable-header) actor can never
    // satisfy the distinct second-approval, even with the admin flag set. This
    // is what stops one shared-token operator from approving their own request.
    const deps = makeDeps({
      reader: makeReader(row({ status: 'pending_second_approval', requestedBy: 'admin_a' })),
    });
    const res = await handleSecondApprove(deps, {
      id: 'adv_1',
      auth: { actorId: 'admin_b', isAdmin: true, isInternal: false },
    });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
    expect(deps.advance.secondApprove).not.toHaveBeenCalled();
  });

  it('403 FORBIDDEN on self-approval (engine EngineError FORBIDDEN)', async () => {
    const deps = makeDeps({
      advance: {
        createRequest: vi.fn(),
        secondApprove: vi.fn().mockRejectedValue(new EngineError('FORBIDDEN', 'self-approval')),
        attachProposal: vi.fn(),
        execute: vi.fn(),
      },
    });
    const res = await handleSecondApprove(deps, { id: 'adv_1', auth: ADMIN });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('409 INVALID_STATUS when not pending_second_approval', async () => {
    const deps = makeDeps({
      advance: {
        createRequest: vi.fn(),
        secondApprove: vi.fn().mockRejectedValue(new EngineError('INVALID_STATUS', 'wrong state')),
        attachProposal: vi.fn(),
        execute: vi.fn(),
      },
    });
    const res = await handleSecondApprove(deps, {
      id: 'adv_1',
      auth: { actorId: 'admin_b', isAdmin: true, isInternal: false, actorVerified: true },
    });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
  });

  it('200 idempotent replay when already approved by the same admin', async () => {
    const deps = makeDeps({
      reader: makeReader(row({ status: 'approved', secondApprovedBy: 'admin_b' })),
      advance: {
        createRequest: vi.fn(),
        secondApprove: vi.fn().mockResolvedValue({ requestId: 'adv_1', status: 'approved' }),
        attachProposal: vi.fn(),
        execute: vi.fn(),
      },
    });
    const res = await handleSecondApprove(deps, {
      id: 'adv_1',
      auth: { actorId: 'admin_b', isAdmin: true, isInternal: false, actorVerified: true },
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ advanceRequestId: 'adv_1', status: 'approved' });
  });

  it('404 NOT_FOUND when the request is missing', async () => {
    const deps = makeDeps({ reader: makeReader(null) });
    const res = await handleSecondApprove(deps, {
      id: 'ghost',
      auth: { actorId: 'admin_b', isAdmin: true, isInternal: false, actorVerified: true },
    });

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});

// ---- POST /api/token-advances/:id/create-proposal --------------------------

describe('handleCreateProposal', () => {
  it('201 creates a budget_advance proposal and attaches it', async () => {
    const create = vi.fn().mockResolvedValue({ proposalId: 'prop_1' });
    const attachProposal = vi.fn().mockResolvedValue({ requestId: 'adv_1', status: 'pending_proposal' });
    const deps = makeDeps({
      reader: makeReader(row({ status: 'pending_proposal', requestedAmount: 900n, proposalId: null })),
      proposal: { create },
      advance: { createRequest: vi.fn(), secondApprove: vi.fn(), attachProposal, execute: vi.fn() },
    });
    const res = await handleCreateProposal(deps, { id: 'adv_1', auth: ADMIN });

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ proposalId: 'prop_1' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        communityId: 'c_1',
        type: 'budget_advance',
        createdBy: 'admin_a',
        options: [{ id: 'approve' }, { id: 'reject' }],
        metadata: {
          advanceAmount: 900n,
          policyChangePayload: { advanceRequestId: 'adv_1' },
        },
      }),
    );
    expect(attachProposal).toHaveBeenCalledWith('adv_1', 'prop_1');
  });

  it('200 reuses an already-attached proposal without creating a new one', async () => {
    const create = vi.fn();
    const deps = makeDeps({
      reader: makeReader(row({ status: 'pending_proposal', proposalId: 'prop_existing' })),
      proposal: { create },
    });
    const res = await handleCreateProposal(deps, { id: 'adv_1', auth: ADMIN });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ proposalId: 'prop_existing' });
    expect(create).not.toHaveBeenCalled();
  });

  it('409 INVALID_STATUS when the request is not pending_proposal', async () => {
    const deps = makeDeps({
      reader: makeReader(row({ status: 'pending_second_approval', proposalId: null })),
    });
    const res = await handleCreateProposal(deps, { id: 'adv_1', auth: ADMIN });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
  });
});

// ---- POST /api/token-advances/:id/execute ----------------------------------

function outcome() {
  return {
    mintEvents: [
      {
        id: 'mint_1',
        amount: 500n,
        budgetSource: 'next_epoch_advance' as const,
        governanceStatus: 'pending' as const,
        publicRecordId: 'pr_1',
      },
    ],
    memberBalanceAfter: 500n,
    totalSupplyAfter: 1500n,
  };
}

describe('handleExecuteAdvance', () => {
  it('200 fresh execute returns the mint outcome without idempotent flag', async () => {
    const deps = makeDeps({
      reader: makeReader(row({ status: 'approved' })),
      advance: {
        createRequest: vi.fn(),
        secondApprove: vi.fn(),
        attachProposal: vi.fn(),
        execute: vi.fn().mockResolvedValue(outcome()),
      },
    });
    const res = await handleExecuteAdvance(deps, { id: 'adv_1', body: {}, auth: ADMIN });

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect(data.idempotent).toBeUndefined();
    expect(data.totalSupplyAfter).toBe('1500');
  });

  it('200 idempotent replay when the request is already executed', async () => {
    const deps = makeDeps({
      reader: makeReader(row({ status: 'executed' })),
      advance: {
        createRequest: vi.fn(),
        secondApprove: vi.fn(),
        attachProposal: vi.fn(),
        execute: vi.fn().mockResolvedValue(outcome()),
      },
    });
    const res = await handleExecuteAdvance(deps, { id: 'adv_1', body: {}, auth: ADMIN });

    expect(res.status).toBe(200);
    expect((res.body.data as Record<string, unknown>).idempotent).toBe(true);
  });

  it('403 APPROVAL_REQUIRED when the engine raises PROPOSAL_REQUIRED', async () => {
    const deps = makeDeps({
      reader: makeReader(row({ status: 'approved' })),
      advance: {
        createRequest: vi.fn(),
        secondApprove: vi.fn(),
        attachProposal: vi.fn(),
        execute: vi.fn().mockRejectedValue(new EngineError('PROPOSAL_REQUIRED', 'need proposal')),
      },
    });
    const res = await handleExecuteAdvance(deps, { id: 'adv_1', body: {}, auth: ADMIN });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('APPROVAL_REQUIRED');
    expect(res.body.error?.message).toContain('proposal');
  });

  it('403 APPROVAL_REQUIRED when the engine raises SECOND_APPROVER_REQUIRED', async () => {
    const deps = makeDeps({
      reader: makeReader(row({ status: 'approved' })),
      advance: {
        createRequest: vi.fn(),
        secondApprove: vi.fn(),
        attachProposal: vi.fn(),
        execute: vi.fn().mockRejectedValue(new EngineError('SECOND_APPROVER_REQUIRED', 'need 2nd')),
      },
    });
    const res = await handleExecuteAdvance(deps, { id: 'adv_1', body: {}, auth: ADMIN });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('APPROVAL_REQUIRED');
    expect(res.body.error?.message).toContain('second');
  });

  it('409 INVALID_STATUS when the request is not approved (distinct from 403)', async () => {
    const deps = makeDeps({
      reader: makeReader(row({ status: 'pending_second_approval' })),
      advance: {
        createRequest: vi.fn(),
        secondApprove: vi.fn(),
        attachProposal: vi.fn(),
        execute: vi.fn().mockRejectedValue(new EngineError('INVALID_STATUS', 'cannot execute')),
      },
    });
    const res = await handleExecuteAdvance(deps, { id: 'adv_1', body: {}, auth: ADMIN });

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
  });
});
