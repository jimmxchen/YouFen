// Zod validation helpers and a bigint-safe JSON serializer, shared by every W5
// endpoint group (conventions §data-and-types, §code-style). Pure and IO-free.

import { z } from 'zod';

import { fail, type ApiResult } from './respond';

/** Non-negative amount/supply/balance. Coerces strings ("100") to bigint. */
export const zBigIntAmount = z.coerce.bigint().nonnegative();

/** Basis points: integer 0..10000. */
export const zBps = z.number().int().min(0).max(10000);

/** 1-based page number, default 1. Coerces query strings. */
export const zPage = z.coerce.number().int().min(1).default(1);

/** Page size 1..100, default 20. Coerces query strings. */
export const zLimit = z.coerce.number().int().min(1).max(100).default(20);

/** Non-empty identifier string. */
export const zId = z.string().min(1);

export type ParseResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly response: ApiResult };

/**
 * Validate a request body against a schema. On success returns the typed data;
 * on failure returns a ready-to-send 400 VALIDATION_ERROR ApiResult carrying the
 * flattened Zod issues as `details`.
 */
export function parseBody<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    response: fail(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      result.error.flatten(),
    ),
  };
}

/**
 * Recursively convert every bigint in a value to a decimal string so the value
 * is JSON-serializable. Dates and other primitives pass through unchanged; only
 * plain arrays/objects are traversed.
 */
export function jsonSafe(data: unknown): unknown {
  if (typeof data === 'bigint') {
    return data.toString();
  }
  if (Array.isArray(data)) {
    return data.map((item) => jsonSafe(item));
  }
  if (data !== null && typeof data === 'object') {
    if (data instanceof Date) {
      return data;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      out[key] = jsonSafe(value);
    }
    return out;
  }
  return data;
}
