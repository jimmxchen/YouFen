import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Shared mock holders, hoisted so the vi.mock factories below can reference them.
const h = vi.hoisted(() => ({
  getPrismaMock: vi.fn(),
  createQueuesMock: vi.fn(),
  createEnqueueMock: vi.fn(),
  createPublicRecordServiceMock: vi.fn(),
  buildEnvelopeForSourceMock: vi.fn(),
  hashMemberIdMock: vi.fn(),
  hashOptionIdMock: vi.fn(),
}));

// --- Leaf infrastructure mocks (db client + blockchain factories). ---
vi.mock('../db/client', () => ({ getPrisma: h.getPrismaMock }));
vi.mock('../blockchain/queue/queues', () => ({ createQueues: h.createQueuesMock }));
vi.mock('../blockchain/queue/enqueue', () => ({ createEnqueue: h.createEnqueueMock }));
vi.mock('../blockchain/records/record-service', () => ({
  createPublicRecordService: h.createPublicRecordServiceMock,
}));
vi.mock('../blockchain/payloads', () => ({
  buildEnvelopeForSource: h.buildEnvelopeForSourceMock,
}));
vi.mock('../blockchain/hashing/id-hash', () => ({
  hashMemberId: h.hashMemberIdMock,
  hashOptionId: h.hashOptionIdMock,
}));

// --- Service factories: spy-wrapped REAL implementations. Wrapping the actual
// factory lets the assembly-graph tests inspect the deps each service receives
// while the end-to-end smoke test still exercises the genuine service logic. ---
vi.mock('./policy-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./policy-service')>();
  return { ...actual, createPolicyService: vi.fn(actual.createPolicyService) };
});
vi.mock('./epoch-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./epoch-service')>();
  return { ...actual, createEpochService: vi.fn(actual.createEpochService) };
});
vi.mock('./proposal-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./proposal-service')>();
  return { ...actual, createProposalService: vi.fn(actual.createProposalService) };
});
vi.mock('./mint-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./mint-service')>();
  return { ...actual, createMintService: vi.fn(actual.createMintService) };
});
vi.mock('./advance-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./advance-service')>();
  return { ...actual, createAdvanceService: vi.fn(actual.createAdvanceService) };
});
vi.mock('./reversal-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./reversal-service')>();
  return { ...actual, createReversalService: vi.fn(actual.createReversalService) };
});

import { createAdvanceService } from './advance-service';
import { createEpochService } from './epoch-service';
import { createMintService } from './mint-service';
import { createPolicyService } from './policy-service';
import { createProposalService } from './proposal-service';
import { createReversalService } from './reversal-service';
import {
  getEngineRuntime,
  setEngineRuntimeForTesting,
  type EngineRuntime,
} from './runtime';
import {
  makeFakeEngineDb,
  makeFakeRecordsPort,
  type FakeEngineDb,
  type FakeRecordsPort,
} from './testing/fake-engine-db';

const PEPPER = 'test-pepper-0123456789';
const HASH_ZERO = `0x${'0'.repeat(64)}` as const;

/** Snapshot + restore the env keys the runtime reads. */
let savedEnv: Record<string, string | undefined>;

function setDefaultMockImpls(): void {
  h.getPrismaMock.mockReturnValue(makeFakeEngineDb());
  h.createPublicRecordServiceMock.mockReturnValue(makeFakeRecordsPort());
  h.createQueuesMock.mockReturnValue({ submitQueue: {}, confirmQueue: {} });
  h.createEnqueueMock.mockReturnValue(
    vi.fn(() => Promise.resolve({ queued: true, jobId: 'real-job' })),
  );
  h.buildEnvelopeForSourceMock.mockImplementation((source: { kind: string }) => ({
    envelope: { kind: source.kind },
    recordHash: HASH_ZERO,
  }));
  h.hashMemberIdMock.mockReturnValue(`0x${'aa'.repeat(32)}`);
  h.hashOptionIdMock.mockReturnValue(`0x${'bb'.repeat(32)}`);
}

beforeEach(() => {
  savedEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    RECORD_HASH_PEPPER: process.env.RECORD_HASH_PEPPER,
    REDIS_URL: process.env.REDIS_URL,
  };
  process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
  process.env.RECORD_HASH_PEPPER = PEPPER;
  process.env.REDIS_URL = 'redis://localhost:6379';

  vi.clearAllMocks();
  setDefaultMockImpls();
  setEngineRuntimeForTesting(null);
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  setEngineRuntimeForTesting(null);
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Assembly graph
// ---------------------------------------------------------------------------

describe('getEngineRuntime — assembly graph', () => {
  it('wires epoch.policyActivation to the policy instance', async () => {
    const rt = await getEngineRuntime();

    const policyResult = vi.mocked(createPolicyService).mock.results[0]?.value;
    expect(policyResult).toBe(rt.policy);

    const epochDeps = vi.mocked(createEpochService).mock.calls[0]?.[0];
    expect(epochDeps?.policyActivation).toBe(policyResult);
  });

  it('wires proposal with policy, hashMemberId, hashOptionId', async () => {
    const rt = await getEngineRuntime();

    const policyResult = vi.mocked(createPolicyService).mock.results[0]?.value;
    const proposalDeps = vi.mocked(createProposalService).mock.calls[0]?.[0];

    expect(proposalDeps?.policy).toBe(policyResult);
    expect(typeof proposalDeps?.hashMemberId).toBe('function');
    expect(typeof proposalDeps?.hashOptionId).toBe('function');
    expect(rt.proposal).toBeDefined();
  });

  it('gives every base service the same db + records + buildEnvelope', async () => {
    const rt = await getEngineRuntime();

    const mintDeps = vi.mocked(createMintService).mock.calls[0]?.[0];
    const advanceDeps = vi.mocked(createAdvanceService).mock.calls[0]?.[0];
    const reversalDeps = vi.mocked(createReversalService).mock.calls[0]?.[0];

    expect(mintDeps?.db).toBe(rt.db);
    expect(mintDeps?.records).toBe(rt.records);
    expect(advanceDeps?.db).toBe(rt.db);
    expect(reversalDeps?.db).toBe(rt.db);
    // buildEnvelope is a single shared port across the graph.
    expect(advanceDeps?.buildEnvelope).toBe(mintDeps?.buildEnvelope);
    expect(reversalDeps?.buildEnvelope).toBe(mintDeps?.buildEnvelope);
  });

  it('curries the pepper into buildEnvelope', async () => {
    await getEngineRuntime();
    const buildEnvelope = vi.mocked(createMintService).mock.calls[0]?.[0]
      ?.buildEnvelope;
    expect(buildEnvelope).toBeDefined();

    const source = { kind: 'token_mint' } as never;
    buildEnvelope?.(source);

    expect(h.buildEnvelopeForSourceMock).toHaveBeenCalledWith(source, PEPPER);
  });

  it('passes hashOptionId through with both args verbatim (no defaults)', async () => {
    await getEngineRuntime();
    const hashOptionId = vi.mocked(createProposalService).mock.calls[0]?.[0]
      ?.hashOptionId;

    const out = hashOptionId?.('prop-1', 'approve');

    expect(h.hashOptionIdMock).toHaveBeenCalledTimes(1);
    expect(h.hashOptionIdMock).toHaveBeenCalledWith('prop-1', 'approve');
    expect(out).toBe(`0x${'bb'.repeat(32)}`);
  });

  it('binds the pepper into hashMemberId (3rd arg)', async () => {
    await getEngineRuntime();
    const hashMemberId = vi.mocked(createProposalService).mock.calls[0]?.[0]
      ?.hashMemberId;

    hashMemberId?.('comm-1', 'mem-1');

    expect(h.hashMemberIdMock).toHaveBeenCalledWith('comm-1', 'mem-1', PEPPER);
  });
});

// ---------------------------------------------------------------------------
// Singleton + test seam
// ---------------------------------------------------------------------------

describe('getEngineRuntime — singleton + test seam', () => {
  it('caches the runtime: assembly runs once across calls', async () => {
    const first = await getEngineRuntime();
    const second = await getEngineRuntime();

    expect(first).toBe(second);
    expect(vi.mocked(createPolicyService)).toHaveBeenCalledTimes(1);
  });

  it('setEngineRuntimeForTesting overrides, and null restores rebuild', async () => {
    const fake = { db: {}, policy: {} } as unknown as EngineRuntime;
    setEngineRuntimeForTesting(fake);

    expect(await getEngineRuntime()).toBe(fake);
    // Override short-circuits assembly entirely.
    expect(vi.mocked(createPolicyService)).not.toHaveBeenCalled();

    setEngineRuntimeForTesting(null);
    const rebuilt = await getEngineRuntime();
    expect(rebuilt).not.toBe(fake);
    expect(vi.mocked(createPolicyService)).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Environment contract
// ---------------------------------------------------------------------------

describe('getEngineRuntime — environment contract', () => {
  it('hard-fails when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL;
    await expect(getEngineRuntime()).rejects.toThrow(/DATABASE_URL/);
  });

  it('hard-fails when RECORD_HASH_PEPPER is missing', async () => {
    delete process.env.RECORD_HASH_PEPPER;
    await expect(getEngineRuntime()).rejects.toThrow(/RECORD_HASH_PEPPER/);
  });

  it('uses a real Redis-backed enqueue when REDIS_URL is set', async () => {
    await getEngineRuntime();
    expect(h.createQueuesMock).toHaveBeenCalledWith({
      url: 'redis://localhost:6379',
    });
    expect(h.createEnqueueMock).toHaveBeenCalledWith({ submitQueue: {} });
  });

  it('degrades to a no-op enqueue when REDIS_URL is missing (no throw)', async () => {
    delete process.env.REDIS_URL;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(getEngineRuntime()).resolves.toBeDefined();

    // The enqueue handed to the record service is the no-op.
    const recordDeps = h.createPublicRecordServiceMock.mock.calls[0]?.[0] as {
      enqueue: (r: { id: string; attemptEpoch: number }) => Promise<unknown>;
    };
    const result = await recordDeps.enqueue({ id: 'r1', attemptEpoch: 0 });
    expect(result).toEqual({ queued: false, jobId: 'noop' });

    // No queue was constructed, and the degraded mode warned exactly once.
    expect(h.createQueuesMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// End-to-end smoke: the real six-service graph over fake db + fake records
// ---------------------------------------------------------------------------

describe('getEngineRuntime — end-to-end smoke', () => {
  function seedBaseline(db: FakeEngineDb): void {
    db.seedCommunity({ id: 'c1' });
    db.seedMember({ id: 'm1', communityId: 'c1', role: 'member' });
    db.seedState({ communityId: 'c1', currentTotalSupply: 100_000n, ledgerSeq: 0n });
    db.seedPolicy({
      communityId: 'c1',
      policyVersion: 1,
      monthlyInflationRateBps: 1000,
      maxAdvanceRateBps: 2000,
      memberMintCapRateBps: 10000,
      epochDurationDays: 30,
      rules: [{ id: 'r1', tokenAmount: 1000 }],
    });
    db.seedBalance({
      communityId: 'c1',
      memberId: 'm1',
      tokensEarnedCurrentEpoch: 0n,
      tokensEarnedLifetime: 0n,
      tokensReversedLifetime: 0n,
    });
  }

  it('runs createNextEpoch -> mint -> closeEpoch across the wired graph', async () => {
    const db = makeFakeEngineDb();
    const records = makeFakeRecordsPort();
    seedBaseline(db);

    h.getPrismaMock.mockReturnValue(db);
    h.createPublicRecordServiceMock.mockReturnValue(records);
    let hashSeq = 0;
    h.buildEnvelopeForSourceMock.mockImplementation((source: { kind: string }) => {
      hashSeq += 1;
      return {
        envelope: { kind: source.kind },
        recordHash: `0x${hashSeq.toString(16).padStart(64, '0')}`,
      };
    });

    const rt = await getEngineRuntime();
    expect(rt.db).toBe(db);
    expect(rt.records).toBe(records);

    // 1) Bootstrap epoch #1.
    const created = await rt.epoch.createNextEpoch('c1');
    expect(created.created).toBe(true);

    // 2) Seed an approved contribution now that the epoch exists.
    db.seedContribution({
      id: 'con1',
      communityId: 'c1',
      memberId: 'm1',
      ruleId: 'r1',
      approvedTokenAmount: 100n,
      status: 'approved',
      description: 'desc',
      evidence: ['http://e'],
    });

    // 3) Mint against the contribution — proves mint <-> records <-> buildEnvelope.
    const out = await rt.mint.mintForContribution({
      contributionId: 'con1',
      approverId: 'admin1',
    });
    expect(out.mintEvents).toHaveLength(1);
    expect(out.memberBalanceAfter).toBe(100n);
    expect(records.submissions).toHaveLength(1);

    // 4) Close the epoch — proves epoch reaches the policy activation port.
    const activationSpy = vi.spyOn(rt.policy, 'activatePendingVersion');
    const closed = await rt.epoch.closeEpoch(created.epochId);

    expect('nextEpochId' in closed).toBe(true);
    expect(activationSpy).toHaveBeenCalledTimes(1);
    expect(activationSpy).toHaveBeenCalledWith(expect.anything(), 'c1', 2);
  });
});

// ---------------------------------------------------------------------------
// Key isolation: the Web-facing runtime must never import wallet/submitter.
// ---------------------------------------------------------------------------

describe('runtime.ts source — key isolation', () => {
  it('imports no wallet or submitter module', () => {
    const source = readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8');
    // Only import statements matter; comments may legitimately mention the words.
    const importLines = source
      .split('\n')
      .filter((line) => /^\s*import\b/.test(line) || /\bfrom\s+['"]/.test(line));
    for (const line of importLines) {
      expect(line).not.toMatch(/wallet/i);
      expect(line).not.toMatch(/submitter/i);
    }
    // Belt-and-suspenders: neither module path appears anywhere.
    expect(source).not.toMatch(/injective\/wallet/);
    expect(source).not.toMatch(/injective\/submitter/);
  });
});
