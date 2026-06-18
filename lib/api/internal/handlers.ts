// Pure internal-API handlers (W5-6). Cron/ops-only endpoints for epoch rollover
// and reversal supersede finalization. Every handler is a
// (deps, input) => Promise<ApiResult> function with all collaborators injected,
// so it imports nothing from the runtime and is fully unit-testable with
// structural fakes. Route adapters wire real deps from the engine runtime.
//
// AUTH (conventions §internal): a Bearer token matching EITHER CRON_SECRET or
// INTERNAL_API_TOKEN passes. When BOTH env vars are missing the endpoint refuses
// with 503 and a server-side console.error instead of running naked. A caller
// that is simply not internal gets an opaque 401 (no detail leak).

import {
  fail,
  mapEngineError,
  ok,
  resolveAuthFromHeaders,
  type ApiResult,
  type HeaderReader,
} from '../core';
import type { EpochService, ReversalService } from '../../engine/types';

// ---- Injected ports (structural subsets of the engine runtime) ----

/** The epoch-service surface the internal handlers touch. */
export type EpochPort = Pick<EpochService, 'closeEpoch' | 'createNextEpoch'>;

/** The reversal-service surface the internal handlers touch. */
export type ReversalPort = Pick<ReversalService, 'finalizeSupersede'>;

/** The engine subset the internal handlers depend on. */
export interface InternalRuntimePort {
  readonly epoch: EpochPort;
  readonly reversal: ReversalPort;
}

/** Internal-auth material resolved from env at the route/deps edge. */
export interface InternalAuthEnv {
  readonly cronSecret: string | null;
  readonly internalApiToken: string | null;
}

/**
 * Fired (best-effort, never awaited) after a successful non-noop epoch close.
 * Default undefined; production can wire lib/ai health-report here — see notes.
 */
export type EpochClosedHook = (
  communityId: string,
  epochId: string,
) => void | Promise<void>;

export interface InternalDeps {
  readonly runtime: InternalRuntimePort;
  readonly env: InternalAuthEnv;
  readonly onEpochClosed?: EpochClosedHook;
}

// ---- Auth guard ----

export type InternalAuthDecision =
  | { readonly kind: 'authorized' }
  | { readonly kind: 'unconfigured' }
  | { readonly kind: 'unauthorized' };

/** True when a string env value is present and non-empty. */
function present(value: string | null): boolean {
  return value !== null && value.length > 0;
}

/**
 * Classify an internal request: `unconfigured` when neither secret is set (the
 * server must refuse, not run naked), `unauthorized` when the Bearer token
 * matches neither secret, `authorized` otherwise.
 */
export function checkInternalAuth(
  env: InternalAuthEnv,
  headers: HeaderReader,
): InternalAuthDecision {
  if (!present(env.cronSecret) && !present(env.internalApiToken)) {
    return { kind: 'unconfigured' };
  }
  const ctx = resolveAuthFromHeaders(headers, {
    internalApiToken: env.internalApiToken,
    cronSecret: env.cronSecret,
  });
  if (!ctx.isInternal) {
    return { kind: 'unauthorized' };
  }
  return { kind: 'authorized' };
}

/**
 * Guard the request. Returns an error ApiResult to short-circuit on, or null
 * when the caller is authorized. The 503 path logs a server-side diagnostic so
 * a misconfigured deployment is visible instead of silently open/closed.
 */
export function guardInternal(
  env: InternalAuthEnv,
  headers: HeaderReader,
): ApiResult | null {
  const decision = checkInternalAuth(env, headers);
  if (decision.kind === 'authorized') {
    return null;
  }
  if (decision.kind === 'unconfigured') {
    console.error(
      '[internal-api] refused: neither CRON_SECRET nor INTERNAL_API_TOKEN is configured',
    );
    return fail(503, 'SERVICE_UNAVAILABLE', 'Internal API is not configured');
  }
  return fail(401, 'UNAUTHORIZED', 'Internal authorization required');
}

/**
 * Fire the post-close hook synchronously (so tests can assert it was called)
 * while never letting its outcome — sync throw or async rejection — affect the
 * request: failures are swallowed to a server-side console.error.
 */
function fireEpochClosed(
  hook: EpochClosedHook | undefined,
  communityId: string,
  epochId: string,
): void {
  if (hook === undefined) {
    return;
  }
  try {
    const result = hook(communityId, epochId);
    if (result instanceof Promise) {
      result.catch((error: unknown) => {
        console.error('[internal-api] onEpochClosed hook failed', error);
      });
    }
  } catch (error: unknown) {
    console.error('[internal-api] onEpochClosed hook failed', error);
  }
}

// ---- Handlers ----

/**
 * POST /api/internal/token-epochs/:id/close — close an active epoch and roll to
 * the next. A no-op (already closed) is idempotent-200. On a real close the
 * post-close hook fires best-effort with the communityId returned by the engine
 * (no extra query) and the closed epochId. EPOCH_NOT_ACTIVE / INVALID_STATUS map
 * to 409 via mapEngineError.
 */
export async function handleCloseEpoch(
  deps: InternalDeps,
  input: { headers: HeaderReader; epochId: string },
): Promise<ApiResult> {
  const denied = guardInternal(deps.env, input.headers);
  if (denied !== null) {
    return denied;
  }
  try {
    const result = await deps.runtime.epoch.closeEpoch(input.epochId);
    if ('noop' in result) {
      return ok({ idempotent: true });
    }
    fireEpochClosed(deps.onEpochClosed, result.communityId, input.epochId);
    return ok({
      communityId: result.communityId,
      nextEpochId: result.nextEpochId,
      chainRecordIds: result.chainRecordIds,
    });
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}

/**
 * POST /api/internal/token-epochs/create-next — ensure the next upcoming epoch
 * exists for a community. Idempotent: `created` reflects whether this call did
 * the insert. Body is validated by the caller (route); the parsed communityId is
 * passed in.
 */
export async function handleCreateNextEpoch(
  deps: InternalDeps,
  input: { headers: HeaderReader; communityId: string },
): Promise<ApiResult> {
  const denied = guardInternal(deps.env, input.headers);
  if (denied !== null) {
    return denied;
  }
  try {
    const result = await deps.runtime.epoch.createNextEpoch(input.communityId);
    return ok({ epochId: result.epochId, created: result.created });
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}

/**
 * POST /api/internal/reversals/:id/finalize-supersede — flip a verified reversal
 * to supersede its original record. Returns finalized:false (200) when the
 * reversal record is not yet verified, so a cron/operator can safely retry.
 * A missing reversal maps to 404 via mapEngineError.
 */
export async function handleFinalizeSupersede(
  deps: InternalDeps,
  input: { headers: HeaderReader; reversalId: string },
): Promise<ApiResult> {
  const denied = guardInternal(deps.env, input.headers);
  if (denied !== null) {
    return denied;
  }
  try {
    const finalized = await deps.runtime.reversal.finalizeSupersede(
      input.reversalId,
    );
    return ok({ finalized });
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}
