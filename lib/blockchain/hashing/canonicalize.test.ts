import { describe, expect, it } from 'vitest';

import { CanonicalizationError } from '../errors';
import type { RecordEnvelope } from '../types';

import { canonicalize } from './canonicalize';
import fixtures from './__fixtures__/golden-vectors.json';

// Loose view of the fixture file so tests can feed illegal payloads too.
const asEnvelope = (value: unknown): RecordEnvelope =>
  value as unknown as RecordEnvelope;

describe('canonicalize — golden envelope vectors', () => {
  for (const vector of fixtures.envelopeVectors) {
    it(`produces the frozen canonical string for ${vector.name}`, () => {
      expect(canonicalize(asEnvelope(vector.envelope))).toBe(vector.canonical);
    });
  }
});

describe('canonicalize — key ordering is UTF-16 ascending and recursive', () => {
  for (const vector of fixtures.keyShuffleVectors) {
    it(`normalizes shuffled keys to the same canonical string (${vector.name})`, () => {
      expect(canonicalize(asEnvelope(vector.envelope))).toBe(vector.canonical);
    });
  }

  it('sorts the fixed envelope keys to payload < schema < type', () => {
    const out = canonicalize(
      asEnvelope({
        type: 'token_mint',
        schema: 'youfen.record.v1',
        payload: { amount: 1 },
      }),
    );
    expect(out).toBe(
      '{"payload":{"amount":1},"schema":"youfen.record.v1","type":"token_mint"}',
    );
  });

  it('sorts nested payload keys deterministically regardless of insertion order', () => {
    const a = canonicalize(
      asEnvelope({
        schema: 'youfen.record.v1',
        type: 'token_mint',
        payload: { b: 2, a: 1, c: 3 },
      }),
    );
    const b = canonicalize(
      asEnvelope({
        schema: 'youfen.record.v1',
        type: 'token_mint',
        payload: { c: 3, a: 1, b: 2 },
      }),
    );
    expect(a).toBe(b);
    expect(a).toBe(
      '{"payload":{"a":1,"b":2,"c":3},"schema":"youfen.record.v1","type":"token_mint"}',
    );
  });

  it('orders uppercase before lowercase by UTF-16 code unit', () => {
    const out = canonicalize(
      asEnvelope({
        schema: 'youfen.record.v1',
        type: 'token_mint',
        payload: { Zeta: 1, alpha: 2 },
      }),
    );
    // 'Z' (0x5A) < 'a' (0x61)
    expect(out).toBe(
      '{"payload":{"Zeta":1,"alpha":2},"schema":"youfen.record.v1","type":"token_mint"}',
    );
  });
});

describe('canonicalize — serialization format', () => {
  it('emits no whitespace: only comma and colon separators', () => {
    const out = canonicalize(
      asEnvelope({
        schema: 'youfen.record.v1',
        type: 'token_mint',
        payload: { a: 1, b: 2 },
      }),
    );
    expect(out).not.toMatch(/\s/);
  });

  it('preserves unicode literally and hashes it as UTF-8 (中文 + emoji)', () => {
    const vector = fixtures.envelopeVectors.find(
      (v) => v.name === 'unicode-string-escaping',
    );
    expect(vector).toBeDefined();
    const out = canonicalize(asEnvelope(vector!.envelope));
    expect(out).toBe(vector!.canonical);
    expect(out).toContain('测试🌟社区');
  });

  it('applies minimal JSON escaping to string values', () => {
    const out = canonicalize(
      asEnvelope({
        schema: 'youfen.record.v1',
        type: 'token_mint',
        payload: { s: 'a"b\\c\n\t' },
      }),
    );
    expect(out).toBe(
      '{"payload":{"s":"a\\"b\\\\c\\n\\t\\u0001"},"schema":"youfen.record.v1","type":"token_mint"}',
    );
  });

  it('serializes booleans as true/false literals', () => {
    const out = canonicalize(
      asEnvelope({
        schema: 'youfen.record.v1',
        type: 'token_mint',
        payload: { yes: true, no: false },
      }),
    );
    expect(out).toBe(
      '{"payload":{"no":false,"yes":true},"schema":"youfen.record.v1","type":"token_mint"}',
    );
  });

  it('serializes safe integers as shortest decimal', () => {
    const out = canonicalize(
      asEnvelope({
        schema: 'youfen.record.v1',
        type: 'token_mint',
        payload: { max: 9007199254740991, zero: 0 },
      }),
    );
    expect(out).toBe(
      '{"payload":{"max":9007199254740991,"zero":0},"schema":"youfen.record.v1","type":"token_mint"}',
    );
  });
});

describe('canonicalize — negative zero normalization', () => {
  it('normalizes -0 to 0', () => {
    const out = canonicalize(
      asEnvelope({
        schema: 'youfen.record.v1',
        type: 'token_mint',
        payload: { amount: -0 },
      }),
    );
    expect(out).toContain('"amount":0');
    expect(out).not.toContain('-0');
  });
});

describe('canonicalize — rejection table (throws CanonicalizationError)', () => {
  for (const vector of fixtures.rejectionVectors) {
    it(`rejects ${vector.name}: ${vector.reason}`, () => {
      expect(() => canonicalize(asEnvelope(vector.envelope))).toThrow(
        CanonicalizationError,
      );
    });
  }

  const illegalPayloadValues: ReadonlyArray<readonly [string, unknown]> = [
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['a float', 3.14159],
    ['2^53 (unsafe integer)', 2 ** 53],
    ['a negative unsafe integer', -(2 ** 53)],
    ['null', null],
    ['a bigint', 10n],
    ['a function', () => 1],
    ['a symbol', Symbol('x')],
    ['an array', [1, 2, 3]],
  ];

  for (const [label, value] of illegalPayloadValues) {
    it(`rejects a payload value that is ${label}`, () => {
      expect(() =>
        canonicalize(
          asEnvelope({
            schema: 'youfen.record.v1',
            type: 'token_mint',
            payload: { field: value },
          }),
        ),
      ).toThrow(CanonicalizationError);
    });
  }

  it('rejects a non-object envelope', () => {
    expect(() => canonicalize(asEnvelope(null))).toThrow(CanonicalizationError);
    expect(() => canonicalize(asEnvelope('nope'))).toThrow(CanonicalizationError);
    expect(() => canonicalize(asEnvelope(42))).toThrow(CanonicalizationError);
  });
});

describe('canonicalize — determinism and purity', () => {
  it('returns the same string across repeated calls', () => {
    const envelope = asEnvelope(fixtures.envelopeVectors[0].envelope);
    expect(canonicalize(envelope)).toBe(canonicalize(envelope));
  });

  it('does not mutate the input envelope', () => {
    const envelope = {
      schema: 'youfen.record.v1',
      type: 'token_mint',
      payload: { b: 2, a: 1 },
    };
    const snapshot = JSON.stringify(envelope);
    canonicalize(asEnvelope(envelope));
    expect(JSON.stringify(envelope)).toBe(snapshot);
  });
});
