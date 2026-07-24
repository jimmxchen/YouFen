// Unified API response envelope { success, data, error } plus error-to-HTTP
// mapping for the Public Records endpoints (BLOCKCHAIN-DESIGN §7, PRD §27).
// Pure functions only: no I/O, no framework types. Route adapters translate an
// ApiResult into a NextResponse; handlers return ApiResult directly.

import {
  ChainUnavailableError,
  InvalidStatusError,
  InvalidTransitionError,
  RecordNotFoundError,
} from '../../blockchain/errors';

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
}

export interface ApiEnvelope {
  readonly success: boolean;
  readonly data: unknown | null;
  readonly error: ApiErrorBody | null;
}

export interface ApiResult {
  readonly status: number;
  readonly body: ApiEnvelope;
}

/** Success envelope. Defaults to 200; callers pass 202 for accepted-and-queued. */
export function ok(data: unknown, status = 200): ApiResult {
  return { status, body: { success: true, data, error: null } };
}

/**
 * Error envelope. `data` is null for the common case; the verify endpoint passes
 * a payload on 502 so callers still receive the DB-side status alongside the
 * error (BLOCKCHAIN-DESIGN §7: onChain:"unknown", never a false "verified").
 */
export function fail(
  status: number,
  code: string,
  message: string,
  data: unknown = null,
): ApiResult {
  return { status, body: { success: false, data, error: { code, message } } };
}

/**
 * Map a thrown ChainError subclass onto an HTTP envelope. Unknown errors become
 * a generic 500 whose message never leaks internal detail; the real error is
 * written to console.error for server-side diagnosis.
 */
export function mapError(e: unknown): ApiResult {
  if (e instanceof RecordNotFoundError) {
    return fail(404, 'RECORD_NOT_FOUND', e.message);
  }
  if (e instanceof InvalidStatusError || e instanceof InvalidTransitionError) {
    return fail(409, 'INVALID_STATUS', e.message);
  }
  if (e instanceof ChainUnavailableError) {
    return fail(502, 'CHAIN_UNAVAILABLE', e.message);
  }
  console.error('Unhandled Public Records API error', e);
  return fail(500, 'INTERNAL_ERROR', 'Internal server error');
}
