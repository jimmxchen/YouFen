// Idempotency-Key support shared by every W5 write endpoint (conventions
// §API-endpoint-group; three-state matrix authoritatively covered here).
//
// The store is a port so handlers stay pure and testable; the Prisma-backed
// implementation is the production adapter. requestHash uses the same
// Ethereum-Keccak keccakUtf8 as the record layer so hashing is consistent.

import { keccakUtf8 } from '../../blockchain/hashing/record-hash';

import { fail, type ApiResult } from './respond';

export interface IdempotencyRow {
  readonly requestHash: string;
  readonly responseStatus: number;
  readonly responseBody: unknown;
}

export interface IdempotencyStore {
  find(endpoint: string, key: string): Promise<IdempotencyRow | null>;
  save(
    endpoint: string,
    key: string,
    requestHash: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void>;
}

export interface IdempotencyContext {
  readonly endpoint: string;
  readonly key: string | null;
  readonly requestHash: string;
}

/** Keccak-256 over the canonical JSON of a request body, as a 0x string. */
export function hashRequestBody(body: unknown): string {
  return keccakUtf8(JSON.stringify(body));
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Run an idempotent operation. Missing key → 400. A prior record with the same
 * hash replays the stored response without re-running. A prior record with a
 * different hash → 409 conflict. Otherwise `run` executes and, only for a 2xx
 * result, the response is persisted for future replays.
 */
export async function withIdempotency(
  store: IdempotencyStore,
  ctx: IdempotencyContext,
  run: () => Promise<ApiResult>,
): Promise<ApiResult> {
  if (ctx.key === null) {
    return fail(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required');
  }

  const existing = await store.find(ctx.endpoint, ctx.key);
  if (existing !== null) {
    if (existing.requestHash === ctx.requestHash) {
      return {
        status: existing.responseStatus,
        body: existing.responseBody as ApiResult['body'],
      };
    }
    return fail(
      409,
      'IDEMPOTENCY_CONFLICT',
      'Idempotency-Key was reused with a different request body',
    );
  }

  const result = await run();
  if (isSuccess(result.status)) {
    await store.save(ctx.endpoint, ctx.key, ctx.requestHash, result.status, result.body);
  }
  return result;
}

// --- Prisma adapter -------------------------------------------------------
// Typed against a minimal structural delegate so this module compiles without a
// hard dependency on the generated Prisma types (the IdempotencyKey model is
// added by a sibling task). getPrisma() satisfies this shape at wiring time.

interface PrismaIdempotencyDelegate {
  findUnique(args: {
    where: { endpoint_key: { endpoint: string; key: string } };
  }): Promise<{
    requestHash: string;
    responseStatus: number;
    // Persisted as a JSON string in the `String` column (schema.prisma:381).
    responseBody: string;
  } | null>;
  create(args: {
    data: {
      endpoint: string;
      key: string;
      requestHash: string;
      responseStatus: number;
      // Serialized JSON string to match the `String` column.
      responseBody: string;
    };
  }): Promise<unknown>;
}

export interface PrismaIdempotencyDb {
  readonly idempotencyKey: PrismaIdempotencyDelegate;
}

function isP2002(e: unknown): boolean {
  return e instanceof Error && 'code' in e &&
    (e as Error & { code: unknown }).code === 'P2002';
}

/** Build an IdempotencyStore backed by Prisma. A concurrent insert that trips
 * the unique constraint (P2002) is swallowed as an idempotent success. */
export function createPrismaIdempotencyStore(db: PrismaIdempotencyDb): IdempotencyStore {
  return {
    find: async (endpoint, key) => {
      const row = await db.idempotencyKey.findUnique({
        where: { endpoint_key: { endpoint, key } },
      });
      if (row === null) return null;
      // responseBody is stored as a JSON string; rehydrate to the envelope object.
      return {
        requestHash: row.requestHash,
        responseStatus: row.responseStatus,
        responseBody: JSON.parse(row.responseBody) as unknown,
      };
    },
    save: async (endpoint, key, requestHash, responseStatus, responseBody) => {
      try {
        await db.idempotencyKey.create({
          data: {
            endpoint,
            key,
            requestHash,
            responseStatus,
            // Serialize the envelope to match the `String` column (schema.prisma:381).
            responseBody: JSON.stringify(responseBody),
          },
        });
      } catch (e: unknown) {
        if (isP2002(e)) return;
        throw e;
      }
    },
  };
}
