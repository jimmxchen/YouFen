import { describe, it, expect, vi, beforeEach } from 'vitest';

import { EngineError } from '../../engine/errors';
import type { HeaderReader } from '../core';

import {
  checkInternalAuth,
  handleCloseEpoch,
  handleCreateNextEpoch,
  handleFinalizeSupersede,
  type EpochPort,
  type InternalAuthEnv,
  type InternalDeps,
  type InternalRuntimePort,
  type ReversalPort,
} from './handlers';

const CRON = 'cron-secret-value';
const TOKEN = 'internal-api-token-value';

/** A minimal HeaderReader carrying an optional Bearer authorization header. */
function headers(bearer?: string): HeaderReader {
  const map = new Map<string, string>();
  if (bearer !== undefined) {
    map.set('authorization', `Bearer ${bearer}`);
  }
  return { get: (name) => map.get(name.toLowerCase()) ?? null };
}

const bothEnv: InternalAuthEnv = { cronSecret: CRON, internalApiToken: TOKEN };
const missingEnv: InternalAuthEnv = { cronSecret: null, internalApiToken: null };

function makeEpoch(overrides: Partial<EpochPort> = {}): EpochPort {
  return {
    closeEpoch: vi.fn(),
    createNextEpoch: vi.fn(),
    ...overrides,
  };
}

function makeReversal(overrides: Partial<ReversalPort> = {}): ReversalPort {
  return {
    finalizeSupersede: vi.fn(),
    ...overrides,
  };
}

function makeDeps(
  runtime: InternalRuntimePort,
  env: InternalAuthEnv = bothEnv,
  onEpochClosed?: InternalDeps['onEpochClosed'],
): InternalDeps {
  return { runtime, env, onEpochClosed };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- Auth matrix (5 states), exercised through handleCloseEpoch ----

describe('internal auth matrix', () => {
  it('checkInternalAuth classifies all five states', () => {
    expect(checkInternalAuth(bothEnv, headers()).kind).toBe('unauthorized'); // no token
    expect(checkInternalAuth(bothEnv, headers('wrong')).kind).toBe('unauthorized');
    expect(checkInternalAuth(bothEnv, headers(CRON)).kind).toBe('authorized');
    expect(checkInternalAuth(bothEnv, headers(TOKEN)).kind).toBe('authorized');
    expect(checkInternalAuth(missingEnv, headers(CRON)).kind).toBe('unconfigured');
  });

  it('401 when no token is presented, without touching the engine', async () => {
    const epoch = makeEpoch();
    const res = await handleCloseEpoch(makeDeps({ epoch, reversal: makeReversal() }), {
      headers: headers(),
      epochId: 'ep_1',
    });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
    expect(epoch.closeEpoch).not.toHaveBeenCalled();
  });

  it('401 when the token matches neither secret', async () => {
    const epoch = makeEpoch();
    const res = await handleCloseEpoch(makeDeps({ epoch, reversal: makeReversal() }), {
      headers: headers('bogus'),
      epochId: 'ep_1',
    });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
    expect(epoch.closeEpoch).not.toHaveBeenCalled();
  });

  it('passes with the CRON_SECRET bearer token', async () => {
    const epoch = makeEpoch({
      closeEpoch: vi.fn().mockResolvedValue({ noop: true }),
    });
    const res = await handleCloseEpoch(makeDeps({ epoch, reversal: makeReversal() }), {
      headers: headers(CRON),
      epochId: 'ep_1',
    });
    expect(res.status).toBe(200);
    expect(epoch.closeEpoch).toHaveBeenCalledWith('ep_1');
  });

  it('passes with the INTERNAL_API_TOKEN bearer token', async () => {
    const epoch = makeEpoch({
      closeEpoch: vi.fn().mockResolvedValue({ noop: true }),
    });
    const res = await handleCloseEpoch(makeDeps({ epoch, reversal: makeReversal() }), {
      headers: headers(TOKEN),
      epochId: 'ep_1',
    });
    expect(res.status).toBe(200);
    expect(epoch.closeEpoch).toHaveBeenCalledWith('ep_1');
  });

  it('503 and a console.error when both secrets are absent, engine untouched', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const epoch = makeEpoch();
    const res = await handleCloseEpoch(
      makeDeps({ epoch, reversal: makeReversal() }, missingEnv),
      { headers: headers(CRON), epochId: 'ep_1' },
    );
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe('SERVICE_UNAVAILABLE');
    expect(epoch.closeEpoch).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---- close ----

describe('handleCloseEpoch', () => {
  it('200 with the roll-forward result and fires onEpochClosed with (communityId, epochId)', async () => {
    const epoch = makeEpoch({
      closeEpoch: vi.fn().mockResolvedValue({
        communityId: 'c_1',
        nextEpochId: 'ep_2',
        chainRecordIds: ['pr_a', 'pr_b'],
      }),
    });
    const onEpochClosed = vi.fn();
    const res = await handleCloseEpoch(
      makeDeps({ epoch, reversal: makeReversal() }, bothEnv, onEpochClosed),
      { headers: headers(CRON), epochId: 'ep_1' },
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      communityId: 'c_1',
      nextEpochId: 'ep_2',
      chainRecordIds: ['pr_a', 'pr_b'],
    });
    expect(onEpochClosed).toHaveBeenCalledWith('c_1', 'ep_1');
  });

  it('200 idempotent:true on a no-op close and does NOT fire onEpochClosed', async () => {
    const epoch = makeEpoch({
      closeEpoch: vi.fn().mockResolvedValue({ noop: true }),
    });
    const onEpochClosed = vi.fn();
    const res = await handleCloseEpoch(
      makeDeps({ epoch, reversal: makeReversal() }, bothEnv, onEpochClosed),
      { headers: headers(TOKEN), epochId: 'ep_1' },
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ idempotent: true });
    expect(onEpochClosed).not.toHaveBeenCalled();
  });

  it('a rejected onEpochClosed hook is swallowed and never affects the 200 response', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const epoch = makeEpoch({
      closeEpoch: vi.fn().mockResolvedValue({
        communityId: 'c_1',
        nextEpochId: 'ep_2',
        chainRecordIds: [],
      }),
    });
    const onEpochClosed = vi.fn().mockRejectedValue(new Error('health-report down'));
    const res = await handleCloseEpoch(
      makeDeps({ epoch, reversal: makeReversal() }, bothEnv, onEpochClosed),
      { headers: headers(CRON), epochId: 'ep_1' },
    );

    expect(res.status).toBe(200);
    expect(onEpochClosed).toHaveBeenCalled();
    await Promise.resolve();
    spy.mockRestore();
  });

  it('409 when the engine rejects with EPOCH_NOT_ACTIVE', async () => {
    const epoch = makeEpoch({
      closeEpoch: vi.fn().mockRejectedValue(new EngineError('EPOCH_NOT_ACTIVE', 'not active')),
    });
    const res = await handleCloseEpoch(makeDeps({ epoch, reversal: makeReversal() }), {
      headers: headers(CRON),
      epochId: 'ep_1',
    });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('EPOCH_NOT_ACTIVE');
  });

  it('409 when the engine rejects with INVALID_STATUS', async () => {
    const epoch = makeEpoch({
      closeEpoch: vi.fn().mockRejectedValue(new EngineError('INVALID_STATUS', 'already closed')),
    });
    const res = await handleCloseEpoch(makeDeps({ epoch, reversal: makeReversal() }), {
      headers: headers(CRON),
      epochId: 'ep_1',
    });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
  });
});

// ---- create-next ----

describe('handleCreateNextEpoch', () => {
  it('200 created:true when the engine inserts a new epoch', async () => {
    const epoch = makeEpoch({
      createNextEpoch: vi.fn().mockResolvedValue({ epochId: 'ep_9', created: true }),
    });
    const res = await handleCreateNextEpoch(makeDeps({ epoch, reversal: makeReversal() }), {
      headers: headers(CRON),
      communityId: 'c_1',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ epochId: 'ep_9', created: true });
    expect(epoch.createNextEpoch).toHaveBeenCalledWith('c_1');
  });

  it('200 created:false is idempotent when the epoch already exists', async () => {
    const epoch = makeEpoch({
      createNextEpoch: vi.fn().mockResolvedValue({ epochId: 'ep_9', created: false }),
    });
    const res = await handleCreateNextEpoch(makeDeps({ epoch, reversal: makeReversal() }), {
      headers: headers(TOKEN),
      communityId: 'c_1',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ epochId: 'ep_9', created: false });
  });

  it('401 when unauthorized, without touching the engine', async () => {
    const epoch = makeEpoch();
    const res = await handleCreateNextEpoch(makeDeps({ epoch, reversal: makeReversal() }), {
      headers: headers(),
      communityId: 'c_1',
    });
    expect(res.status).toBe(401);
    expect(epoch.createNextEpoch).not.toHaveBeenCalled();
  });
});

// ---- finalize-supersede ----

describe('handleFinalizeSupersede', () => {
  it('200 finalized:true when the reversal is verified and superseded', async () => {
    const reversal = makeReversal({
      finalizeSupersede: vi.fn().mockResolvedValue(true),
    });
    const res = await handleFinalizeSupersede(makeDeps({ epoch: makeEpoch(), reversal }), {
      headers: headers(CRON),
      reversalId: 'rev_1',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ finalized: true });
    expect(reversal.finalizeSupersede).toHaveBeenCalledWith('rev_1');
  });

  it('200 finalized:false when the reversal record is not yet verified (retryable)', async () => {
    const reversal = makeReversal({
      finalizeSupersede: vi.fn().mockResolvedValue(false),
    });
    const res = await handleFinalizeSupersede(makeDeps({ epoch: makeEpoch(), reversal }), {
      headers: headers(TOKEN),
      reversalId: 'rev_1',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ finalized: false });
  });

  it('404 when the reversal event does not exist', async () => {
    const reversal = makeReversal({
      finalizeSupersede: vi
        .fn()
        .mockRejectedValue(new EngineError('NOT_FOUND', 'reversal event not found')),
    });
    const res = await handleFinalizeSupersede(makeDeps({ epoch: makeEpoch(), reversal }), {
      headers: headers(CRON),
      reversalId: 'ghost',
    });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('401 when unauthorized, without touching the engine', async () => {
    const reversal = makeReversal();
    const res = await handleFinalizeSupersede(makeDeps({ epoch: makeEpoch(), reversal }), {
      headers: headers('nope'),
      reversalId: 'rev_1',
    });
    expect(res.status).toBe(401);
    expect(reversal.finalizeSupersede).not.toHaveBeenCalled();
  });
});
