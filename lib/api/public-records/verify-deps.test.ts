import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { setBlockchainRuntimeForTesting } from '../../blockchain/runtime';
import type { BlockchainRuntime, Hex32, PublicRecordDTO } from '../../blockchain/types';

import { resolveVerifyDeps, setVerifyDepsForTesting } from './verify-deps';
import type { VerifyResolvedDeps } from './verify-deps';

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

const STORED_HASH = ('0x' + 'ab'.repeat(32)) as Hex32;
const CONTRACT = '0x' + '11'.repeat(20);
const PEPPER = 'pepper-at-least-16-chars';
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
  setVerifyDepsForTesting(null);
  h.findUnique.mockReset();
  h.counter.constructed = 0;
});

afterEach(() => {
  setBlockchainRuntimeForTesting(null);
  setVerifyDepsForTesting(null);
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

describe('resolveVerifyDeps — runtime already initialised', () => {
  it('reuses the runtime verifier + records and never builds Prisma', async () => {
    const verifier = { verifyRecord: vi.fn(), readChainRecord: vi.fn() };
    const records = { getById: vi.fn() };
    const runtime = {
      config: { explorerBaseUrl: EXPLORER, internalApiToken: 'x' },
      records,
      injective: { verifier },
    } as unknown as BlockchainRuntime;
    setBlockchainRuntimeForTesting(runtime);

    const deps = await resolveVerifyDeps();

    expect(deps.verifier).toBe(verifier);
    expect(deps.records).toBe(records);
    // Key isolation: the read-only path must not spin up a Prisma client here.
    expect(h.counter.constructed).toBe(0);
  });
});

describe('resolveVerifyDeps — no runtime (Web layer)', () => {
  it('builds a key-free verify path without BLOCKCHAIN_PRIVATE_KEY', async () => {
    // Simulate a Web deployment that intentionally omits the recorder key.
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    delete process.env.INTERNAL_API_TOKEN;
    process.env.CONTRACT_ADDRESS = CONTRACT;
    process.env.RECORD_HASH_PEPPER = PEPPER;
    process.env.EXPLORER_BASE_URL = EXPLORER;
    h.findUnique.mockResolvedValue(dtoRow());

    const deps = await resolveVerifyDeps();

    // A verifier and a records port are wired, and Prisma was built exactly once.
    expect(typeof deps.verifier.verifyRecord).toBe('function');
    expect(h.counter.constructed).toBe(1);

    const rec = await deps.records.getById('r1');
    expect(rec?.id).toBe('r1');
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });

  it('caches the built read-only deps across calls (single Prisma client)', async () => {
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    process.env.CONTRACT_ADDRESS = CONTRACT;
    process.env.RECORD_HASH_PEPPER = PEPPER;
    h.findUnique.mockResolvedValue(null);

    const a = await resolveVerifyDeps();
    const b = await resolveVerifyDeps();

    expect(a).toBe(b);
    expect(h.counter.constructed).toBe(1);
  });

  it('fails fast with a clear message when required verify config is missing', async () => {
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;
    delete process.env.CONTRACT_ADDRESS;
    delete process.env.RECORD_HASH_PEPPER;

    await expect(resolveVerifyDeps()).rejects.toThrow(/Invalid verify configuration/);
    // A failed build must not leave a real Prisma client dangling as cached deps.
    expect(h.counter.constructed).toBe(0);
  });
});

describe('setVerifyDepsForTesting', () => {
  it('injected deps win over both runtime and DB build', async () => {
    const injected: VerifyResolvedDeps = {
      verifier: { verifyRecord: vi.fn() } as unknown as VerifyResolvedDeps['verifier'],
      records: { getById: vi.fn() } as unknown as VerifyResolvedDeps['records'],
    };
    setVerifyDepsForTesting(injected);

    const deps = await resolveVerifyDeps();

    expect(deps).toBe(injected);
    expect(h.counter.constructed).toBe(0);
  });
});
