import { describe, it, expect, vi, afterEach } from 'vitest';

import { EngineError } from '../../engine/errors';
import { defaultAuthorizeAdmin, type AuthEnv } from '../core';

import { setDepsForTesting, type AdvanceRouteDeps } from './deps';
import type { AdvanceRequestRow } from './handlers';

import { POST as postCreate } from '../../../app/api/token-advances/route';
import { GET as getDetail } from '../../../app/api/token-advances/[id]/route';
import { POST as postSecondApprove } from '../../../app/api/token-advances/[id]/second-approve/route';
import { POST as postCreateProposal } from '../../../app/api/token-advances/[id]/create-proposal/route';
import { POST as postExecute } from '../../../app/api/token-advances/[id]/execute/route';

const TOKEN = 'internal-token-abcdef123456';
// A per-admin credential binds a real principal (admin_b) to a secret Bearer
// token, so the second approver is credential-verified (actorVerified) rather
// than a forgeable x-youfen-actor-id header — the property second-approve now
// enforces for separation of duties.
const ADMIN_B_TOKEN = 'admin-b-secret-654321';
const AUTH_ENV: AuthEnv = {
  internalApiToken: TOKEN,
  cronSecret: null,
  adminCredentials: [{ token: ADMIN_B_TOKEN, principalId: 'admin_b' }],
};

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

function row(overrides: Partial<AdvanceRequestRow> = {}): AdvanceRequestRow {
  return {
    id: 'adv_1',
    communityId: 'c_1',
    epochId: 'ep_1',
    memberId: 'm_1',
    requestedAmount: 500n,
    approvedAmount: null,
    advanceRateBps: 800,
    reason: 'buffer',
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

interface FakeParts {
  createRequest?: ReturnType<typeof vi.fn>;
  secondApprove?: ReturnType<typeof vi.fn>;
  attachProposal?: ReturnType<typeof vi.fn>;
  execute?: ReturnType<typeof vi.fn>;
  proposalCreate?: ReturnType<typeof vi.fn>;
  findById?: ReturnType<typeof vi.fn>;
  authorizeAdmin?: AdvanceRouteDeps['authorizeAdmin'];
}

function installDeps(parts: FakeParts = {}): void {
  const deps: AdvanceRouteDeps = {
    advance: {
      createRequest: parts.createRequest ?? vi.fn(),
      secondApprove: parts.secondApprove ?? vi.fn(),
      attachProposal: parts.attachProposal ?? vi.fn(),
      execute: parts.execute ?? vi.fn(),
    },
    proposal: { create: parts.proposalCreate ?? vi.fn() },
    reader: { findById: parts.findById ?? vi.fn().mockResolvedValue(row()) },
    authorizeAdmin: parts.authorizeAdmin ?? defaultAuthorizeAdmin,
    idempotencyStore: {
      find: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    },
    authEnv: AUTH_ENV,
  };
  setDepsForTesting(deps);
}

/** Internal-token admin request with actor + idempotency headers. */
function adminReq(url: string, body?: unknown, key?: string): Request {
  const headers: Record<string, string> = {
    authorization: `Bearer ${TOKEN}`,
    'x-youfen-actor-id': 'admin_a',
    'content-type': 'application/json',
  };
  if (key !== undefined) headers['Idempotency-Key'] = key;
  return new Request(url, {
    method: 'POST',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

afterEach(() => {
  setDepsForTesting(null);
  vi.restoreAllMocks();
});

const CREATE_BODY = {
  communityId: 'c_1',
  memberId: 'm_1',
  requestedAmount: '500',
  reason: 'buffer',
};

describe('POST /api/token-advances route', () => {
  it('201 with the internal token, actor, and idempotency key', async () => {
    installDeps({
      createRequest: vi
        .fn()
        .mockResolvedValue({ requestId: 'adv_1', status: 'pending_second_approval' }),
      findById: vi.fn().mockResolvedValue(row({ advanceRateBps: 800 })),
    });
    const res = await postCreate(adminReq('http://t/api/token-advances', CREATE_BODY, 'k1'));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.advanceRequestId).toBe('adv_1');
    expect(body.data.approvalPath).toBe('dual_admin');
  });

  it('400 IDEMPOTENCY_KEY_REQUIRED when the header is missing', async () => {
    installDeps();
    const res = await postCreate(adminReq('http://t/api/token-advances', CREATE_BODY));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('403 FORBIDDEN when the caller is not an admin', async () => {
    installDeps();
    const res = await postCreate(
      new Request('http://t/api/token-advances', {
        method: 'POST',
        headers: { 'x-youfen-actor-id': 'nobody', 'content-type': 'application/json' },
        body: JSON.stringify(CREATE_BODY),
      }),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('400 VALIDATION_ERROR when the JSON body is malformed', async () => {
    installDeps();
    const res = await postCreate(
      new Request('http://t/api/token-advances', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'x-youfen-actor-id': 'admin_a',
          'Idempotency-Key': 'k9',
        },
        body: 'not json',
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/token-advances/[id] route', () => {
  it('200 detail with bigints serialized', async () => {
    installDeps({ findById: vi.fn().mockResolvedValue(row({ requestedAmount: 500n })) });
    const res = await getDetail(
      new Request('http://t/api/token-advances/adv_1', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
      ctx('adv_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.requestedAmount).toBe('500');
  });

  it('404 when the request is missing', async () => {
    installDeps({ findById: vi.fn().mockResolvedValue(null) });
    const res = await getDetail(
      new Request('http://t/api/token-advances/ghost', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
      ctx('ghost'),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/token-advances/[id]/second-approve route', () => {
  it('200 on a distinct-admin approval', async () => {
    installDeps({
      findById: vi.fn().mockResolvedValue(row({ requestedBy: 'admin_a' })),
      secondApprove: vi.fn().mockResolvedValue({ requestId: 'adv_1', status: 'approved' }),
    });
    const res = await postSecondApprove(
      new Request('http://t/api/token-advances/adv_1/second-approve', {
        method: 'POST',
        headers: { authorization: `Bearer ${ADMIN_B_TOKEN}` },
      }),
      ctx('adv_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('approved');
  });
});

describe('POST /api/token-advances/[id]/create-proposal route', () => {
  it('201 creating and attaching a proposal', async () => {
    installDeps({
      findById: vi.fn().mockResolvedValue(row({ status: 'pending_proposal', proposalId: null })),
      proposalCreate: vi.fn().mockResolvedValue({ proposalId: 'prop_1' }),
      attachProposal: vi.fn().mockResolvedValue({ requestId: 'adv_1', status: 'pending_proposal' }),
    });
    const res = await postCreateProposal(
      adminReq('http://t/api/token-advances/adv_1/create-proposal', undefined),
      ctx('adv_1'),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.proposalId).toBe('prop_1');
  });

  it('200 reusing an already-attached proposal', async () => {
    installDeps({
      findById: vi.fn().mockResolvedValue(row({ status: 'pending_proposal', proposalId: 'prop_x' })),
    });
    const res = await postCreateProposal(
      adminReq('http://t/api/token-advances/adv_1/create-proposal', undefined),
      ctx('adv_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.proposalId).toBe('prop_x');
  });
});

describe('POST /api/token-advances/[id]/execute route', () => {
  it('403 APPROVAL_REQUIRED when approval is missing (distinct from 409)', async () => {
    installDeps({
      findById: vi.fn().mockResolvedValue(row({ status: 'approved' })),
      execute: vi.fn().mockRejectedValue(new EngineError('PROPOSAL_REQUIRED', 'need proposal')),
    });
    const res = await postExecute(
      adminReq('http://t/api/token-advances/adv_1/execute', {}),
      ctx('adv_1'),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('APPROVAL_REQUIRED');
  });

  it('409 INVALID_STATUS when the request is not approved', async () => {
    installDeps({
      findById: vi.fn().mockResolvedValue(row({ status: 'pending_second_approval' })),
      execute: vi.fn().mockRejectedValue(new EngineError('INVALID_STATUS', 'cannot execute')),
    });
    const res = await postExecute(
      adminReq('http://t/api/token-advances/adv_1/execute', {}),
      ctx('adv_1'),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_STATUS');
  });

  it('200 executing an approved request', async () => {
    installDeps({
      findById: vi.fn().mockResolvedValue(row({ status: 'approved' })),
      execute: vi.fn().mockResolvedValue({
        mintEvents: [
          {
            id: 'mint_1',
            amount: 500n,
            budgetSource: 'next_epoch_advance',
            governanceStatus: 'pending',
            publicRecordId: 'pr_1',
          },
        ],
        memberBalanceAfter: 500n,
        totalSupplyAfter: 1500n,
      }),
    });
    const res = await postExecute(
      adminReq('http://t/api/token-advances/adv_1/execute', { evidenceUrls: ['https://e/1'] }),
      ctx('adv_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalSupplyAfter).toBe('1500');
  });
});
