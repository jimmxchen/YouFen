import { describe, it, expect, vi, afterEach } from 'vitest';

import { POST as postClose } from '../../../app/api/internal/token-epochs/[id]/close/route';
import { POST as postCreateNext } from '../../../app/api/internal/token-epochs/create-next/route';
import { POST as postFinalize } from '../../../app/api/internal/reversals/[id]/finalize-supersede/route';

import { setDepsForTesting } from './deps';
import type { InternalDeps, InternalRuntimePort } from './handlers';

// The internal route adapters must resolve deps through resolveInternalDeps and
// enforce auth inside the handler. These tests inject fake deps directly
// (setDepsForTesting) so no engine runtime / DB is ever built.

const TOKEN = 'internal-api-token-value';
const CRON = 'cron-secret-value';

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

function installDeps(
  runtime: InternalRuntimePort,
  onEpochClosed?: InternalDeps['onEpochClosed'],
): void {
  setDepsForTesting({
    runtime,
    env: { cronSecret: CRON, internalApiToken: TOKEN },
    onEpochClosed,
  });
}

function makeRuntime(overrides: {
  closeEpoch?: ReturnType<typeof vi.fn>;
  createNextEpoch?: ReturnType<typeof vi.fn>;
  finalizeSupersede?: ReturnType<typeof vi.fn>;
}): InternalRuntimePort {
  return {
    epoch: {
      closeEpoch: overrides.closeEpoch ?? vi.fn(),
      createNextEpoch: overrides.createNextEpoch ?? vi.fn(),
    },
    reversal: {
      finalizeSupersede: overrides.finalizeSupersede ?? vi.fn(),
    },
  };
}

function authedPost(url: string, body?: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

afterEach(() => {
  setDepsForTesting(null);
  vi.restoreAllMocks();
});

describe('POST /api/internal/token-epochs/[id]/close route', () => {
  it('200 delegates the awaited param id to closeEpoch and fires the hook', async () => {
    const closeEpoch = vi.fn().mockResolvedValue({
      communityId: 'c_1',
      nextEpochId: 'ep_2',
      chainRecordIds: ['pr_a'],
    });
    const onEpochClosed = vi.fn();
    installDeps(makeRuntime({ closeEpoch }), onEpochClosed);

    const res = await postClose(
      authedPost('http://t/api/internal/token-epochs/ep_1/close'),
      ctx('ep_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      communityId: 'c_1',
      nextEpochId: 'ep_2',
      chainRecordIds: ['pr_a'],
    });
    expect(closeEpoch).toHaveBeenCalledWith('ep_1');
    expect(onEpochClosed).toHaveBeenCalledWith('c_1', 'ep_1');
  });

  it('401 when unauthorized', async () => {
    const closeEpoch = vi.fn();
    installDeps(makeRuntime({ closeEpoch }));

    const res = await postClose(
      new Request('http://t/api/internal/token-epochs/ep_1/close', { method: 'POST' }),
      ctx('ep_1'),
    );

    expect(res.status).toBe(401);
    expect(closeEpoch).not.toHaveBeenCalled();
  });
});

describe('POST /api/internal/token-epochs/create-next route', () => {
  it('200 validates the body and delegates communityId to createNextEpoch', async () => {
    const createNextEpoch = vi.fn().mockResolvedValue({ epochId: 'ep_9', created: true });
    installDeps(makeRuntime({ createNextEpoch }));

    const res = await postCreateNext(
      authedPost('http://t/api/internal/token-epochs/create-next', { communityId: 'c_1' }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ epochId: 'ep_9', created: true });
    expect(createNextEpoch).toHaveBeenCalledWith('c_1');
  });

  it('400 VALIDATION_ERROR on malformed JSON, without touching the engine', async () => {
    const createNextEpoch = vi.fn();
    installDeps(makeRuntime({ createNextEpoch }));

    const res = await postCreateNext(
      new Request('http://t/api/internal/token-epochs/create-next', {
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(createNextEpoch).not.toHaveBeenCalled();
  });

  it('400 VALIDATION_ERROR when communityId is missing from the body', async () => {
    const createNextEpoch = vi.fn();
    installDeps(makeRuntime({ createNextEpoch }));

    const res = await postCreateNext(
      authedPost('http://t/api/internal/token-epochs/create-next', {}),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(createNextEpoch).not.toHaveBeenCalled();
  });
});

describe('POST /api/internal/reversals/[id]/finalize-supersede route', () => {
  it('200 finalized:true delegates the awaited param id', async () => {
    const finalizeSupersede = vi.fn().mockResolvedValue(true);
    installDeps(makeRuntime({ finalizeSupersede }));

    const res = await postFinalize(
      authedPost('http://t/api/internal/reversals/rev_1/finalize-supersede'),
      ctx('rev_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ finalized: true });
    expect(finalizeSupersede).toHaveBeenCalledWith('rev_1');
  });

  it('200 finalized:false is retryable when not yet verified', async () => {
    const finalizeSupersede = vi.fn().mockResolvedValue(false);
    installDeps(makeRuntime({ finalizeSupersede }));

    const res = await postFinalize(
      authedPost('http://t/api/internal/reversals/rev_1/finalize-supersede'),
      ctx('rev_1'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ finalized: false });
  });
});
