import { describe, it, expect, vi } from 'vitest';

import {
  withIdempotency,
  createPrismaIdempotencyStore,
  type IdempotencyStore,
  type IdempotencyRow,
} from './idempotency';
import { ok, type ApiResult } from './respond';

function memStore(seed?: IdempotencyRow): {
  store: IdempotencyStore;
  saves: Array<{ endpoint: string; key: string; row: IdempotencyRow }>;
} {
  const saves: Array<{ endpoint: string; key: string; row: IdempotencyRow }> = [];
  let current: IdempotencyRow | null = seed ?? null;
  const store: IdempotencyStore = {
    find: async () => current,
    save: async (endpoint, key, requestHash, responseStatus, responseBody) => {
      current = { requestHash, responseStatus, responseBody };
      saves.push({ endpoint, key, row: current });
    },
  };
  return { store, saves };
}

describe('withIdempotency', () => {
  it('rejects a missing key with 400 IDEMPOTENCY_KEY_REQUIRED and never runs', async () => {
    const { store } = memStore();
    const run = vi.fn(async () => ok({}, 200));
    const res = await withIdempotency(store, { endpoint: 'POST /x', key: null, requestHash: 'h' }, run);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    expect(run).not.toHaveBeenCalled();
  });

  it('executes run exactly once on first call and persists the 2xx result', async () => {
    const { store, saves } = memStore();
    const run = vi.fn(async () => ok({ id: 'a' }, 201));
    const res = await withIdempotency(
      store,
      { endpoint: 'POST /x', key: 'k1', requestHash: 'h1' },
      run,
    );
    expect(res.status).toBe(201);
    expect(run).toHaveBeenCalledTimes(1);
    expect(saves).toHaveLength(1);
    expect(saves[0].row.requestHash).toBe('h1');
  });

  it('replays the stored result without running again (spy = 1 total across two calls)', async () => {
    const { store } = memStore();
    const run = vi.fn(async () => ok({ id: 'a' }, 201));
    const first = await withIdempotency(store, { endpoint: 'POST /x', key: 'k1', requestHash: 'h1' }, run);
    const second = await withIdempotency(store, { endpoint: 'POST /x', key: 'k1', requestHash: 'h1' }, run);
    expect(run).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
  });

  it('returns 409 IDEMPOTENCY_CONFLICT when the key is reused with a different hash', async () => {
    const { store } = memStore({ requestHash: 'h1', responseStatus: 201, responseBody: ok({}, 201).body });
    const run = vi.fn(async () => ok({}, 201));
    const res = await withIdempotency(
      store,
      { endpoint: 'POST /x', key: 'k1', requestHash: 'DIFFERENT' },
      run,
    );
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(run).not.toHaveBeenCalled();
  });

  it('does not persist non-2xx results', async () => {
    const { store, saves } = memStore();
    const run = vi.fn(async () => ok(null, 409));
    // 409 is not 2xx
    const failing = { status: 409, body: ok(null, 409).body } as ApiResult;
    const runFail = vi.fn(async () => failing);
    const res = await withIdempotency(store, { endpoint: 'POST /x', key: 'k1', requestHash: 'h1' }, runFail);
    expect(res.status).toBe(409);
    expect(saves).toHaveLength(0);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('createPrismaIdempotencyStore', () => {
  it('find parses the JSON string responseBody from the delegate into an object', async () => {
    // The `responseBody` column is String (schema.prisma:381); the delegate
    // returns a JSON string, which find must JSON.parse back into the envelope.
    const stored = { requestHash: 'h', responseStatus: 200, responseBody: JSON.stringify({ ok: true }) };
    const findUnique = vi.fn().mockResolvedValue(stored);
    const store = createPrismaIdempotencyStore({
      idempotencyKey: { findUnique, create: vi.fn() },
    });
    const got = await store.find('POST /x', 'k1');
    expect(got).toEqual({ requestHash: 'h', responseStatus: 200, responseBody: { ok: true } });
    expect(findUnique).toHaveBeenCalledWith({
      where: { endpoint_key: { endpoint: 'POST /x', key: 'k1' } },
    });
  });

  it('find returns null when the delegate has no row', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const store = createPrismaIdempotencyStore({
      idempotencyKey: { findUnique, create: vi.fn() },
    });
    expect(await store.find('POST /x', 'missing')).toBeNull();
  });

  it('save serializes the envelope object into a JSON string for the String column', async () => {
    const create = vi.fn().mockResolvedValue({});
    const store = createPrismaIdempotencyStore({
      idempotencyKey: { findUnique: vi.fn(), create },
    });
    const body = { success: true, data: { id: 'a' }, error: null };
    await store.save('POST /x', 'k1', 'h1', 201, body);
    expect(create).toHaveBeenCalledWith({
      data: {
        endpoint: 'POST /x',
        key: 'k1',
        requestHash: 'h1',
        responseStatus: 201,
        responseBody: JSON.stringify(body),
      },
    });
  });

  it('save then find round-trips the envelope object through the JSON string column', async () => {
    let persisted: { requestHash: string; responseStatus: number; responseBody: string } | null = null;
    const store = createPrismaIdempotencyStore({
      idempotencyKey: {
        findUnique: vi.fn(async () => persisted),
        create: vi.fn(async (args: { data: { requestHash: string; responseStatus: number; responseBody: string } }) => {
          persisted = {
            requestHash: args.data.requestHash,
            responseStatus: args.data.responseStatus,
            responseBody: args.data.responseBody,
          };
          return {};
        }),
      },
    });
    const body = { success: true, data: { id: 'a', amount: '100' }, error: null };
    await store.save('POST /x', 'k1', 'h1', 201, body);
    expect(typeof persisted!.responseBody).toBe('string');
    const got = await store.find('POST /x', 'k1');
    expect(got).toEqual({ requestHash: 'h1', responseStatus: 201, responseBody: body });
  });

  it('save swallows a P2002 unique-violation as idempotent success', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const store = createPrismaIdempotencyStore({
      idempotencyKey: { findUnique: vi.fn(), create },
    });
    await expect(
      store.save('POST /x', 'k1', 'h1', 201, { success: true, data: null, error: null }),
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalled();
  });

  it('save rethrows non-P2002 errors', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: 'P1000' }));
    const store = createPrismaIdempotencyStore({
      idempotencyKey: { findUnique: vi.fn(), create },
    });
    await expect(store.save('POST /x', 'k1', 'h1', 201, {})).rejects.toThrow('boom');
  });
});
