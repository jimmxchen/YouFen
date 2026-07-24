// Unified API response envelope { success, data, error } plus EngineError→HTTP
// mapping, shared by every W5 endpoint group (conventions §error-model,
// ARCHITECTURE §7/§8.4). Pure functions only: no I/O, no framework types.
// Route adapters translate an ApiResult into a NextResponse; handlers return
// ApiResult directly.
//
// mapEngineError deliberately duck-types on the thrown error's `code` string
// rather than importing lib/engine/errors.ts, so this module compiles and is
// testable independently of the engine package.

import { jsonSafe } from './validation';

export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface ApiMeta {
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface ApiEnvelope {
  readonly success: boolean;
  readonly data: unknown | null;
  readonly error: ApiErrorBody | null;
  readonly meta?: ApiMeta;
}

export interface ApiResult {
  readonly status: number;
  readonly body: ApiEnvelope;
}

/**
 * Success envelope. Defaults to 200; callers pass 201/202 for created/accepted.
 * `data` is run through jsonSafe so any bigint in the payload is serialized to a
 * decimal string before it reaches the wire.
 */
export function ok(data: unknown, status = 200, meta?: ApiMeta): ApiResult {
  const body: ApiEnvelope = meta
    ? { success: true, data: jsonSafe(data), error: null, meta }
    : { success: true, data: jsonSafe(data), error: null };
  return { status, body };
}

/** Error envelope. `details` is omitted from the error object when undefined. */
export function fail(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): ApiResult {
  const error: ApiErrorBody =
    details === undefined ? { code, message } : { code, message, details };
  return { status, body: { success: false, data: null, error } };
}

// EngineError code → HTTP status buckets (conventions §error-model). The union
// of these four sets is exactly the 19 engine codes.
const STATUS_400: ReadonlySet<string> = new Set([
  'VALIDATION_ERROR',
  'RULE_VIOLATION',
  'INVALID_REASON',
]);
const STATUS_403: ReadonlySet<string> = new Set([
  'FORBIDDEN',
  'PROPOSAL_REQUIRED',
  'SECOND_APPROVER_REQUIRED',
]);
const STATUS_404: ReadonlySet<string> = new Set(['NOT_FOUND']);
const STATUS_409: ReadonlySet<string> = new Set([
  'INSUFFICIENT_BUDGET',
  'INVALID_STATUS',
  'CONFLICT',
  'ALREADY_MINTED',
  'ALREADY_REVERSED',
  'NOT_APPROVED',
  'EPOCH_NOT_ACTIVE',
  'MEMBER_CAP_EXCEEDED',
  'ADVANCE_CAP_EXCEEDED',
  'ROLLING_ADVANCE_FORBIDDEN',
  'ADVANCE_RATE_EXCEEDED',
  'QUORUM_NOT_MET',
]);

function engineCode(e: unknown): string | null {
  if (e instanceof Error && 'code' in e) {
    const code = (e as Error & { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

/**
 * Map a thrown EngineError onto an HTTP envelope by its `code`. Codes outside
 * the 19-code whitelist (including plain Errors and Node system errors) become
 * a generic 500 whose message never leaks internal detail; the real error is
 * written to console.error for server-side diagnosis.
 */
export function mapEngineError(e: unknown): ApiResult {
  const code = engineCode(e);
  const message = e instanceof Error ? e.message : 'Internal server error';
  if (code !== null) {
    if (STATUS_400.has(code)) return fail(400, code, message);
    if (STATUS_403.has(code)) return fail(403, code, message);
    if (STATUS_404.has(code)) return fail(404, code, message);
    if (STATUS_409.has(code)) {
      const details =
        code === 'INSUFFICIENT_BUDGET'
          ? { advancePath: 'POST /api/token-advances' }
          : undefined;
      return fail(409, code, message, details);
    }
  }
  // Postgres 死锁/序列化冲突（Prisma P2034 包装 40P01/40001）属瞬态并发竞争：
  // 映射为 409 可重试，而不是把并发当作服务器故障吞进 500。
  if (isTransientTxConflict(e)) {
    return fail(409, 'TRANSACTION_CONFLICT', 'Concurrent transaction conflict; retry the request', {
      retryable: true,
    });
  }
  console.error('Unhandled engine error', e);
  return fail(500, 'INTERNAL_ERROR', 'Internal server error');
}

function isTransientTxConflict(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  if ((e as { code?: unknown }).code === 'P2034') return true;
  const message = e instanceof Error ? e.message : '';
  return (
    message.includes('40P01') || message.includes('40001') || /deadlock detected/i.test(message)
  );
}
