// Canonical JSON serializer for record envelopes (BLOCKCHAIN-DESIGN §4.2).
// Pure, deterministic, IO-free. This is the exact preimage that gets hashed, so
// every rule here is load-bearing: any drift changes recordHash for all records.
//
// Rules (RFC 8785 / JCS strict subset):
//   1. object keys sorted ascending by UTF-16 code unit, applied recursively;
//   2. no whitespace — only ',' and ':' separators;
//   3. numbers are safe integers only, shortest decimal form (no +, no leading
//      zero, no decimal point, no exponent); -0 is normalized to 0;
//   4. null / undefined / NaN / Infinity / floats / unsafe integers / bigint /
//      functions / symbols / arrays are illegal and throw CanonicalizationError;
//   5. strings use minimal JSON escaping (delegated to JSON.stringify per value);
//   6. the envelope has exactly three keys: schema, type, payload.

import { CanonicalizationError } from '../errors';
import type { RecordEnvelope } from '../types';

/** True for a serializable plain object (excludes null, arrays, class boxes). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Serialize a single number to shortest decimal, rejecting all non-integers. */
function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new CanonicalizationError(
      `Non-finite number is not allowed in canonical JSON: ${String(value)}`,
    );
  }
  if (!Number.isInteger(value)) {
    throw new CanonicalizationError(
      `Non-integer number is not allowed in canonical JSON: ${String(value)}`,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new CanonicalizationError(
      `Integer exceeds the safe range and must be a string field: ${String(value)}`,
    );
  }
  // String() maps -0 to '0' and never uses exponent notation for safe integers.
  return String(value + 0);
}

/** Recursively serialize any allowed value into its canonical string form. */
function serializeValue(value: unknown): string {
  switch (typeof value) {
    case 'string':
      // JSON.stringify on a single string yields spec-correct minimal escaping.
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return serializeNumber(value);
    case 'object':
      if (isPlainObject(value)) {
        return serializeObject(value);
      }
      throw new CanonicalizationError(
        value === null
          ? 'null is not allowed in canonical JSON; omit the key instead'
          : 'Arrays and non-plain objects are not allowed in canonical JSON',
      );
    default:
      // undefined, bigint, function, symbol.
      throw new CanonicalizationError(
        `Unsupported value type in canonical JSON: ${typeof value}`,
      );
  }
}

/** Serialize an object with keys sorted ascending by UTF-16 code unit. */
function serializeObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const parts = keys.map(
    (key) => `${JSON.stringify(key)}:${serializeValue(obj[key])}`,
  );
  return `{${parts.join(',')}}`;
}

/**
 * Produce the canonical JSON preimage for a record envelope. Throws
 * CanonicalizationError on any illegal value (defensive validation at the
 * hashing boundary; payload values may only be string | number | boolean).
 */
export function canonicalize(envelope: RecordEnvelope): string {
  if (!isPlainObject(envelope)) {
    throw new CanonicalizationError('Envelope must be a plain object');
  }
  return serializeObject(envelope as unknown as Record<string, unknown>);
}
