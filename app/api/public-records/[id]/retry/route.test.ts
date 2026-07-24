import { describe, it, expect, vi, afterEach } from 'vitest';

import { setBlockchainRuntimeForTesting } from '../../../../../lib/blockchain/runtime';
import { setAdminDepsForTesting } from '../../../../../lib/api/public-records/admin-deps';
import type { AdminResolvedDeps } from '../../../../../lib/api/public-records/admin-deps';
import type { PublicRecordDTO } from '../../../../../lib/blockchain/types';

import { POST as postRetry } from './route';

// The retry route must resolve its deps through the key-free resolveAdminDeps
// path — never initBlockchainRuntime. These tests inject admin deps directly
// (setAdminDepsForTesting) and install NO blockchain runtime, proving the route
// signs/enqueues a retry without ever forcing BLOCKCHAIN_PRIVATE_KEY or a wallet
// into the Web process.

const TOKEN = 'internal-token-abcdef123456';
const STORED_HASH = ('0x' + 'ab'.repeat(32)) as PublicRecordDTO['recordHash'];

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

function dto(overrides: Partial<PublicRecordDTO> = {}): PublicRecordDTO {
  return {
    id: 'r1',
    communityId: 'c_1',
    sourceTable: 'TokenMintEvent',
    sourceId: 'mint_1',
    recordType: 'token_mint',
    status: 'failed',
    envelopeJson: '{"schema":"youfen.record.v1"}',
    recordHash: STORED_HASH,
    txHash: null,
    assignedNonce: null,
    blockNumber: null,
    blockHash: null,
    submittedAt: null,
    confirmedAt: null,
    attemptEpoch: 1,
    lastError: 'boom',
    supersededByRecordId: null,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    updatedAt: new Date('2026-07-20T00:00:00.000Z'),
    ...overrides,
  };
}

interface FakeParts {
  getById?: ReturnType<typeof vi.fn>;
  transition?: ReturnType<typeof vi.fn>;
  requestSubmission?: ReturnType<typeof vi.fn>;
}

function installAdminDeps(parts: FakeParts = {}): void {
  const records = {
    getById: parts.getById ?? vi.fn(),
    getWithSource: vi.fn(),
    requestSubmission: parts.requestSubmission ?? vi.fn(),
    transition: parts.transition ?? vi.fn(),
  };
  const deps: AdminResolvedDeps = {
    records: records as unknown as AdminResolvedDeps['records'],
    internalApiToken: TOKEN,
  };
  setAdminDepsForTesting(deps);
}

function authedPost(url: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}` },
  });
}

afterEach(() => {
  setAdminDepsForTesting(null);
  setBlockchainRuntimeForTesting(null);
  vi.restoreAllMocks();
});

describe('POST /api/public-records/[id]/retry route (key-free deps)', () => {
  it('202 with a bumped attemptEpoch, resolved without any blockchain runtime', async () => {
    // No setBlockchainRuntimeForTesting: proves the route needs no recorder key.
    const requestSubmission = vi
      .fn()
      .mockResolvedValue({ queued: true, jobId: 'submit:r1:v2' });
    installAdminDeps({
      getById: vi.fn().mockResolvedValue(dto({ status: 'failed', attemptEpoch: 1 })),
      transition: vi.fn().mockResolvedValue(true),
      requestSubmission,
    });

    const res = await postRetry(authedPost('http://t/api/public-records/r1/retry'), ctx('r1'));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.attemptEpoch).toBe(2);
    expect(body.data.jobId).toBe('submit:r1:v2');
    expect(requestSubmission).toHaveBeenCalledWith('r1');
  });

  it('401 when the bearer token does not match the internal token', async () => {
    const transition = vi.fn();
    const requestSubmission = vi.fn();
    installAdminDeps({ getById: vi.fn(), transition, requestSubmission });

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
    expect(transition).not.toHaveBeenCalled();
    expect(requestSubmission).not.toHaveBeenCalled();
  });

  it('401 when the authorization header is absent', async () => {
    const requestSubmission = vi.fn();
    installAdminDeps({ getById: vi.fn(), requestSubmission });

    const res = await postRetry(
      new Request('http://t/api/public-records/r1/retry', { method: 'POST' }),
      ctx('r1'),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(requestSubmission).not.toHaveBeenCalled();
  });

  it('409 when the record is not in the failed state', async () => {
    installAdminDeps({
      getById: vi.fn().mockResolvedValue(dto({ status: 'pending' })),
    });

    const res = await postRetry(authedPost('http://t/api/public-records/r1/retry'), ctx('r1'));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_STATUS');
  });
});
