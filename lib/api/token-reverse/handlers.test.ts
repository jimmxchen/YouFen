import { describe, it, expect, vi } from 'vitest';

import type { AuthContext } from '../core/auth';
import { hashRequestBody, type IdempotencyRow, type IdempotencyStore } from '../core';
import { REVERSAL_REASONS } from '../../engine/types';

import {
  handleReverse,
  reverseBodySchema,
  type ExistingReversal,
  type ReverseBody,
  type ReverseDeps,
} from './handlers';

function engineError(code: string, message = code): Error {
  const e = new Error(message);
  (e as Error & { code: string }).code = code;
  return e;
}

/** Minimal in-memory idempotency store mirroring the Prisma adapter semantics. */
function memStore(): IdempotencyStore {
  const rows = new Map<string, IdempotencyRow>();
  return {
    find: async (endpoint, key) => rows.get(`${endpoint}:${key}`) ?? null,
    save: async (endpoint, key, requestHash, responseStatus, responseBody) => {
      rows.set(`${endpoint}:${key}`, { requestHash, responseStatus, responseBody });
    },
  };
}

const admin: AuthContext = { actorId: 'admin1', isAdmin: true, isInternal: false };
const anon: AuthContext = { actorId: null, isAdmin: false, isInternal: false };
const member: AuthContext = { actorId: 'm2', isAdmin: false, isInternal: false };

function body(over: Partial<ReverseBody> = {}): ReverseBody {
  return { originalMintEventId: 'mint1', reason: 'entry_error', ...over };
}

function makeDeps(over: Partial<ReverseDeps> = {}): ReverseDeps {
  return {
    reversal: {
      reverseMint: vi.fn().mockResolvedValue({ reversalEventId: 'rev1', publicRecordId: 'rec1' }),
    },
    findExistingReversal: vi.fn().mockResolvedValue(null),
    idempotencyStore: memStore(),
    authorize: () => true,
    ...over,
  };
}

function idem(b: ReverseBody, key: string | null): {
  endpoint: string;
  key: string | null;
  requestHash: string;
} {
  return { endpoint: 'POST /api/token/reverse', key, requestHash: hashRequestBody(b) };
}

describe('reverseBodySchema', () => {
  it('accepts all six reversal reasons', () => {
    for (const reason of REVERSAL_REASONS) {
      const parsed = reverseBodySchema.safeParse({ originalMintEventId: 'x', reason });
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects an unknown reason', () => {
    const parsed = reverseBodySchema.safeParse({ originalMintEventId: 'x', reason: 'nope' });
    expect(parsed.success).toBe(false);
  });

  it('coerces an optional string amount to bigint', () => {
    const parsed = reverseBodySchema.parse({
      originalMintEventId: 'x',
      reason: 'entry_error',
      amount: '25',
    });
    expect(parsed.amount).toBe(25n);
  });
});

describe('handleReverse', () => {
  it('reverses a mint and returns 201 with the reversal + record ids', async () => {
    const deps = makeDeps();
    const b = body();
    const res = await handleReverse(deps, { body: b, ctx: admin, idempotency: idem(b, 'k1') });

    expect(res.status).toBe(201);
    const d = res.body.data as Record<string, unknown>;
    expect(d.reversalEventId).toBe('rev1');
    expect(d.publicRecordId).toBe('rec1');
    expect(deps.reversal.reverseMint).toHaveBeenCalledWith(
      expect.objectContaining({ approvedBy: 'admin1', reason: 'entry_error' }),
    );
  });

  it('forbids an anonymous caller (403)', async () => {
    const reverseMint = vi.fn();
    const deps = makeDeps({ authorize: () => false, reversal: { reverseMint } });
    const b = body();
    const res = await handleReverse(deps, { body: b, ctx: anon, idempotency: idem(b, 'k1') });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
    expect(reverseMint).not.toHaveBeenCalled();
  });

  it('forbids a non-admin member (403)', async () => {
    const deps = makeDeps({ authorize: () => false });
    const b = body();
    const res = await handleReverse(deps, { body: b, ctx: member, idempotency: idem(b, 'k1') });
    expect(res.status).toBe(403);
  });

  it('maps a missing-proposal PROPOSAL_REQUIRED to 403', async () => {
    const deps = makeDeps({
      reversal: { reverseMint: vi.fn().mockRejectedValue(engineError('PROPOSAL_REQUIRED')) },
    });
    const b = body({ reason: 'community_proposal' });
    const res = await handleReverse(deps, { body: b, ctx: admin, idempotency: idem(b, 'k1') });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('PROPOSAL_REQUIRED');
  });

  it('maps INVALID_REASON to 400', async () => {
    const deps = makeDeps({
      reversal: { reverseMint: vi.fn().mockRejectedValue(engineError('INVALID_REASON')) },
    });
    const b = body();
    const res = await handleReverse(deps, { body: b, ctx: admin, idempotency: idem(b, 'k1') });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_REASON');
  });

  it('returns 200 idempotent replay when the mint is ALREADY_REVERSED', async () => {
    const existing: ExistingReversal = { id: 'revOld', publicRecordId: 'recOld' };
    const deps = makeDeps({
      reversal: { reverseMint: vi.fn().mockRejectedValue(engineError('ALREADY_REVERSED')) },
      findExistingReversal: vi.fn().mockResolvedValue(existing),
    });
    const b = body();
    const res = await handleReverse(deps, { body: b, ctx: admin, idempotency: idem(b, 'k1') });

    expect(res.status).toBe(200);
    const d = res.body.data as Record<string, unknown>;
    expect(d.idempotent).toBe(true);
    expect(d.reversalEventId).toBe('revOld');
  });

  it('requires an Idempotency-Key (400 when absent)', async () => {
    const reverseMint = vi.fn().mockResolvedValue({ reversalEventId: 'rev1', publicRecordId: 'rec1' });
    const deps = makeDeps({ reversal: { reverseMint } });
    const b = body();
    const res = await handleReverse(deps, { body: b, ctx: admin, idempotency: idem(b, null) });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(reverseMint).not.toHaveBeenCalled();
  });

  it('replays a stored 201 without re-executing on the same key', async () => {
    const reverseMint = vi.fn().mockResolvedValue({ reversalEventId: 'rev1', publicRecordId: 'rec1' });
    const deps = makeDeps({ reversal: { reverseMint } });
    const b = body();

    const first = await handleReverse(deps, { body: b, ctx: admin, idempotency: idem(b, 'k9') });
    const second = await handleReverse(deps, { body: b, ctx: admin, idempotency: idem(b, 'k9') });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data).toEqual(first.body.data);
    expect(reverseMint).toHaveBeenCalledTimes(1);
  });
});
