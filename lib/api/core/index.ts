// Barrel export for the shared API core (conventions §API-endpoint-group).

export {
  ok,
  fail,
  mapEngineError,
  type ApiResult,
  type ApiEnvelope,
  type ApiErrorBody,
  type ApiMeta,
} from './respond';

export {
  resolveAuthFromHeaders,
  defaultAuthorizeAdmin,
  requireInternal,
  requireVerifiedActor,
  type AuthContext,
  type AuthEnv,
  type AdminCredential,
  type AuthorizeAdminFn,
  type HeaderReader,
} from './auth';

export {
  withIdempotency,
  hashRequestBody,
  createPrismaIdempotencyStore,
  type IdempotencyStore,
  type IdempotencyRow,
  type IdempotencyContext,
  type PrismaIdempotencyDb,
} from './idempotency';

export {
  parseBody,
  jsonSafe,
  zBigIntAmount,
  zBps,
  zPage,
  zLimit,
  zId,
  type ParseResult,
} from './validation';
