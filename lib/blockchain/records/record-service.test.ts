import { keccak256, toUtf8Bytes } from 'ethers';
import { describe, it, expect, vi } from 'vitest';

import {
  InvalidTransitionError,
  InvalidStatusError,
  RecordNotFoundError,
  TerminalError,
} from '../errors';
import { canonicalize } from '../hashing/canonicalize';
import { computeRecordHash } from '../hashing/record-hash';
import { buildEnvelopeForSource } from '../payloads';
import type { PrismaTx, RecordEnvelope, RecordPatch } from '../types';

import { createPublicRecordService } from './record-service';

// ---- structural fixtures (mirror the trimmed Prisma rows the service reads) ----

const HASH_A = `0x${'a'.repeat(64)}` as const;
const HASH_B = `0x${'b'.repeat(64)}` as const;

interface PubRow {
  id: string;
  communityId: string;
  recordType: string;
  status: string;
  envelopeJson: string;
  recordHash: string;
  sourceTable: string;
  sourceId: string;
  txHash: string | null;
  assignedNonce: number | null;
  blockNumber: number | null;
  blockHash: string | null;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  attemptEpoch: number;
  lastError: string | null;
  supersededByRecordId: string | null;
  chainEligible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function prRow(over: Partial<PubRow> = {}): PubRow {
  return {
    id: 'pr_1',
    communityId: 'com_1',
    recordType: 'token_mint',
    status: 'pending',
    envelopeJson: '{}',
    recordHash: HASH_A,
    sourceTable: 'TokenMintEvent',
    sourceId: 'tme_1',
    txHash: null,
    assignedNonce: null,
    blockNumber: null,
    blockHash: null,
    submittedAt: null,
    confirmedAt: null,
    attemptEpoch: 1,
    lastError: null,
    supersededByRecordId: null,
    chainEligible: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

function mintRow(over: Record<string, unknown> = {}) {
  return {
    id: 'tme_1',
    communityId: 'com_1',
    memberId: 'mem_1',
    epochNumber: 3,
    mintType: 'contribution',
    budgetSource: 'current_epoch',
    amount: 500n,
    memberBalanceBefore: 10000n,
    memberBalanceAfter: 10500n,
    totalSupplyBefore: 115763n,
    totalSupplyAfter: 116263n,
    governanceActivationEpoch: null,
    tokenPolicyVersion: 2,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

function reversalRow(over: Record<string, unknown> = {}) {
  return {
    id: 'trv_1',
    communityId: 'com_1',
    memberId: 'mem_1',
    originalMintEventId: 'tme_orig',
    amount: 500n,
    totalBalanceAfter: 10000n,
    totalSupplyAfter: 115763n,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

function epochRow(over: Record<string, unknown> = {}) {
  return {
    id: 'epo_1',
    communityId: 'com_1',
    epochNumber: 3,
    openingSupply: 100000n,
    baseMintBudget: 5000n,
    regularMintedAmount: 4000n,
    advancedMintedAmount: 1000n,
    advanceDebtFromPreviousEpoch: 0n,
    closedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

function policyRow(over: Record<string, unknown> = {}) {
  return {
    id: 'pol_1',
    communityId: 'com_1',
    policyVersion: 2,
    monthlyInflationRateBps: 100,
    maxAdvanceRateBps: 5000,
    memberMintCapRateBps: 2000,
    effectiveEpoch: 3,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

function policyVersionRow(over: Record<string, unknown> = {}) {
  return {
    id: 'tpv_1',
    policyId: 'pol_1',
    version: 3,
    effectiveEpoch: 4,
    monthlyInflationRateBps: 120,
    maxAdvanceRateBps: 5000,
    memberMintCapRateBps: 2000,
    rules: [],
    proposalId: null,
    publicRecordId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

function proposalRow(over: Record<string, unknown> = {}) {
  return {
    id: 'prop_1',
    communityId: 'com_1',
    epochNumberSnapshot: 3,
    totalSupplySnapshot: 116263n,
    activeGovernanceSupplySnapshot: 90000n,
    tokenPolicyVersionSnapshot: 2,
    snapshotAt: new Date('2026-01-01T00:00:00.000Z'),
    endedAt: null,
    winningOptionId: null,
    voterCount: null,
    totalVoteWeight: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

type ServiceDeps = Parameters<typeof createPublicRecordService>[0];

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    publicRecord: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn(),
    },
    tokenMintEvent: { findUnique: vi.fn() },
    tokenReversalEvent: { findUnique: vi.fn() },
    tokenEpoch: { findUnique: vi.fn() },
    communityTokenPolicy: { findUnique: vi.fn() },
    tokenPolicyVersion: { findUnique: vi.fn() },
    proposal: { findUnique: vi.fn() },
    ...over,
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>, enqueue = vi.fn()) {
  return createPublicRecordService({
    prisma: prisma as unknown as ServiceDeps['prisma'],
    enqueue: enqueue as unknown as ServiceDeps['enqueue'],
  });
}

const ENVELOPE: RecordEnvelope = {
  schema: 'youfen.record.v1',
  type: 'token_mint',
  payload: { amount: 500, mintEventId: 'tme_1' },
};

describe('transition — conditional UPDATE across the state machine', () => {
  it('issues WHERE id + status IN (from) and merges status + patch', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.updateMany.mockResolvedValue({ count: 1 });
    const ok = await makeService(prisma).transition('pr_1', ['pending'], 'submitting', {
      assignedNonce: 7,
    });
    expect(ok).toBe(true);
    expect(prisma.publicRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'pr_1', status: { in: ['pending'] } },
      data: { status: 'submitting', assignedNonce: 7 },
    });
  });

  it('returns false when 0 rows match (lost concurrency race)', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.updateMany.mockResolvedValue({ count: 0 });
    expect(await makeService(prisma).transition('pr_1', ['pending'], 'submitting')).toBe(false);
  });

  it('throws InvalidTransitionError for an illegal edge and never touches the DB', async () => {
    const prisma = makePrisma();
    await expect(
      makeService(prisma).transition('pr_1', ['verified'], 'pending'),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(prisma.publicRecord.updateMany).not.toHaveBeenCalled();
  });

  it('validates every from state (rejects if any edge is illegal)', async () => {
    const prisma = makePrisma();
    // confirming->pending is legal but submitting is not part of this from-set;
    // verified->pending is illegal, so the whole call must reject.
    await expect(
      makeService(prisma).transition('pr_1', ['confirming', 'verified'], 'pending'),
    ).rejects.toBeInstanceOf(InvalidTransitionError);
    expect(prisma.publicRecord.updateMany).not.toHaveBeenCalled();
  });

  it('drops non-whitelisted patch keys before writing', async () => {
    const prisma = makePrisma();
    await makeService(prisma).transition('pr_1', ['submitting'], 'failed', {
      lastError: 'boom',
      hacked: 'nope',
    } as unknown as RecordPatch);
    expect(prisma.publicRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'pr_1', status: { in: ['submitting'] } },
      data: { status: 'failed', lastError: 'boom' },
    });
  });
});

describe('patchInStatus — same-status patch that bypasses the state machine', () => {
  it('updates WHERE id + status (scalar) without a status field in data', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.updateMany.mockResolvedValue({ count: 1 });
    const ok = await makeService(prisma).patchInStatus('pr_1', 'submitting', {
      assignedNonce: 9,
    });
    expect(ok).toBe(true);
    const call = prisma.publicRecord.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'pr_1', status: 'submitting' });
    expect(call.data).toEqual({ assignedNonce: 9 });
    expect(call.data).not.toHaveProperty('status');
  });

  it('never validates a transition (a self-status patch is allowed)', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.updateMany.mockResolvedValue({ count: 0 });
    // submitting -> submitting is an illegal *transition*, but patchInStatus must
    // not throw; it simply reports whether a row matched.
    expect(
      await makeService(prisma).patchInStatus('pr_1', 'submitting', { assignedNonce: 1 }),
    ).toBe(false);
  });
});

describe('requestSubmission — enqueue guard', () => {
  it('throws RecordNotFoundError when the record is missing', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(null);
    await expect(makeService(prisma).requestSubmission('missing')).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
  });

  it('throws InvalidStatusError carrying the current status when not pending', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(prRow({ status: 'submitting' }));
    let caught: InvalidStatusError | undefined;
    try {
      await makeService(prisma).requestSubmission('pr_1');
    } catch (e: unknown) {
      caught = e as InvalidStatusError;
    }
    expect(caught).toBeInstanceOf(InvalidStatusError);
    expect(caught?.message).toContain('submitting');
  });

  it('enqueues with id + attemptEpoch and returns the queue result when pending', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(prRow({ status: 'pending', attemptEpoch: 2 }));
    const enqueue = vi.fn().mockResolvedValue({ queued: true, jobId: 'submit:pr_1:v2' });
    const res = await makeService(prisma, enqueue).requestSubmission('pr_1');
    expect(res).toEqual({ queued: true, jobId: 'submit:pr_1:v2' });
    expect(enqueue).toHaveBeenCalledWith({ id: 'pr_1', attemptEpoch: 2 });
  });

  it('propagates enqueue failures (record stays pending for the reconciler)', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(prRow({ status: 'pending' }));
    const enqueue = vi.fn().mockRejectedValue(new Error('redis down'));
    await expect(makeService(prisma, enqueue).requestSubmission('pr_1')).rejects.toThrow(
      'redis down',
    );
  });
});

describe('markSuperseded', () => {
  it('transitions verified -> superseded with supersededByRecordId', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.updateMany.mockResolvedValue({ count: 1 });
    await makeService(prisma).markSuperseded('pr_orig', 'pr_new');
    expect(prisma.publicRecord.updateMany).toHaveBeenCalledWith({
      where: { id: 'pr_orig', status: { in: ['verified'] } },
      data: { status: 'superseded', supersededByRecordId: 'pr_new' },
    });
  });

  it('throws InvalidStatusError when the original is not verified (0 rows)', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.updateMany.mockResolvedValue({ count: 0 });
    await expect(makeService(prisma).markSuperseded('pr_orig', 'pr_new')).rejects.toBeInstanceOf(
      InvalidStatusError,
    );
  });
});

describe('getById', () => {
  it('returns a DTO for an existing row', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(prRow({ status: 'verified' }));
    const dto = await makeService(prisma).getById('pr_1');
    expect(dto?.status).toBe('verified');
    expect(dto?.recordHash).toBe(HASH_A);
  });

  it('returns null when absent', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(null);
    expect(await makeService(prisma).getById('missing')).toBeNull();
  });
});

describe('getWithSource — dispatch by sourceTable', () => {
  it('returns null when the record row is missing', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(null);
    expect(await makeService(prisma).getWithSource('missing')).toBeNull();
  });

  it('TokenMintEvent -> token_mint, bigints preserved', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(prRow({ recordType: 'token_mint' }));
    prisma.tokenMintEvent.findUnique.mockResolvedValue(mintRow());
    const res = await makeService(prisma).getWithSource('pr_1');
    expect(prisma.tokenMintEvent.findUnique).toHaveBeenCalledWith({ where: { id: 'tme_1' } });
    expect(res?.source.kind).toBe('token_mint');
    if (res?.source.kind === 'token_mint') {
      expect(res.source.mintEvent.amount).toBe(500n);
      expect(typeof res.source.mintEvent.totalSupplyAfter).toBe('bigint');
    }
  });

  it('TokenMintEvent -> advance_mint when recordType is advance_mint', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ recordType: 'advance_mint' }),
    );
    prisma.tokenMintEvent.findUnique.mockResolvedValue(
      mintRow({ budgetSource: 'next_epoch_advance' }),
    );
    const res = await makeService(prisma).getWithSource('pr_1');
    expect(res?.source.kind).toBe('advance_mint');
    if (res?.source.kind === 'advance_mint') {
      expect(res.source.mintEvent.budgetSource).toBe('next_epoch_advance');
    }
  });

  it('TokenReversalEvent resolves originalRecordHash from the original mint record', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ sourceTable: 'TokenReversalEvent', sourceId: 'trv_1', recordType: 'token_reversal' }),
    );
    prisma.tokenReversalEvent.findUnique.mockResolvedValue(
      reversalRow({ originalMintEventId: 'tme_orig' }),
    );
    prisma.publicRecord.findMany.mockResolvedValue([prRow({ recordHash: HASH_B })]);
    const res = await makeService(prisma).getWithSource('pr_1');
    expect(prisma.publicRecord.findMany).toHaveBeenCalledWith({
      where: { sourceTable: 'TokenMintEvent', sourceId: 'tme_orig' },
    });
    expect(res?.source.kind).toBe('token_reversal');
    if (res?.source.kind === 'token_reversal') {
      expect(res.source.originalRecordHash).toBe(HASH_B);
    }
  });

  it('TokenReversalEvent -> TerminalError(ORIGINAL_RECORD_MISSING) when no original', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ sourceTable: 'TokenReversalEvent', sourceId: 'trv_1', recordType: 'token_reversal' }),
    );
    prisma.tokenReversalEvent.findUnique.mockResolvedValue(reversalRow());
    prisma.publicRecord.findMany.mockResolvedValue([]);
    let caught: TerminalError | undefined;
    try {
      await makeService(prisma).getWithSource('pr_1');
    } catch (e: unknown) {
      caught = e as TerminalError;
    }
    expect(caught).toBeInstanceOf(TerminalError);
    expect(caught?.message).toContain('ORIGINAL_RECORD_MISSING');
  });

  it('TokenEpoch -> epoch_summary', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ sourceTable: 'TokenEpoch', sourceId: 'epo_1', recordType: 'epoch_summary' }),
    );
    prisma.tokenEpoch.findUnique.mockResolvedValue(epochRow());
    const res = await makeService(prisma).getWithSource('pr_1');
    expect(res?.source.kind).toBe('epoch_summary');
    if (res?.source.kind === 'epoch_summary') {
      expect(res.source.epoch.openingSupply).toBe(100000n);
    }
  });

  it('CommunityTokenPolicy -> policy_version', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ sourceTable: 'CommunityTokenPolicy', sourceId: 'pol_1', recordType: 'policy_version' }),
    );
    prisma.communityTokenPolicy.findUnique.mockResolvedValue(policyRow());
    const res = await makeService(prisma).getWithSource('pr_1');
    expect(res?.source.kind).toBe('policy_version');
    if (res?.source.kind === 'policy_version') {
      expect(res.source.policy.policyVersion).toBe(2);
    }
  });

  it('Proposal -> proposal_snapshot / proposal_result by recordType', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ sourceTable: 'Proposal', sourceId: 'prop_1', recordType: 'proposal_result' }),
    );
    prisma.proposal.findUnique.mockResolvedValue(proposalRow({ winningOptionId: 'opt_1' }));
    const res = await makeService(prisma).getWithSource('pr_1');
    expect(res?.source.kind).toBe('proposal_result');
    if (res?.source.kind === 'proposal_result') {
      expect(res.source.proposal.winningOptionId).toBe('opt_1');
    }
  });

  it('TokenPolicyVersion -> policy_version, communityId resolved via policyId lookup (W2-B)', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ sourceTable: 'TokenPolicyVersion', sourceId: 'tpv_1', recordType: 'policy_version' }),
    );
    prisma.tokenPolicyVersion.findUnique.mockResolvedValue(policyVersionRow());
    // The version row has no communityId column: it is resolved by reading the
    // owning CommunityTokenPolicy by policyId.
    prisma.communityTokenPolicy.findUnique.mockResolvedValue({ communityId: 'com_9' });
    const res = await makeService(prisma).getWithSource('pr_1');
    expect(prisma.tokenPolicyVersion.findUnique).toHaveBeenCalledWith({ where: { id: 'tpv_1' } });
    expect(prisma.communityTokenPolicy.findUnique).toHaveBeenCalledWith({ where: { id: 'pol_1' } });
    expect(res?.source.kind).toBe('policy_version');
    if (res?.source.kind === 'policy_version') {
      expect(res.source.policy.id).toBe('tpv_1');
      expect(res.source.policy.communityId).toBe('com_9');
      expect(res.source.policy.policyVersion).toBe(3);
      expect(res.source.policy.monthlyInflationRateBps).toBe(120);
      expect(res.source.policy.maxAdvanceRateBps).toBe(5000);
      expect(res.source.policy.memberMintCapRateBps).toBe(2000);
      expect(res.source.policy.effectiveEpoch).toBe(4);
    }
  });

  it('the mapped TokenPolicyVersion source builds a valid policy_version envelope (W2-B)', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ sourceTable: 'TokenPolicyVersion', sourceId: 'tpv_1', recordType: 'policy_version' }),
    );
    prisma.tokenPolicyVersion.findUnique.mockResolvedValue(policyVersionRow());
    prisma.communityTokenPolicy.findUnique.mockResolvedValue({ communityId: 'com_9' });
    const res = await makeService(prisma).getWithSource('pr_1');
    expect(res).not.toBeNull();
    // Shape must satisfy buildPolicyPayload's expectations end-to-end.
    const built = buildEnvelopeForSource(res!.source, 'test-pepper');
    expect(built.recordType).toBe('policy_version');
    expect(built.envelope.type).toBe('policy_version');
  });

  it('TokenPolicyVersion -> TerminalError(SOURCE_NOT_FOUND) when the version row is missing (W2-B)', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ sourceTable: 'TokenPolicyVersion', sourceId: 'tpv_x', recordType: 'policy_version' }),
    );
    prisma.tokenPolicyVersion.findUnique.mockResolvedValue(null);
    let caught: TerminalError | undefined;
    try {
      await makeService(prisma).getWithSource('pr_1');
    } catch (e: unknown) {
      caught = e as TerminalError;
    }
    expect(caught).toBeInstanceOf(TerminalError);
    expect(caught?.message).toContain('SOURCE_NOT_FOUND');
  });

  it('missing source row -> TerminalError(SOURCE_NOT_FOUND)', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(prRow({ sourceTable: 'TokenMintEvent' }));
    prisma.tokenMintEvent.findUnique.mockResolvedValue(null);
    let caught: TerminalError | undefined;
    try {
      await makeService(prisma).getWithSource('pr_1');
    } catch (e: unknown) {
      caught = e as TerminalError;
    }
    expect(caught).toBeInstanceOf(TerminalError);
    expect(caught?.message).toContain('SOURCE_NOT_FOUND');
  });
});

describe('createPendingRecord — inside a business transaction', () => {
  it('creates via the passed-in tx client, not deps.prisma', async () => {
    const prisma = makePrisma();
    const create = vi.fn().mockResolvedValue(prRow({ status: 'pending' }));
    const tx = { publicRecord: { create } } as unknown as PrismaTx;
    const dto = await makeService(prisma).createPendingRecord(tx, {
      recordType: 'token_mint',
      sourceTable: 'TokenMintEvent',
      sourceId: 'tme_1',
      communityId: 'com_1',
      envelope: ENVELOPE,
      recordHash: HASH_A,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(prisma.publicRecord.create).not.toHaveBeenCalled();
    const data = create.mock.calls[0][0].data;
    expect(data.status).toBe('pending');
    expect(data.recordHash).toBe(HASH_A);
    expect(typeof data.envelopeJson).toBe('string');
    expect(data.envelopeJson).toContain('youfen.record.v1');
    expect(dto.status).toBe('pending');
  });

  it('persists the canonical preimage as envelopeJson so keccak256 matches recordHash', async () => {
    const prisma = makePrisma();
    // A canonicalization-sensitive envelope: keys are in insertion order
    // (schema, type, payload) while the canonical form sorts to payload, schema,
    // type. Plain JSON.stringify would produce a non-canonical string.
    const envelope: RecordEnvelope = {
      schema: 'youfen.record.v1',
      type: 'advance_mint',
      payload: { amount: 1200, mintEventId: 'tme_9', activationEpoch: 7 },
    };
    const recordHash = computeRecordHash(envelope);
    const create = vi.fn().mockResolvedValue(prRow({ status: 'pending' }));
    const tx = { publicRecord: { create } } as unknown as PrismaTx;
    await makeService(prisma).createPendingRecord(tx, {
      recordType: 'advance_mint',
      sourceTable: 'TokenMintEvent',
      sourceId: 'tme_9',
      communityId: 'com_1',
      envelope,
      recordHash,
    });
    const stored = create.mock.calls[0][0].data.envelopeJson as string;
    // The stored string must be the exact canonical preimage, not JSON.stringify.
    expect(stored).toBe(canonicalize(envelope));
    expect(stored).not.toBe(JSON.stringify(envelope));
    // A third party keccak256-ing canonicalPayload must reproduce recordHash.
    expect(keccak256(toUtf8Bytes(stored))).toBe(recordHash);
  });

  it('maps a P2002 unique violation to TerminalError(DUPLICATE_RECORD_HASH)', async () => {
    const prisma = makePrisma();
    const create = vi.fn().mockRejectedValue({ code: 'P2002' });
    const tx = { publicRecord: { create } } as unknown as PrismaTx;
    let caught: TerminalError | undefined;
    try {
      await makeService(prisma).createPendingRecord(tx, {
        recordType: 'token_mint',
        sourceTable: 'TokenMintEvent',
        sourceId: 'tme_1',
        communityId: 'com_1',
        envelope: ENVELOPE,
        recordHash: HASH_A,
      });
    } catch (e: unknown) {
      caught = e as TerminalError;
    }
    expect(caught).toBeInstanceOf(TerminalError);
    expect(caught?.message).toContain('DUPLICATE_RECORD_HASH');
  });

  it('rethrows non-unique errors untouched', async () => {
    const prisma = makePrisma();
    const create = vi.fn().mockRejectedValue(new Error('connection reset'));
    const tx = { publicRecord: { create } } as unknown as PrismaTx;
    await expect(
      makeService(prisma).createPendingRecord(tx, {
        recordType: 'token_mint',
        sourceTable: 'TokenMintEvent',
        sourceId: 'tme_1',
        communityId: 'com_1',
        envelope: ENVELOPE,
        recordHash: HASH_A,
      }),
    ).rejects.toThrow('connection reset');
  });
});

describe('chainEligible guard (W2-B)', () => {
  it('createPendingRecord persists an explicit chainEligible=false', async () => {
    const prisma = makePrisma();
    const create = vi.fn().mockResolvedValue(prRow({ status: 'pending', chainEligible: false }));
    const tx = { publicRecord: { create } } as unknown as PrismaTx;
    const dto = await makeService(prisma).createPendingRecord(tx, {
      recordType: 'epoch_summary',
      sourceTable: 'TokenEpoch',
      sourceId: 'epo_1',
      communityId: 'com_1',
      envelope: ENVELOPE,
      recordHash: HASH_A,
      chainEligible: false,
    });
    expect(create.mock.calls[0][0].data.chainEligible).toBe(false);
    expect(dto.chainEligible).toBe(false);
  });

  it('createPendingRecord defaults chainEligible to true when omitted', async () => {
    const prisma = makePrisma();
    const create = vi.fn().mockResolvedValue(prRow({ status: 'pending' }));
    const tx = { publicRecord: { create } } as unknown as PrismaTx;
    await makeService(prisma).createPendingRecord(tx, {
      recordType: 'token_mint',
      sourceTable: 'TokenMintEvent',
      sourceId: 'tme_1',
      communityId: 'com_1',
      envelope: ENVELOPE,
      recordHash: HASH_A,
    });
    expect(create.mock.calls[0][0].data.chainEligible).toBe(true);
  });

  it('rowToDto reads a missing chainEligible column as true', async () => {
    const prisma = makePrisma();
    const rowNoCol = { ...prRow({ status: 'pending' }) } as unknown as Record<string, unknown>;
    delete rowNoCol.chainEligible;
    prisma.publicRecord.findUnique.mockResolvedValue(rowNoCol);
    const dto = await makeService(prisma).getById('pr_1');
    expect(dto?.chainEligible).toBe(true);
  });

  it('requestSubmission refuses to enqueue a DB-only (chainEligible=false) record', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ status: 'pending', chainEligible: false }),
    );
    const enqueue = vi.fn();
    let caught: InvalidStatusError | undefined;
    try {
      await makeService(prisma, enqueue).requestSubmission('pr_1');
    } catch (e: unknown) {
      caught = e as InvalidStatusError;
    }
    expect(caught).toBeInstanceOf(InvalidStatusError);
    expect(caught?.message).toContain('DB-only');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('requestSubmission still enqueues a chainEligible (default true) pending record', async () => {
    const prisma = makePrisma();
    prisma.publicRecord.findUnique.mockResolvedValue(
      prRow({ status: 'pending', attemptEpoch: 2 }),
    );
    const enqueue = vi.fn().mockResolvedValue({ queued: true, jobId: 'submit:pr_1:v2' });
    const res = await makeService(prisma, enqueue).requestSubmission('pr_1');
    expect(res).toEqual({ queued: true, jobId: 'submit:pr_1:v2' });
    expect(enqueue).toHaveBeenCalledWith({ id: 'pr_1', attemptEpoch: 2 });
  });
});
