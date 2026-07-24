import { describe, it, expect, vi } from 'vitest';

import { ok, fail, mapEngineError, type ApiResult } from './respond';

function engineError(code: string, message = 'boom'): Error {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  return err;
}

describe('ok', () => {
  it('wraps data in a success envelope with default 200', () => {
    const res = ok({ hello: 'world' });
    expect(res).toEqual<ApiResult>({
      status: 200,
      body: { success: true, data: { hello: 'world' }, error: null },
    });
  });

  it('honors an explicit status and meta', () => {
    const res = ok([1, 2], 202, { total: 2, page: 1, limit: 20 });
    expect(res.status).toBe(202);
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20 });
  });

  it('recursively serializes bigint payloads to strings', () => {
    const res = ok({ amount: 100n, nested: { supply: 5n }, list: [1n, 2n] });
    expect(res.body.data).toEqual({
      amount: '100',
      nested: { supply: '5' },
      list: ['1', '2'],
    });
  });

  it('leaves Date instances untouched (bigint-only conversion)', () => {
    const d = new Date('2026-07-23T00:00:00.000Z');
    const res = ok({ when: d });
    expect((res.body.data as { when: Date }).when).toBe(d);
  });
});

describe('fail', () => {
  it('builds an error envelope without details by default', () => {
    const res = fail(404, 'NOT_FOUND', 'missing');
    expect(res).toEqual<ApiResult>({
      status: 404,
      body: { success: false, data: null, error: { code: 'NOT_FOUND', message: 'missing' } },
    });
  });

  it('includes details when provided', () => {
    const res = fail(400, 'VALIDATION_ERROR', 'bad', { field: 'amount' });
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'bad',
      details: { field: 'amount' },
    });
  });
});

describe('mapEngineError', () => {
  const cases: ReadonlyArray<readonly [string, number]> = [
    ['NOT_APPROVED', 409],
    ['ALREADY_MINTED', 409],
    ['EPOCH_NOT_ACTIVE', 409],
    ['RULE_VIOLATION', 400],
    ['MEMBER_CAP_EXCEEDED', 409],
    ['INSUFFICIENT_BUDGET', 409],
    ['ADVANCE_CAP_EXCEEDED', 409],
    ['ROLLING_ADVANCE_FORBIDDEN', 409],
    ['ADVANCE_RATE_EXCEEDED', 409],
    ['PROPOSAL_REQUIRED', 403],
    ['SECOND_APPROVER_REQUIRED', 403],
    ['INVALID_STATUS', 409],
    ['NOT_FOUND', 404],
    ['FORBIDDEN', 403],
    ['CONFLICT', 409],
    ['QUORUM_NOT_MET', 409],
    ['INVALID_REASON', 400],
    ['ALREADY_REVERSED', 409],
    ['VALIDATION_ERROR', 400],
  ];

  it('covers all 19 engine codes', () => {
    expect(cases).toHaveLength(19);
  });

  it.each(cases)('maps %s to HTTP %i', (code, status) => {
    const res = mapEngineError(engineError(code, `msg-${code}`));
    expect(res.status).toBe(status);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe(code);
    expect(res.body.error?.message).toBe(`msg-${code}`);
  });

  it('attaches advancePath details for INSUFFICIENT_BUDGET', () => {
    const res = mapEngineError(engineError('INSUFFICIENT_BUDGET'));
    expect(res.body.error?.details).toEqual({ advancePath: 'POST /api/token-advances' });
  });

  it('does not attach details for other engine codes', () => {
    const res = mapEngineError(engineError('INVALID_STATUS'));
    expect(res.body.error?.details).toBeUndefined();
  });

  it('maps unknown codes to 500 without leaking the message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mapEngineError(engineError('ENOENT', 'secret path /etc/passwd'));
    expect(res.status).toBe(500);
    expect(res.body.error?.code).toBe('INTERNAL_ERROR');
    expect(res.body.error?.message).not.toContain('secret path');
    expect(res.body.error?.message).toBe('Internal server error');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('maps a plain (codeless) error to 500', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mapEngineError(new Error('kaboom'));
    expect(res.status).toBe(500);
    expect(res.body.error?.code).toBe('INTERNAL_ERROR');
    spy.mockRestore();
  });

  it('maps a non-Error throwable to 500', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = mapEngineError('just a string');
    expect(res.status).toBe(500);
    spy.mockRestore();
  });

  it('maps Prisma P2034 (tx write conflict/deadlock) to retryable 409', () => {
    const res = mapEngineError(engineError('P2034', 'write conflict'));
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('TRANSACTION_CONFLICT');
    expect(res.body.error?.details).toEqual({ retryable: true });
  });

  it('maps a raw Postgres 40P01 deadlock message to retryable 409', () => {
    const res = mapEngineError(new Error('deadlock detected (SQLSTATE 40P01)'));
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('TRANSACTION_CONFLICT');
  });

  it('maps a serialization failure (40001) to retryable 409', () => {
    const res = mapEngineError(new Error('could not serialize access (40001)'));
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('TRANSACTION_CONFLICT');
  });
});
