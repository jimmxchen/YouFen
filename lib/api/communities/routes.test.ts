import { describe, it, expect, vi, afterEach } from 'vitest';

import { setDepsForTesting } from './deps';
import type { CommunitiesDeps } from './handlers';

import { GET as getPolicy } from '../../../app/api/communities/[id]/token-policy/route';
import { POST as postProposal } from '../../../app/api/communities/[id]/token-policy/proposals/route';
import { GET as getVersions } from '../../../app/api/communities/[id]/token-policy/versions/route';
import { GET as getEpochs } from '../../../app/api/communities/[id]/token-epochs/route';
import { GET as getLedger } from '../../../app/api/communities/[id]/token-ledger/route';

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

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
  publicRecord: { findMany: ReturnType<typeof vi.fn> };
}

function makeDb(): FakeDb {
  return {
    communityTokenPolicy: { findUnique: vi.fn() },
    communityTokenState: { findUnique: vi.fn().mockResolvedValue({ currentTotalSupply: 0n }) },
    tokenPolicyVersion: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    tokenEpoch: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    tokenMintEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    tokenReversalEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    publicRecord: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

function install(db: FakeDb, over: Partial<CommunitiesDeps> = {}): void {
  const deps: CommunitiesDeps = {
    db: db as unknown as CommunitiesDeps['db'],
    proposal: { create: vi.fn().mockResolvedValue({ proposalId: 'prop_9' }) },
    authorize: () => true,
    ...over,
  };
  setDepsForTesting(deps);
}

afterEach(() => {
  setDepsForTesting(null);
  vi.restoreAllMocks();
});

describe('GET /api/communities/[id]/token-policy route', () => {
  it('200 passes the handler envelope through', async () => {
    const db = makeDb();
    db.communityTokenPolicy.findUnique.mockResolvedValue({
      id: 'pol_1',
      communityId: 'c_1',
      tokenName: 'Axo',
      tokenSymbol: 'AXO',
      initialSupply: 1n,
      epochDurationDays: 30,
      monthlyInflationRateBps: 200,
      maxAdvanceRateBps: 1000,
      memberMintCapRateBps: 1000,
      policyVersion: 1,
      effectiveEpoch: 1,
      rules: [],
      isTransferable: false,
      pendingPolicyVersionId: null,
      pendingPolicyEffectiveEpoch: null,
    });
    db.communityTokenState.findUnique.mockResolvedValue({ currentTotalSupply: 42n });
    install(db);
    const res = await getPolicy(new Request('http://t/api/communities/c_1/token-policy'), ctx('c_1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.currentTotalSupply).toBe('42');
    expect(body.data.monthlyInflationRateBps).toBe(200);
  });

  it('404 when the policy is missing', async () => {
    const db = makeDb();
    db.communityTokenPolicy.findUnique.mockResolvedValue(null);
    install(db);
    const res = await getPolicy(new Request('http://t/api/communities/ghost/token-policy'), ctx('ghost'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/communities/[id]/token-policy/proposals route', () => {
  it('201 creates a proposal for an admin caller', async () => {
    const db = makeDb();
    const create = vi.fn().mockResolvedValue({ proposalId: 'prop_9' });
    install(db, { proposal: { create }, authorize: () => true });
    const req = new Request('http://t/api/communities/c_1/token-policy/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        monthlyInflationRateBps: 200,
        maxAdvanceRateBps: 1000,
        memberMintCapRateBps: 900,
      }),
    });
    const res = await postProposal(req, ctx('c_1'));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.proposalId).toBe('prop_9');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'token_policy_change', communityId: 'c_1' }),
    );
  });

  it('403 for a non-admin caller', async () => {
    const db = makeDb();
    const create = vi.fn();
    install(db, { proposal: { create }, authorize: () => false });
    const req = new Request('http://t/api/communities/c_1/token-policy/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        monthlyInflationRateBps: 200,
        maxAdvanceRateBps: 1000,
        memberMintCapRateBps: 900,
      }),
    });
    const res = await postProposal(req, ctx('c_1'));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe('FORBIDDEN');
    expect(create).not.toHaveBeenCalled();
  });

  it('400 when the JSON body is malformed', async () => {
    const db = makeDb();
    install(db);
    const req = new Request('http://t/api/communities/c_1/token-policy/proposals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    const res = await postProposal(req, ctx('c_1'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/communities/[id]/token-policy/versions route', () => {
  it('200 with pagination meta from the query string', async () => {
    const db = makeDb();
    db.communityTokenPolicy.findUnique.mockResolvedValue({ id: 'pol_1' });
    db.tokenPolicyVersion.count.mockResolvedValue(7);
    install(db);
    const res = await getVersions(
      new Request('http://t/api/communities/c_1/token-policy/versions?page=2&limit=5'),
      ctx('c_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta).toEqual({ total: 7, page: 2, limit: 5 });
  });
});

describe('GET /api/communities/[id]/token-epochs route', () => {
  it('200 with default pagination meta', async () => {
    const db = makeDb();
    db.tokenEpoch.count.mockResolvedValue(3);
    install(db);
    const res = await getEpochs(
      new Request('http://t/api/communities/c_1/token-epochs'),
      ctx('c_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.meta).toEqual({ total: 3, page: 1, limit: 20 });
  });
});

describe('GET /api/communities/[id]/token-ledger route', () => {
  it('200 for a valid filter', async () => {
    const db = makeDb();
    install(db);
    const res = await getLedger(
      new Request('http://t/api/communities/c_1/token-ledger?filter=reversal'),
      ctx('c_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(db.tokenReversalEvent.findMany).toHaveBeenCalled();
  });

  it('400 for an illegal filter', async () => {
    const db = makeDb();
    install(db);
    const res = await getLedger(
      new Request('http://t/api/communities/c_1/token-ledger?filter=nope'),
      ctx('c_1'),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
