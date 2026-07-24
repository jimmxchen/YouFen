import { describe, it, expect, vi, afterEach } from 'vitest';

import { setBlockchainRuntimeForTesting } from '../../blockchain/runtime';
import { ChainUnavailableError } from '../../blockchain/errors';
import type { BlockchainRuntime, Hex32, PublicRecordDTO, VerifyResult } from '../../blockchain/types';

import { GET as getDetail } from '../../../app/api/public-records/[id]/route';
import { POST as postSubmit } from '../../../app/api/public-records/[id]/submit/route';
import { POST as postRetry } from '../../../app/api/public-records/[id]/retry/route';
import { GET as getVerify } from '../../../app/api/public-records/[id]/verify/route';

const TOKEN = 'internal-token-abcdef123456';
const STORED_HASH = ('0x' + 'ab'.repeat(32)) as Hex32;
const TX_HASH = '0x' + 'ef'.repeat(32);
const EXPLORER = 'https://explorer.test';

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

function dto(overrides: Partial<PublicRecordDTO> = {}): PublicRecordDTO {
  return {
    id: 'r1',
    communityId: 'c_1',
    sourceTable: 'TokenMintEvent',
    sourceId: 'mint_1',
    recordType: 'token_mint',
    status: 'verified',
    envelopeJson: '{"schema":"youfen.record.v1"}',
    recordHash: STORED_HASH,
    txHash: TX_HASH,
    assignedNonce: 1,
    blockNumber: 42,
    blockHash: '0x' + '00'.repeat(32),
    submittedAt: new Date(0),
    confirmedAt: new Date('2026-07-23T00:00:00.000Z'),
    attemptEpoch: 1,
    lastError: null,
    supersededByRecordId: null,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    ...overrides,
  };
}

function verifyResult(overrides: Partial<VerifyResult> = {}): VerifyResult {
  return {
    verified: true,
    hashMatches: true,
    onChain: true,
    computedHash: STORED_HASH,
    storedHash: STORED_HASH,
    txHash: TX_HASH,
    blockNumber: 42,
    explorerUrl: `${EXPLORER}/tx/${TX_HASH}`,
    failureReason: undefined,
    ...overrides,
  };
}

interface FakeParts {
  getById?: ReturnType<typeof vi.fn>;
  requestSubmission?: ReturnType<typeof vi.fn>;
  transition?: ReturnType<typeof vi.fn>;
  verifyRecord?: ReturnType<typeof vi.fn>;
}

function installRuntime(parts: FakeParts = {}): void {
  const records = {
    getById: parts.getById ?? vi.fn(),
    getWithSource: vi.fn(),
    requestSubmission: parts.requestSubmission ?? vi.fn(),
    transition: parts.transition ?? vi.fn(),
    createPendingRecord: vi.fn(),
    patchInStatus: vi.fn(),
    markSuperseded: vi.fn(),
  };
  const runtime = {
    config: { internalApiToken: TOKEN, explorerBaseUrl: EXPLORER },
    records,
    injective: { verifier: { verifyRecord: parts.verifyRecord ?? vi.fn() } },
  } as unknown as BlockchainRuntime;
  setBlockchainRuntimeForTesting(runtime);
}

function authedPost(url: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}` },
  });
}

afterEach(() => {
  setBlockchainRuntimeForTesting(null);
  vi.restoreAllMocks();
});

describe('GET /api/public-records/[id] route', () => {
  it('passes the 200 envelope through with correct status', async () => {
    installRuntime({ getById: vi.fn().mockResolvedValue(dto({ status: 'verified' })) });
    const res = await getDetail(new Request('http://t/api/public-records/r1'), ctx('r1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.recordId).toBe('r1');
    expect(body.data.chain.explorerUrl).toBe(`${EXPLORER}/tx/${TX_HASH}`);
  });

  it('returns 404 envelope when the record is missing', async () => {
    installRuntime({ getById: vi.fn().mockResolvedValue(null) });
    const res = await getDetail(new Request('http://t/api/public-records/ghost'), ctx('ghost'));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('RECORD_NOT_FOUND');
  });
});

describe('POST /api/public-records/[id]/submit route', () => {
  it('202 when the bearer token matches the internal token', async () => {
    installRuntime({
      requestSubmission: vi.fn().mockResolvedValue({ queued: true, jobId: 'submit:r1:v1' }),
    });
    const res = await postSubmit(authedPost('http://t/api/public-records/r1/submit'), ctx('r1'));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.jobId).toBe('submit:r1:v1');
  });

  it('401 when the authorization header is absent', async () => {
    const requestSubmission = vi.fn();
    installRuntime({ requestSubmission });
    const res = await postSubmit(
      new Request('http://t/api/public-records/r1/submit', { method: 'POST' }),
      ctx('r1'),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(requestSubmission).not.toHaveBeenCalled();
  });
});

describe('POST /api/public-records/[id]/retry route', () => {
  it('202 for a failed record with a bumped attemptEpoch', async () => {
    installRuntime({
      getById: vi.fn().mockResolvedValue(dto({ status: 'failed', attemptEpoch: 1 })),
      transition: vi.fn().mockResolvedValue(true),
      requestSubmission: vi.fn().mockResolvedValue({ queued: true, jobId: 'submit:r1:v2' }),
    });
    const res = await postRetry(authedPost('http://t/api/public-records/r1/retry'), ctx('r1'));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.data.attemptEpoch).toBe(2);
  });

  it('401 with a wrong token', async () => {
    installRuntime({ getById: vi.fn() });
    const res = await postRetry(
      new Request('http://t/api/public-records/r1/retry', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong' },
      }),
      ctx('r1'),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('GET /api/public-records/[id]/verify route', () => {
  it('200 verification envelope for a healthy record', async () => {
    installRuntime({
      getById: vi.fn().mockResolvedValue(dto({ status: 'verified' })),
      verifyRecord: vi.fn().mockResolvedValue(verifyResult()),
    });
    const res = await getVerify(new Request('http://t/api/public-records/r1/verify'), ctx('r1'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.verified).toBe(true);
    expect(body.data.chain.txHash).toBe(TX_HASH);
  });

  it('502 with onChain:unknown when the chain is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installRuntime({
      getById: vi.fn().mockResolvedValue(dto({ status: 'confirming' })),
      verifyRecord: vi.fn().mockRejectedValue(new ChainUnavailableError('rpc down')),
    });
    const res = await getVerify(new Request('http://t/api/public-records/r1/verify'), ctx('r1'));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('CHAIN_UNAVAILABLE');
    expect(body.data).toEqual({ onChain: 'unknown', dbStatus: 'confirming' });
  });
});
