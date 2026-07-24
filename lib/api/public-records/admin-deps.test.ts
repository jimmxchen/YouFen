import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setBlockchainRuntimeForTesting } from '../../blockchain/runtime';
import type { BlockchainRuntime } from '../../blockchain/types';

import { resolveAdminDeps, setAdminDepsForTesting } from './admin-deps';
import type { AdminResolvedDeps } from './admin-deps';

// Mock the generated Prisma client so the key-free build path constructs no real
// DB connection. A hoisted handle lets the tests observe construction + reads.
const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  counter: { constructed: 0 },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    publicRecord = { findUnique: h.findUnique };
    constructor() {
      h.counter.constructed += 1;
    }
  },
}));

// Mock BullMQ so the key-free build path never instantiates a real Queue (which
// would open an ioredis connection). All Queue instances share one add/getJob
// handle so the tests can assert the enqueue actually fired.
const q = vi.hoisted(() => ({
  add: vi.fn(),
  getJob: vi.fn(),
  counter: { constructed: 0 },
}));

vi.mock('bullmq', () => ({
  Queue: class {
    add = q.add;
    getJob = q.getJob;
    constructor() {
      q.counter.constructed += 1;
    }
  },
}));

const TOKEN = 'internal-token-abcdef123456';

// A single pending PublicRecord row, enough for getById -> requestSubmission.
function pendingRow(): Record<string, unknown> {
  return {
    id: 'r1',
    communityId: 'c_1',
    recordType: 'token_mint',
    status: 'pending',
    envelopeJson: '{"schema":"youfen.record.v1"}',
    recordHash: '0x' + 'ab'.repeat(32),
    sourceTable: 'TokenMintEvent',
    sourceId: 'mint_1',
    txHash: null,
    assignedNonce: null,
    blockNumber: null,
    blockHash: null,
    submittedAt: null,
    confirmedAt: null,
    attemptEpoch: 1,
    lastError: null,
    supersededByRecordId: null,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    updatedAt: new Date('2026-07-20T00:00:00.000Z'),
  };
}

const savedEnv = { ...process.env };

beforeEach(() => {
  setBlockchainRuntimeForTesting(null);
  setAdminDepsForTesting(null);
  h.findUnique.mockReset();
  h.counter.constructed = 0;
  q.add.mockReset();
  q.getJob.mockReset();
  q.counter.constructed = 0;
});

afterEach(() => {
  setBlockchainRuntimeForTesting(null);
  setAdminDepsForTesting(null);
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe('resolveAdminDeps — runtime already initialised', () => {
  it('reuses the runtime records + internal token and builds no Prisma/queue', async () => {
    const records = { requestSubmission: vi.fn(), getById: vi.fn(), transition: vi.fn() };
    const runtime = {
      config: { internalApiToken: TOKEN, explorerBaseUrl: 'https://explorer.test' },
      records,
      injective: { verifier: { verifyRecord: vi.fn() } },
    } as unknown as BlockchainRuntime;
    setBlockchainRuntimeForTesting(runtime);

    const deps = await resolveAdminDeps();

    expect(deps.records).toBe(records);
    expect(deps.internalApiToken).toBe(TOKEN);
    // Key isolation: the reuse path must not spin up Prisma or a queue here.
    expect(h.counter.constructed).toBe(0);
    expect(q.counter.constructed).toBe(0);
  });
});

describe('resolveAdminDeps — no runtime (Web layer)', () => {
  it('builds a key-free admin path without BLOCKCHAIN_PRIVATE_KEY and enqueues', async () => {
    // Simulate a Web deployment that intentionally omits the recorder key but
    // still holds the internal admin token (a legitimate Web-layer secret).
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    delete process.env.CONTRACT_ADDRESS;
    delete process.env.RECORD_HASH_PEPPER;
    process.env.INTERNAL_API_TOKEN = TOKEN;
    h.findUnique.mockResolvedValue(pendingRow());
    q.getJob.mockResolvedValue(undefined);

    const deps = await resolveAdminDeps();

    expect(deps.internalApiToken).toBe(TOKEN);
    expect(h.counter.constructed).toBe(1);
    expect(q.counter.constructed).toBeGreaterThanOrEqual(1);

    // The enqueue path works end to end through Redis, never through a wallet.
    const result = await deps.records.requestSubmission('r1');
    expect(result).toEqual({ queued: true, jobId: 'submit:r1:v1' });
    expect(q.add).toHaveBeenCalledWith(
      'submit',
      { recordId: 'r1' },
      expect.objectContaining({ jobId: 'submit:r1:v1' }),
    );
  });

  it('caches the built admin deps across calls (single Prisma client)', async () => {
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    process.env.INTERNAL_API_TOKEN = TOKEN;

    const a = await resolveAdminDeps();
    const b = await resolveAdminDeps();

    expect(a).toBe(b);
    expect(h.counter.constructed).toBe(1);
  });

  it('fails fast with a clear message when INTERNAL_API_TOKEN is missing', async () => {
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    delete process.env.INTERNAL_API_TOKEN;

    await expect(resolveAdminDeps()).rejects.toThrow(/Invalid admin configuration/);
    // A failed build must not leave a real Prisma client or queue dangling.
    expect(h.counter.constructed).toBe(0);
    expect(q.counter.constructed).toBe(0);
  });
});

describe('setAdminDepsForTesting', () => {
  it('injected deps win over both runtime and DB build', async () => {
    const injected: AdminResolvedDeps = {
      records: { requestSubmission: vi.fn() } as unknown as AdminResolvedDeps['records'],
      internalApiToken: TOKEN,
    };
    setAdminDepsForTesting(injected);

    const deps = await resolveAdminDeps();

    expect(deps).toBe(injected);
    expect(h.counter.constructed).toBe(0);
    expect(q.counter.constructed).toBe(0);
  });
});
