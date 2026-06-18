// Pure Public Records API handlers (BLOCKCHAIN-DESIGN §7, PRD §27). Every handler
// is a (deps, params) => Promise<ApiResult> function with all collaborators
// injected — it imports nothing from the runtime, so it is fully unit-testable
// with structural mocks. Route adapters wire real deps from the runtime.

import { isDisplayableAsConfirmed } from '../../blockchain/records/state-machine';
import { ChainUnavailableError } from '../../blockchain/errors';
import type {
  PublicRecordDTO,
  PublicRecordService,
  RecordPatch,
  RecordVerifier,
} from '../../blockchain/types';

import { fail, mapError, ok, type ApiResult } from './respond';
import type { RateLimiter } from './rate-limit';

// ---- Injected ports (structural subsets of the frozen contracts) ----

/** The record-service surface the handlers touch. */
export type RecordsPort = Pick<
  PublicRecordService,
  'getById' | 'getWithSource' | 'requestSubmission' | 'transition'
>;

/** The verifier surface the handlers touch. */
export type VerifierPort = Pick<RecordVerifier, 'verifyRecord'>;

/** Admin/internal auth material extracted from the request at the route edge. */
export interface AuthInput {
  readonly headerToken: string | null;
}

export type AuthorizeFn = (auth: AuthInput) => boolean;

export interface SubmitDeps {
  readonly records: RecordsPort;
  readonly authorize: AuthorizeFn;
}

export interface RetryDeps {
  readonly records: RecordsPort;
  readonly authorize: AuthorizeFn;
}

export interface GetDeps {
  readonly records: RecordsPort;
  readonly explorerBaseUrl: string;
}

export interface VerifyDeps {
  readonly verifier: VerifierPort;
  readonly records: RecordsPort;
  readonly rateLimiter: RateLimiter;
}

// ---- Helpers ----

/** Unix seconds (rule 9): keys ending in `At` carry Math.floor(ms/1000). */
function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * POST /submit — enqueue a pending record for on-chain submission. requestSubmission
 * throws RecordNotFoundError (->404) or InvalidStatusError (->409) which mapError
 * translates; a `failed` record must go through /retry instead.
 */
export async function handleSubmit(
  deps: SubmitDeps,
  input: { recordId: string; auth: AuthInput },
): Promise<ApiResult> {
  if (!deps.authorize(input.auth)) {
    return fail(401, 'UNAUTHORIZED', 'Missing or invalid admin credentials');
  }
  try {
    const { queued, jobId } = await deps.records.requestSubmission(input.recordId);
    return ok({ recordId: input.recordId, status: 'pending', queued, jobId }, 202);
  } catch (error: unknown) {
    return mapError(error);
  }
}

/**
 * POST /retry — only a `failed` record may retry. Bumps attemptEpoch (which yields
 * a new jobId, §6 idempotency layer 1) and clears lastError, then re-enqueues. A
 * lost race on the conditional transition (0 rows) surfaces as 409.
 */
export async function handleRetry(
  deps: RetryDeps,
  input: { recordId: string; auth: AuthInput },
): Promise<ApiResult> {
  if (!deps.authorize(input.auth)) {
    return fail(401, 'UNAUTHORIZED', 'Missing or invalid admin credentials');
  }
  try {
    const rec = await deps.records.getById(input.recordId);
    if (!rec) {
      return fail(404, 'RECORD_NOT_FOUND', `Public record '${input.recordId}' not found`);
    }
    if (rec.status !== 'failed') {
      return fail(409, 'INVALID_STATUS', `Record is '${rec.status}', expected 'failed'`);
    }

    const nextEpoch = rec.attemptEpoch + 1;
    const moved = await deps.records.transition(input.recordId, ['failed'], 'pending', {
      attemptEpoch: nextEpoch,
      lastError: null,
    });
    if (!moved) {
      return fail(409, 'INVALID_STATUS', 'Record changed status concurrently; retry aborted');
    }

    const { queued, jobId } = await deps.records.requestSubmission(input.recordId);
    return ok(
      { recordId: input.recordId, status: 'pending', queued, jobId, attemptEpoch: nextEpoch },
      202,
    );
  } catch (error: unknown) {
    return mapError(error);
  }
}

/** Build the public `chain` block; only present for `verified` records (PRD §10.4). */
function buildChainBlock(
  rec: PublicRecordDTO,
  explorerBaseUrl: string,
): Record<string, unknown> {
  return {
    txHash: rec.txHash,
    blockNumber: rec.blockNumber,
    confirmedAt: rec.confirmedAt ? toUnixSeconds(rec.confirmedAt) : null,
    explorerUrl: rec.txHash ? `${explorerBaseUrl}/tx/${rec.txHash}` : null,
  };
}

/**
 * GET /:id — public, unauthenticated. canonicalPayload is the stored envelope
 * text verbatim so third parties can keccak256 it directly. The `chain` block is
 * omitted entirely unless the record is displayable as confirmed (verified).
 */
export async function handleGet(
  deps: GetDeps,
  input: { recordId: string },
): Promise<ApiResult> {
  const rec = await deps.records.getById(input.recordId);
  if (!rec) {
    return fail(404, 'RECORD_NOT_FOUND', `Public record '${input.recordId}' not found`);
  }

  const base = {
    recordId: rec.id,
    recordType: rec.recordType,
    status: rec.status,
    recordHash: rec.recordHash,
    canonicalPayload: rec.envelopeJson,
    supersededBy: rec.supersededByRecordId,
    attemptEpoch: rec.attemptEpoch,
    createdAt: rec.createdAt.toISOString(),
  };

  if (isDisplayableAsConfirmed(rec.status)) {
    return ok({ ...base, chain: buildChainBlock(rec, deps.explorerBaseUrl) });
  }
  return ok(base);
}

/** Opportunistic-reconcile patch for a confirming record proven on-chain. */
function reconcilePatch(result: {
  txHash?: string;
  blockNumber?: number;
}): RecordPatch {
  return {
    confirmedAt: new Date(),
    ...(result.txHash ? { txHash: result.txHash } : {}),
    ...(result.blockNumber !== undefined ? { blockNumber: result.blockNumber } : {}),
  };
}

/**
 * GET /:id/verify — public, rate-limited, cache-free. Runs the three-step verifier
 * and, when a `confirming` record is proven on-chain, best-effort transitions it
 * to verified (opportunistic reconciliation; a failure there never affects the
 * response). On RPC failure returns 502 with onChain:"unknown" — never a false
 * verified — plus the DB-side status for the caller.
 */
export async function handleVerify(
  deps: VerifyDeps,
  input: { recordId: string; clientKey: string },
): Promise<ApiResult> {
  if (!deps.rateLimiter.allow(input.clientKey)) {
    return fail(429, 'RATE_LIMITED', 'Too many verification requests; slow down');
  }

  let rec: PublicRecordDTO | null = null;
  try {
    rec = await deps.records.getById(input.recordId);
    const result = await deps.verifier.verifyRecord(input.recordId);

    if (result.onChain && rec?.status === 'confirming') {
      try {
        await deps.records.transition(
          input.recordId,
          ['confirming'],
          'verified',
          reconcilePatch(result),
        );
      } catch (reconcileError: unknown) {
        console.error('Opportunistic reconcile failed (non-fatal)', reconcileError);
      }
    }

    const chain = result.txHash
      ? {
          txHash: result.txHash,
          blockNumber: result.blockNumber,
          explorerUrl: result.explorerUrl,
        }
      : undefined;

    return ok({
      verified: result.verified,
      hashMatches: result.hashMatches,
      onChain: result.onChain,
      computedHash: result.computedHash,
      storedHash: result.storedHash,
      failureReason: result.failureReason,
      ...(chain ? { chain } : {}),
    });
  } catch (error: unknown) {
    if (error instanceof ChainUnavailableError) {
      console.error('Verify RPC unavailable', error);
      return fail(502, 'CHAIN_UNAVAILABLE', error.message, {
        onChain: 'unknown',
        dbStatus: rec?.status ?? null,
      });
    }
    return mapError(error);
  }
}
