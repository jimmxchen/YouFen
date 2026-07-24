import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  ChainUnavailableError,
  InvalidStatusError,
  RecordNotFoundError,
} from '../../blockchain/errors';
import type {
  Hex32,
  PublicRecordDTO,
  VerifyResult,
} from '../../blockchain/types';

import {
  handleGet,
  handleRetry,
  handleSubmit,
  handleVerify,
  type AuthInput,
  type RecordsPort,
  type VerifierPort,
} from './handlers';
import type { RateLimiter } from './rate-limit';

const STORED_HASH = ('0x' + 'ab'.repeat(32)) as Hex32;
const COMPUTED_HASH = ('0x' + 'ab'.repeat(32)) as Hex32;
const TX_HASH = '0x' + 'ef'.repeat(32);
const EXPLORER = 'https://explorer.test';

function dto(overrides: Partial<PublicRecordDTO> = {}): PublicRecordDTO {
  return {
    id: 'pr_1',
    communityId: 'c_1',
    sourceTable: 'TokenMintEvent',
    sourceId: 'mint_1',
    recordType: 'token_mint',
    status: 'verified',
    envelopeJson: '{"schema":"youfen.record.v1","type":"token_mint","payload":{"amount":100}}',
    recordHash: STORED_HASH,
    txHash: TX_HASH,
    assignedNonce: 4,
    blockNumber: 123,
    blockHash: '0x' + '00'.repeat(32),
    submittedAt: new Date('2026-07-22T00:00:00.000Z'),
    confirmedAt: new Date('2026-07-23T00:00:00.000Z'),
    attemptEpoch: 1,
    lastError: null,
    supersededByRecordId: null,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    ...overrides,
  };
}

function makeRecords(overrides: Partial<RecordsPort> = {}): RecordsPort {
  return {
    getById: vi.fn(),
    getWithSource: vi.fn(),
    requestSubmission: vi.fn(),
    transition: vi.fn(),
    ...overrides,
  };
}

function verifyResult(overrides: Partial<VerifyResult> = {}): VerifyResult {
  return {
    verified: true,
    hashMatches: true,
    onChain: true,
    computedHash: COMPUTED_HASH,
    storedHash: STORED_HASH,
    txHash: TX_HASH,
    blockNumber: 123,
    explorerUrl: `${EXPLORER}/tx/${TX_HASH}`,
    failureReason: undefined,
    ...overrides,
  };
}

const ALLOW: AuthInput = { headerToken: 'valid-token' };
const authorizeYes = () => true;
const authorizeNo = () => false;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleSubmit', () => {
  it('202 pending with jobId when authorized and enqueued', async () => {
    const records = makeRecords({
      requestSubmission: vi.fn().mockResolvedValue({ queued: true, jobId: 'submit:pr_1:v1' }),
    });
    const res = await handleSubmit(
      { records, authorize: authorizeYes },
      { recordId: 'pr_1', auth: ALLOW },
    );

    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      recordId: 'pr_1',
      status: 'pending',
      queued: true,
      jobId: 'submit:pr_1:v1',
    });
    expect(records.requestSubmission).toHaveBeenCalledWith('pr_1');
  });

  it('401 UNAUTHORIZED when authorize rejects, without touching records', async () => {
    const records = makeRecords();
    const res = await handleSubmit(
      { records, authorize: authorizeNo },
      { recordId: 'pr_1', auth: { headerToken: null } },
    );

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
    expect(records.requestSubmission).not.toHaveBeenCalled();
  });

  it('404 RECORD_NOT_FOUND when requestSubmission throws RecordNotFoundError', async () => {
    const records = makeRecords({
      requestSubmission: vi.fn().mockRejectedValue(new RecordNotFoundError('missing')),
    });
    const res = await handleSubmit(
      { records, authorize: authorizeYes },
      { recordId: 'pr_x', auth: ALLOW },
    );

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('RECORD_NOT_FOUND');
  });

  it('409 INVALID_STATUS when record is not pending', async () => {
    const records = makeRecords({
      requestSubmission: vi.fn().mockRejectedValue(new InvalidStatusError('not pending')),
    });
    const res = await handleSubmit(
      { records, authorize: authorizeYes },
      { recordId: 'pr_1', auth: ALLOW },
    );

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
  });

  it('502 CHAIN_UNAVAILABLE bubbles through mapError', async () => {
    const records = makeRecords({
      requestSubmission: vi.fn().mockRejectedValue(new ChainUnavailableError('rpc down')),
    });
    const res = await handleSubmit(
      { records, authorize: authorizeYes },
      { recordId: 'pr_1', auth: ALLOW },
    );

    expect(res.status).toBe(502);
    expect(res.body.error?.code).toBe('CHAIN_UNAVAILABLE');
  });

  it('500 INTERNAL_ERROR with generic message for unexpected errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const records = makeRecords({
      requestSubmission: vi.fn().mockRejectedValue(new Error('secret db detail')),
    });
    const res = await handleSubmit(
      { records, authorize: authorizeYes },
      { recordId: 'pr_1', auth: ALLOW },
    );

    expect(res.status).toBe(500);
    expect(res.body.error?.code).toBe('INTERNAL_ERROR');
    expect(res.body.error?.message).not.toContain('secret db detail');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('handleRetry', () => {
  it('202 bumps attemptEpoch and enqueues a new job', async () => {
    const rec = dto({ status: 'failed', attemptEpoch: 2, lastError: 'boom' });
    const records = makeRecords({
      getById: vi.fn().mockResolvedValue(rec),
      transition: vi.fn().mockResolvedValue(true),
      requestSubmission: vi.fn().mockResolvedValue({ queued: true, jobId: 'submit:pr_1:v3' }),
    });
    const res = await handleRetry(
      { records, authorize: authorizeYes },
      { recordId: 'pr_1', auth: ALLOW },
    );

    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({
      recordId: 'pr_1',
      status: 'pending',
      queued: true,
      jobId: 'submit:pr_1:v3',
      attemptEpoch: 3,
    });
    expect(records.transition).toHaveBeenCalledWith('pr_1', ['failed'], 'pending', {
      attemptEpoch: 3,
      lastError: null,
    });
    expect(records.requestSubmission).toHaveBeenCalledWith('pr_1');
  });

  it('401 UNAUTHORIZED without reading records', async () => {
    const records = makeRecords();
    const res = await handleRetry(
      { records, authorize: authorizeNo },
      { recordId: 'pr_1', auth: { headerToken: 'nope' } },
    );

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
    expect(records.getById).not.toHaveBeenCalled();
  });

  it('404 when record does not exist', async () => {
    const records = makeRecords({ getById: vi.fn().mockResolvedValue(null) });
    const res = await handleRetry(
      { records, authorize: authorizeYes },
      { recordId: 'ghost', auth: ALLOW },
    );

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('RECORD_NOT_FOUND');
  });

  it('409 when record status is not failed', async () => {
    const records = makeRecords({
      getById: vi.fn().mockResolvedValue(dto({ status: 'confirming' })),
    });
    const res = await handleRetry(
      { records, authorize: authorizeYes },
      { recordId: 'pr_1', auth: ALLOW },
    );

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
    expect(records.transition).not.toHaveBeenCalled();
  });

  it('409 on lost concurrency race (transition matched 0 rows)', async () => {
    const records = makeRecords({
      getById: vi.fn().mockResolvedValue(dto({ status: 'failed', attemptEpoch: 0 })),
      transition: vi.fn().mockResolvedValue(false),
    });
    const res = await handleRetry(
      { records, authorize: authorizeYes },
      { recordId: 'pr_1', auth: ALLOW },
    );

    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
    expect(records.requestSubmission).not.toHaveBeenCalled();
  });
});

describe('handleGet', () => {
  it('200 verified record includes chain with Unix-seconds confirmedAt and explorerUrl', async () => {
    const rec = dto({ status: 'verified' });
    const records = makeRecords({ getById: vi.fn().mockResolvedValue(rec) });
    const res = await handleGet(
      { records, explorerBaseUrl: EXPLORER },
      { recordId: 'pr_1' },
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      recordId: 'pr_1',
      recordType: 'token_mint',
      status: 'verified',
      recordHash: STORED_HASH,
      canonicalPayload: rec.envelopeJson,
      chain: {
        txHash: TX_HASH,
        blockNumber: 123,
        confirmedAt: Math.floor(new Date('2026-07-23T00:00:00.000Z').getTime() / 1000),
        explorerUrl: `${EXPLORER}/tx/${TX_HASH}`,
      },
      supersededBy: null,
      attemptEpoch: 1,
      createdAt: new Date('2026-07-20T00:00:00.000Z').toISOString(),
    });
  });

  it('canonicalPayload is the exact envelopeJson original text', async () => {
    const rec = dto({ status: 'pending', envelopeJson: '{"weird":  "spacing" , "n": 3}' });
    const records = makeRecords({ getById: vi.fn().mockResolvedValue(rec) });
    const res = await handleGet(
      { records, explorerBaseUrl: EXPLORER },
      { recordId: 'pr_1' },
    );

    const data = res.body.data as { canonicalPayload: string };
    expect(data.canonicalPayload).toBe('{"weird":  "spacing" , "n": 3}');
  });

  it('non-verified record omits the chain field entirely', async () => {
    const rec = dto({ status: 'confirming' });
    const records = makeRecords({ getById: vi.fn().mockResolvedValue(rec) });
    const res = await handleGet(
      { records, explorerBaseUrl: EXPLORER },
      { recordId: 'pr_1' },
    );

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect('chain' in data).toBe(false);
    expect(data.status).toBe('confirming');
  });

  it('404 when record is missing', async () => {
    const records = makeRecords({ getById: vi.fn().mockResolvedValue(null) });
    const res = await handleGet(
      { records, explorerBaseUrl: EXPLORER },
      { recordId: 'ghost' },
    );

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('RECORD_NOT_FOUND');
  });
});

function makeVerifier(result: VerifyResult): VerifierPort {
  return { verifyRecord: vi.fn().mockResolvedValue(result) };
}

const allowLimiter: RateLimiter = { allow: () => true };
const denyLimiter: RateLimiter = { allow: () => false };

describe('handleVerify', () => {
  it('200 all-correct verification', async () => {
    const records = makeRecords({ getById: vi.fn().mockResolvedValue(dto({ status: 'verified' })) });
    const verifier = makeVerifier(verifyResult());
    const res = await handleVerify(
      { verifier, records, rateLimiter: allowLimiter },
      { recordId: 'pr_1', clientKey: '1.2.3.4' },
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      verified: true,
      hashMatches: true,
      onChain: true,
      computedHash: COMPUTED_HASH,
      storedHash: STORED_HASH,
      failureReason: undefined,
      chain: {
        txHash: TX_HASH,
        blockNumber: 123,
        explorerUrl: `${EXPLORER}/tx/${TX_HASH}`,
      },
    });
  });

  it('200 SOURCE_DATA_MISMATCH surfaces tamper evidence', async () => {
    const records = makeRecords({ getById: vi.fn().mockResolvedValue(dto({ status: 'verified' })) });
    const verifier = makeVerifier(
      verifyResult({
        verified: false,
        hashMatches: false,
        onChain: true,
        computedHash: ('0x' + '11'.repeat(32)) as Hex32,
        failureReason: 'SOURCE_DATA_MISMATCH',
      }),
    );
    const res = await handleVerify(
      { verifier, records, rateLimiter: allowLimiter },
      { recordId: 'pr_1', clientKey: 'k' },
    );

    expect(res.status).toBe(200);
    const data = res.body.data as { verified: boolean; failureReason: string };
    expect(data.verified).toBe(false);
    expect(data.failureReason).toBe('SOURCE_DATA_MISMATCH');
  });

  it('429 RATE_LIMITED when limiter rejects, without calling the verifier', async () => {
    const records = makeRecords();
    const verifier: VerifierPort = { verifyRecord: vi.fn() };
    const res = await handleVerify(
      { verifier, records, rateLimiter: denyLimiter },
      { recordId: 'pr_1', clientKey: 'flooder' },
    );

    expect(res.status).toBe(429);
    expect(res.body.error?.code).toBe('RATE_LIMITED');
    expect(verifier.verifyRecord).not.toHaveBeenCalled();
  });

  it('502 CHAIN_UNAVAILABLE carries onChain:unknown and dbStatus, never verified', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const records = makeRecords({
      getById: vi.fn().mockResolvedValue(dto({ status: 'confirming' })),
    });
    const verifier: VerifierPort = {
      verifyRecord: vi.fn().mockRejectedValue(new ChainUnavailableError('rpc timeout')),
    };
    const res = await handleVerify(
      { verifier, records, rateLimiter: allowLimiter },
      { recordId: 'pr_1', clientKey: 'k' },
    );

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(res.body.error?.code).toBe('CHAIN_UNAVAILABLE');
    expect(res.body.data).toEqual({ onChain: 'unknown', dbStatus: 'confirming' });
    spy.mockRestore();
  });

  it('502 dbStatus null when record was not loadable', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const records = makeRecords({ getById: vi.fn().mockResolvedValue(null) });
    const verifier: VerifierPort = {
      verifyRecord: vi.fn().mockRejectedValue(new ChainUnavailableError('rpc timeout')),
    };
    const res = await handleVerify(
      { verifier, records, rateLimiter: allowLimiter },
      { recordId: 'pr_1', clientKey: 'k' },
    );

    expect(res.status).toBe(502);
    expect(res.body.data).toEqual({ onChain: 'unknown', dbStatus: null });
    spy.mockRestore();
  });

  it('404 when the record does not exist', async () => {
    const records = makeRecords({ getById: vi.fn().mockResolvedValue(null) });
    const verifier: VerifierPort = {
      verifyRecord: vi.fn().mockRejectedValue(new RecordNotFoundError('missing')),
    };
    const res = await handleVerify(
      { verifier, records, rateLimiter: allowLimiter },
      { recordId: 'ghost', clientKey: 'k' },
    );

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('RECORD_NOT_FOUND');
  });

  it('opportunistically reconciles confirming -> verified when on-chain', async () => {
    const records = makeRecords({
      getById: vi.fn().mockResolvedValue(dto({ status: 'confirming' })),
      transition: vi.fn().mockResolvedValue(true),
    });
    const verifier = makeVerifier(verifyResult({ onChain: true }));
    const res = await handleVerify(
      { verifier, records, rateLimiter: allowLimiter },
      { recordId: 'pr_1', clientKey: 'k' },
    );

    expect(res.status).toBe(200);
    expect(records.transition).toHaveBeenCalledWith(
      'pr_1',
      ['confirming'],
      'verified',
      expect.objectContaining({ txHash: TX_HASH, blockNumber: 123 }),
    );
  });

  it('does not reconcile when status is already verified', async () => {
    const records = makeRecords({
      getById: vi.fn().mockResolvedValue(dto({ status: 'verified' })),
      transition: vi.fn().mockResolvedValue(true),
    });
    const verifier = makeVerifier(verifyResult({ onChain: true }));
    await handleVerify(
      { verifier, records, rateLimiter: allowLimiter },
      { recordId: 'pr_1', clientKey: 'k' },
    );

    expect(records.transition).not.toHaveBeenCalled();
  });

  it('best-effort reconcile failure does not break the 200 response', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const records = makeRecords({
      getById: vi.fn().mockResolvedValue(dto({ status: 'confirming' })),
      transition: vi.fn().mockRejectedValue(new Error('write conflict')),
    });
    const verifier = makeVerifier(verifyResult({ onChain: true }));
    const res = await handleVerify(
      { verifier, records, rateLimiter: allowLimiter },
      { recordId: 'pr_1', clientKey: 'k' },
    );

    expect(res.status).toBe(200);
    const data = res.body.data as { verified: boolean };
    expect(data.verified).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('omits chain when the verifier found no tx (e.g. not on chain)', async () => {
    const records = makeRecords({ getById: vi.fn().mockResolvedValue(dto({ status: 'pending' })) });
    const verifier = makeVerifier(
      verifyResult({
        verified: false,
        onChain: false,
        txHash: undefined,
        blockNumber: undefined,
        explorerUrl: undefined,
        failureReason: 'NOT_ON_CHAIN',
      }),
    );
    const res = await handleVerify(
      { verifier, records, rateLimiter: allowLimiter },
      { recordId: 'pr_1', clientKey: 'k' },
    );

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect('chain' in data).toBe(false);
  });
});
