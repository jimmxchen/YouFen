import { describe, it, expect } from 'vitest';
import { z } from 'zod';

import {
  parseBody,
  jsonSafe,
  zBigIntAmount,
  zBps,
  zPage,
  zLimit,
  zId,
} from './validation';

describe('parseBody', () => {
  const schema = z.object({ name: zId, amount: zBigIntAmount });

  it('returns ok with typed data on success', () => {
    const result = parseBody(schema, { name: 'x', amount: '100' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('x');
      expect(result.data.amount).toBe(100n);
    }
  });

  it('returns a 400 VALIDATION_ERROR ApiResult with details on failure', () => {
    const result = parseBody(schema, { name: '', amount: -5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      expect(result.response.body.error?.code).toBe('VALIDATION_ERROR');
      expect(result.response.body.error?.details).toBeDefined();
    }
  });
});

describe('field fragments', () => {
  it('zBigIntAmount coerces and rejects negatives', () => {
    expect(zBigIntAmount.parse('42')).toBe(42n);
    expect(zBigIntAmount.parse(0)).toBe(0n);
    expect(() => zBigIntAmount.parse(-1)).toThrow();
  });

  it('zBps enforces integer 0..10000', () => {
    expect(zBps.parse(0)).toBe(0);
    expect(zBps.parse(10000)).toBe(10000);
    expect(() => zBps.parse(10001)).toThrow();
    expect(() => zBps.parse(1.5)).toThrow();
    expect(() => zBps.parse(-1)).toThrow();
  });

  it('zPage defaults to 1 and requires >= 1', () => {
    expect(zPage.parse(undefined)).toBe(1);
    expect(zPage.parse('3')).toBe(3);
    expect(() => zPage.parse(0)).toThrow();
  });

  it('zLimit defaults to 20 within 1..100', () => {
    expect(zLimit.parse(undefined)).toBe(20);
    expect(zLimit.parse('50')).toBe(50);
    expect(() => zLimit.parse(101)).toThrow();
    expect(() => zLimit.parse(0)).toThrow();
  });

  it('zId requires a non-empty string', () => {
    expect(zId.parse('abc')).toBe('abc');
    expect(() => zId.parse('')).toThrow();
  });
});

describe('jsonSafe', () => {
  it('converts bigint to string', () => {
    expect(jsonSafe(10n)).toBe('10');
  });

  it('recurses through arrays and objects', () => {
    expect(jsonSafe({ a: 1n, b: [2n, { c: 3n }], d: 'x' })).toEqual({
      a: '1',
      b: ['2', { c: '3' }],
      d: 'x',
    });
  });

  it('leaves Date and primitives untouched', () => {
    const d = new Date('2026-07-23T00:00:00.000Z');
    expect(jsonSafe(d)).toBe(d);
    expect(jsonSafe(null)).toBeNull();
    expect(jsonSafe(true)).toBe(true);
    expect(jsonSafe('s')).toBe('s');
    expect(jsonSafe(5)).toBe(5);
  });
});
