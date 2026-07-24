import { describe, it, expect, vi, afterEach } from 'vitest';

import type { AuthorizeAdminFn, IdempotencyRow, IdempotencyStore } from '../core';

import { setDepsForTesting } from './deps';
import type {
  ProposalsDeps,
  ProposalEnginePort,
  MembershipPort,
  SnapshotReaderPort,
  ProposalSnapshotRow,
} from './handlers';

import { POST as postCreate } from '../../../app/api/proposals/route';
import { POST as postStart } from '../../../app/api/proposals/[id]/start/route';
import { GET as getSnapshot } from '../../../app/api/proposals/[id]/snapshot/route';
import { POST as postVote } from '../../../app/api/proposals/[id]/vote/route';
import { POST as postEnd } from '../../../app/api/proposals/[id]/end/route';

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

const INTERNAL_TOKEN = 'internal-token-abcdef123456';

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

function makeStore(): IdempotencyStore {
  const map = new Map<string, IdempotencyRow>();
  return {
    find: async (endpoint, key) => map.get(`${endpoint}:${key}`) ?? null,
    save: async (endpoint, key, requestHash, responseStatus, responseBody) => {
      map.set(`${endpoint}:${key}`, { requestHash, responseStatus, responseBody });
    },
  };
}

function installDeps(overrides: {
  engine?: Partial<ProposalEnginePort>;
  membership?: MembershipPort;
  snapshot?: Partial<SnapshotReaderPort>;
  authorizeAdmin?: AuthorizeAdminFn;
} = {}): ProposalsDeps {
  const engine: ProposalEnginePort = {
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
    ...overrides.engine,
  };
  const snapshot: SnapshotReaderPort = {
    findProposal: vi.fn().mockResolvedValue(snapRow()),
    countMembers: vi.fn().mockResolvedValue(5),
    findMemberWeight: vi.fn().mockResolvedValue(1200n),
    ...overrides.snapshot,
  };
  const deps: ProposalsDeps = {
    engine,
    membership: overrides.membership ?? { isMember: vi.fn().mockResolvedValue(true) },
    snapshot,
    idempotency: makeStore(),
    // Default: admin/internal policy (isAdmin || isInternal).
    authorizeAdmin: overrides.authorizeAdmin ?? ((c) => c.isAdmin || c.isInternal),
  };
  setDepsForTesting(deps);
  return deps;
}

function memberReq(url: string, body: unknown, key?: string): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-youfen-actor-id': 'm_1',
  };
  if (key !== undefined) headers['idempotency-key'] = key;
  return new Request(url, { method: 'POST', headers, body: JSON.stringify(body) });
}

function internalReq(url: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${INTERNAL_TOKEN}` },
  });
}

const CREATE_BODY = {
  communityId: 'c_1',
  type: 'community_decision',
  title: 'Fund the mural',
  description: 'A description that is long enough.',
  options: [{ id: 'approve' }, { id: 'reject' }],
};

const OLD_TOKEN = process.env.INTERNAL_API_TOKEN;

afterEach(() => {
  setDepsForTesting(null);
  process.env.INTERNAL_API_TOKEN = OLD_TOKEN;
  vi.restoreAllMocks();
});

describe('POST /api/proposals route', () => {
  it('201 passes the create envelope through', async () => {
    installDeps();
    const res = await postCreate(memberReq('http://t/api/proposals', CREATE_BODY, 'k1'));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.proposalId).toBe('p_1');
  });

  it('400 IDEMPOTENCY_KEY_REQUIRED when the header is absent', async () => {
    const deps = installDeps();
    const res = await postCreate(memberReq('http://t/api/proposals', CREATE_BODY));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(deps.engine.create).not.toHaveBeenCalled();
  });

  it('replays a repeated key without re-running the engine', async () => {
    const deps = installDeps();
    await postCreate(memberReq('http://t/api/proposals', CREATE_BODY, 'dup'));
    const res = await postCreate(memberReq('http://t/api/proposals', CREATE_BODY, 'dup'));

    expect(res.status).toBe(201);
    expect(deps.engine.create).toHaveBeenCalledTimes(1);
  });

  it('400 VALIDATION_ERROR on a malformed JSON body', async () => {
    installDeps();
    const req = new Request('http://t/api/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'k1' },
      body: '{not json',
    });
    const res = await postCreate(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/proposals/[id]/start route', () => {
  it('200 returns snapshotRecordId for an internal caller', async () => {
    process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;
    installDeps();
    const res = await postStart(internalReq('http://t/api/proposals/p_1/start'), ctx('p_1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.snapshotRecordId).toBe('rec_snap');
  });

  it('403 when the caller is not an admin/internal', async () => {
    const deps = installDeps();
    const res = await postStart(
      new Request('http://t/api/proposals/p_1/start', { method: 'POST' }),
      ctx('p_1'),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(deps.engine.activate).not.toHaveBeenCalled();
  });
});

describe('GET /api/proposals/[id]/snapshot route', () => {
  it('200 returns the frozen snapshot with bigints as strings', async () => {
    installDeps();
    const res = await getSnapshot(
      new Request('http://t/api/proposals/p_1/snapshot'),
      ctx('p_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalSupplySnapshot).toBe('10000');
    expect(body.data.memberCount).toBe(5);
  });

  it('200 attaches memberWeight from the ?memberId= query', async () => {
    installDeps();
    const res = await getSnapshot(
      new Request('http://t/api/proposals/p_1/snapshot?memberId=m_1'),
      ctx('p_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.memberWeight).toBe('1200');
  });

  it('409 when the proposal is not yet activated', async () => {
    installDeps({
      snapshot: { findProposal: vi.fn().mockResolvedValue(snapRow({ status: 'draft', snapshotAt: null })) },
    });
    const res = await getSnapshot(
      new Request('http://t/api/proposals/p_1/snapshot'),
      ctx('p_1'),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_STATUS');
  });
});

describe('POST /api/proposals/[id]/vote route', () => {
  it('201 casts a new vote', async () => {
    installDeps();
    const res = await postVote(
      memberReq('http://t/api/proposals/p_1/vote', { memberId: 'm_1', optionId: 'approve' }),
      ctx('p_1'),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.voteId).toBe('v_1');
  });

  it('403 when the member is outside the snapshot', async () => {
    const { EngineError } = await import('../../engine/errors');
    installDeps({
      engine: { castVote: vi.fn().mockRejectedValue(new EngineError('FORBIDDEN', 'outside')) },
    });
    const res = await postVote(
      memberReq('http://t/api/proposals/p_1/vote', { memberId: 'stranger', optionId: 'approve' }),
      ctx('p_1'),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/proposals/[id]/end route', () => {
  it('200 lets an internal-token caller settle (permission matrix)', async () => {
    process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;
    installDeps();
    const res = await postEnd(internalReq('http://t/api/proposals/p_1/end'), ctx('p_1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalVoteWeight).toBe('1500');
    expect(body.data.quorumMet).toBe(true);
  });

  it('403 when neither admin nor internal', async () => {
    const deps = installDeps();
    const res = await postEnd(
      new Request('http://t/api/proposals/p_1/end', { method: 'POST' }),
      ctx('p_1'),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(deps.engine.end).not.toHaveBeenCalled();
  });
});
