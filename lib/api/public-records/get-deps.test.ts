import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setBlockchainRuntimeForTesting } from '../../blockchain/runtime';
import type { BlockchainRuntime, Hex32, PublicRecordDTO } from '../../blockchain/types';

import { resolveGetDeps, setGetDepsForTesting } from './get-deps';
import type { GetDeps } from './handlers';

// Mock the generated Prisma client so the read-only build path constructs no real
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

const STORED_HASH = ('0x' + 'ab'.repeat(32)) as Hex32;
const EXPLORER = 'https://explorer.test';

function dtoRow(): PublicRecordDTO {
  return {
    id: 'r1',
    communityId: 'c_1',
    sourceTable: 'TokenMintEvent',
    sourceId: 'mint_1',
    recordType: 'token_mint',
    status: 'verified',
    envelopeJson: '{"schema":"youfen.record.v1"}',
    recordHash: STORED_HASH,
    txHash: '0x' + 'ef'.repeat(32),
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
  };
}

const savedEnv = { ...process.env };

beforeEach(() => {
  setBlockchainRuntimeForTesting(null);
  setGetDepsForTesting(null);
  h.findUnique.mockReset();
  h.counter.constructed = 0;
});

afterEach(() => {
  setBlockchainRuntimeForTesting(null);
  setGetDepsForTesting(null);
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe('resolveGetDeps — runtime already initialised', () => {
  it('reuses the runtime records + explorerBaseUrl and never builds Prisma', async () => {
    const records = { getById: vi.fn() };
    const runtime = {
      config: { explorerBaseUrl: EXPLORER, internalApiToken: 'x' },
      records,
    } as unknown as BlockchainRuntime;
    setBlockchainRuntimeForTesting(runtime);

    const deps = await resolveGetDeps();

    expect(deps.records).toBe(records);
    expect(deps.explorerBaseUrl).toBe(EXPLORER);
    // Key isolation: the read-only path must not spin up a Prisma client here.
    expect(h.counter.constructed).toBe(0);
  });
});

describe('resolveGetDeps — no runtime (Web layer)', () => {
  it('builds a read-only DB service without BLOCKCHAIN_PRIVATE_KEY', async () => {
    // Simulate a Web deployment that intentionally omits the recorder key.
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    process.env.EXPLORER_BASE_URL = EXPLORER;
    h.findUnique.mockResolvedValue(dtoRow());

    const deps = await resolveGetDeps();

    expect(deps.explorerBaseUrl).toBe(EXPLORER);
    expect(h.counter.constructed).toBe(1);

    const rec = await deps.records.getById('r1');
    expect(rec?.id).toBe('r1');
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('falls back to the config default explorer URL when the env var is unset', async () => {
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    delete process.env.EXPLORER_BASE_URL;
    h.findUnique.mockResolvedValue(null);

    const deps = await resolveGetDeps();

    expect(deps.explorerBaseUrl).toBe('https://testnet-injective.cloud.blockscout.com');
  });

  it('caches the built read-only deps across calls (single Prisma client)', async () => {
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    h.findUnique.mockResolvedValue(null);

    const a = await resolveGetDeps();
    const b = await resolveGetDeps();

    expect(a).toBe(b);
    expect(h.counter.constructed).toBe(1);
  });

  it('exposes no write path: the read-only enqueue throws when reached', async () => {
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    // A 'pending' record lets requestSubmission fall through to enqueue, which is
    // the key-free read-only stub and must refuse to broadcast.
    h.findUnique.mockResolvedValue({ ...dtoRow(), status: 'pending' });

    const deps = await resolveGetDeps();
    const records = deps.records as GetDeps['records'] & {
      requestSubmission: (id: string) => Promise<unknown>;
    };

    await expect(records.requestSubmission('r1')).rejects.toThrow(
      /read-only public records path/,
    );
  });
});

describe('setGetDepsForTesting', () => {
  it('injected deps win over both runtime and DB build', async () => {
    const injected: GetDeps = {
      records: { getById: vi.fn() } as unknown as GetDeps['records'],
      explorerBaseUrl: 'https://injected.test',
    };
    setGetDepsForTesting(injected);

    const deps = await resolveGetDeps();

    expect(deps).toBe(injected);
    expect(h.counter.constructed).toBe(0);
  });
});
