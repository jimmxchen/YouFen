// PublicRecordService (BLOCKCHAIN-DESIGN §5, PRD §26). Every state change is a
// conditional UPDATE (WHERE id + status IN (from...)) so a lost concurrency race
// simply matches 0 rows and returns false. Same-status field patches (e.g. the
// assignedNonce persisted before broadcast) bypass the state machine via
// patchInStatus. All amounts stay bigint; timestamps are Date columns.

import { InvalidStatusError, RecordNotFoundError, TerminalError } from '../errors';
import { canonicalize } from '../hashing/canonicalize';
import type {
  EnqueueFn,
  Hex32,
  ProposalData,
  PublicRecordDTO,
  PublicRecordService,
  PublicRecordWithSource,
  RecordEnvelope,
  RecordPatch,
  RecordSource,
  RecordType,
  TokenEpochData,
  TokenMintEventData,
  TokenPolicyData,
  TokenReversalEventData,
  VerificationStatus,
  PrismaTx,
} from '../types';

import { assertTransition } from './state-machine';

// ---- Local structural Prisma view (compatible with PrismaClient/TransactionClient) ----

/** Read/write surface of the PublicRecord delegate the service depends on. */
interface PublicRecordDelegate {
  create(args: { data: PublicRecordCreateData }): Promise<unknown>;
  findUnique(args: { where: { id: string } }): Promise<unknown>;
  findMany(args: { where: { sourceTable: string; sourceId: string } }): Promise<unknown>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
}

/** A findUnique-by-id delegate — enough to load a single source row. */
interface FindUniqueByIdDelegate {
  findUnique(args: { where: { id: string } }): Promise<unknown>;
}

/** Minimal Prisma structural type this service reads from. */
export interface PrismaLike {
  readonly publicRecord: PublicRecordDelegate;
  readonly tokenMintEvent: FindUniqueByIdDelegate;
  readonly tokenReversalEvent: FindUniqueByIdDelegate;
  readonly tokenEpoch: FindUniqueByIdDelegate;
  readonly communityTokenPolicy: FindUniqueByIdDelegate;
  readonly tokenPolicyVersion: FindUniqueByIdDelegate;
  readonly proposal: FindUniqueByIdDelegate;
}

interface PublicRecordCreateData {
  readonly communityId: string;
  readonly recordType: RecordType;
  readonly status: VerificationStatus;
  readonly envelopeJson: string;
  readonly recordHash: string;
  readonly sourceTable: string;
  readonly sourceId: string;
  // Additive (W2-B): DB-only records persist false; chain-mirrored default true.
  readonly chainEligible: boolean;
}

// ---- Raw row shapes (the trimmed columns each mapper reads) ----

interface PublicRecordRow {
  readonly id: string;
  readonly communityId: string;
  readonly recordType: string;
  readonly status: string;
  readonly envelopeJson: string;
  readonly recordHash: string;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly txHash: string | null;
  readonly assignedNonce: number | null;
  readonly blockNumber: number | null;
  readonly blockHash: string | null;
  readonly submittedAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly attemptEpoch: number;
  readonly lastError: string | null;
  readonly supersededByRecordId: string | null;
  // Additive (W2-B); a row predating the column reads as true via rowToDto.
  readonly chainEligible?: boolean | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface MintRaw {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: string;
  readonly epochNumber: number;
  readonly mintType: string;
  readonly budgetSource: string;
  readonly amount: bigint;
  readonly memberBalanceBefore: bigint;
  readonly memberBalanceAfter: bigint;
  readonly totalSupplyBefore: bigint;
  readonly totalSupplyAfter: bigint;
  readonly governanceActivationEpoch: number | null;
  readonly tokenPolicyVersion: number;
  readonly createdAt: Date;
  // Additive ledger-sequence guard input; undefined when the source predates it.
  readonly ledgerSeq?: number | null;
}

interface ReversalRaw {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: string;
  readonly originalMintEventId: string;
  readonly amount: bigint;
  readonly totalBalanceAfter: bigint;
  readonly totalSupplyAfter: bigint;
  readonly createdAt: Date;
  // Additive ledger-sequence guard input; undefined when the source predates it.
  readonly ledgerSeq?: number | null;
}

interface EpochRaw {
  readonly id: string;
  readonly communityId: string;
  readonly epochNumber: number;
  readonly openingSupply: bigint;
  readonly baseMintBudget: bigint;
  readonly regularMintedAmount: bigint;
  readonly advancedMintedAmount: bigint;
  readonly advanceDebtFromPreviousEpoch: bigint;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
}

interface PolicyRaw {
  readonly id: string;
  readonly communityId: string;
  readonly policyVersion: number;
  readonly monthlyInflationRateBps: number;
  readonly maxAdvanceRateBps: number;
  readonly memberMintCapRateBps: number;
  readonly effectiveEpoch: number;
  readonly createdAt: Date;
}

/**
 * Append-only policy version ledger row (W2-B). It carries no communityId column
 * (that lives on the owning CommunityTokenPolicy) so resolveSource reverse-looks
 * it up by policyId. Field names map onto TokenPolicyData for buildPolicyPayload.
 */
interface PolicyVersionRaw {
  readonly id: string;
  readonly policyId: string;
  readonly version: number;
  readonly effectiveEpoch: number;
  readonly monthlyInflationRateBps: number;
  readonly maxAdvanceRateBps: number;
  readonly memberMintCapRateBps: number;
  readonly createdAt: Date;
}

interface ProposalRaw {
  readonly id: string;
  readonly communityId: string;
  readonly epochNumberSnapshot: number | null;
  readonly totalSupplySnapshot: bigint | null;
  readonly activeGovernanceSupplySnapshot: bigint | null;
  readonly tokenPolicyVersionSnapshot: number | null;
  readonly snapshotAt: Date | null;
  readonly endedAt: Date | null;
  readonly winningOptionId: string | null;
  readonly voterCount: number | null;
  readonly totalVoteWeight: bigint | null;
  // Merkle 根源列（activate/settle 时由引擎持久化）；旧行可能为 null。
  readonly weightsMerkleRoot?: string | null;
  readonly votesMerkleRoot?: string | null;
  readonly createdAt: Date;
}

// ---- Patch whitelist ----

/** Only these RecordPatch fields may reach the DB; unknown keys are dropped. */
const PATCHABLE_FIELDS: readonly (keyof RecordPatch)[] = [
  'txHash',
  'assignedNonce',
  'blockNumber',
  'blockHash',
  'submittedAt',
  'confirmedAt',
  'attemptEpoch',
  'lastError',
  'supersededByRecordId',
];

/** Copy only whitelisted keys into a fresh object (drops injected/unknown keys). */
function sanitizePatch(patch?: RecordPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!patch) {
    return out;
  }
  const source = patch as Record<string, unknown>;
  for (const key of PATCHABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      out[key] = source[key];
    }
  }
  return out;
}

// ---- Row -> DTO / source mappers ----

function rowToDto(row: PublicRecordRow): PublicRecordDTO {
  return {
    id: row.id,
    communityId: row.communityId,
    sourceTable: row.sourceTable,
    sourceId: row.sourceId,
    recordType: row.recordType as RecordType,
    status: row.status as VerificationStatus,
    envelopeJson: row.envelopeJson,
    recordHash: row.recordHash as Hex32,
    txHash: row.txHash,
    assignedNonce: row.assignedNonce,
    blockNumber: row.blockNumber,
    blockHash: row.blockHash,
    submittedAt: row.submittedAt,
    confirmedAt: row.confirmedAt,
    attemptEpoch: row.attemptEpoch,
    lastError: row.lastError,
    supersededByRecordId: row.supersededByRecordId,
    // A row lacking the column (pre-migration) reads as chain-mirrored (true).
    chainEligible: row.chainEligible ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMint(r: MintRaw): TokenMintEventData {
  return {
    id: r.id,
    communityId: r.communityId,
    memberId: r.memberId,
    epochNumber: r.epochNumber,
    mintType: r.mintType,
    budgetSource: r.budgetSource as 'current_epoch' | 'next_epoch_advance',
    amount: r.amount,
    memberBalanceBefore: r.memberBalanceBefore,
    memberBalanceAfter: r.memberBalanceAfter,
    totalSupplyBefore: r.totalSupplyBefore,
    totalSupplyAfter: r.totalSupplyAfter,
    governanceActivationEpoch: r.governanceActivationEpoch,
    tokenPolicyVersion: r.tokenPolicyVersion,
    createdAt: r.createdAt,
    // Preserve the ledger sequence when the source carries one (null -> omit).
    ...(r.ledgerSeq != null ? { ledgerSeq: r.ledgerSeq } : {}),
  };
}

function mapReversal(r: ReversalRaw): TokenReversalEventData {
  return {
    id: r.id,
    communityId: r.communityId,
    memberId: r.memberId,
    originalMintEventId: r.originalMintEventId,
    amount: r.amount,
    totalBalanceAfter: r.totalBalanceAfter,
    totalSupplyAfter: r.totalSupplyAfter,
    createdAt: r.createdAt,
    // Preserve the ledger sequence when the source carries one (null -> omit).
    ...(r.ledgerSeq != null ? { ledgerSeq: r.ledgerSeq } : {}),
  };
}

function mapEpoch(r: EpochRaw): TokenEpochData {
  return {
    id: r.id,
    communityId: r.communityId,
    epochNumber: r.epochNumber,
    openingSupply: r.openingSupply,
    baseMintBudget: r.baseMintBudget,
    regularMintedAmount: r.regularMintedAmount,
    advancedMintedAmount: r.advancedMintedAmount,
    advanceDebtFromPreviousEpoch: r.advanceDebtFromPreviousEpoch,
    closedAt: r.closedAt,
    createdAt: r.createdAt,
  };
}

function mapPolicy(r: PolicyRaw): TokenPolicyData {
  return {
    id: r.id,
    communityId: r.communityId,
    policyVersion: r.policyVersion,
    monthlyInflationRateBps: r.monthlyInflationRateBps,
    maxAdvanceRateBps: r.maxAdvanceRateBps,
    memberMintCapRateBps: r.memberMintCapRateBps,
    effectiveEpoch: r.effectiveEpoch,
    createdAt: r.createdAt,
  };
}

function mapPolicyVersion(r: PolicyVersionRaw, communityId: string): TokenPolicyData {
  return {
    id: r.id,
    communityId,
    policyVersion: r.version,
    monthlyInflationRateBps: r.monthlyInflationRateBps,
    maxAdvanceRateBps: r.maxAdvanceRateBps,
    memberMintCapRateBps: r.memberMintCapRateBps,
    effectiveEpoch: r.effectiveEpoch,
    createdAt: r.createdAt,
  };
}

function mapProposal(r: ProposalRaw): ProposalData {
  return {
    id: r.id,
    communityId: r.communityId,
    epochNumberSnapshot: r.epochNumberSnapshot,
    totalSupplySnapshot: r.totalSupplySnapshot,
    activeGovernanceSupplySnapshot: r.activeGovernanceSupplySnapshot,
    tokenPolicyVersionSnapshot: r.tokenPolicyVersionSnapshot,
    snapshotAt: r.snapshotAt,
    endedAt: r.endedAt,
    winningOptionId: r.winningOptionId,
    voterCount: r.voterCount,
    totalVoteWeight: r.totalVoteWeight,
    createdAt: r.createdAt,
    // Merkle 根必须从源行透传：缺失会使重建信封少字段 → RECORD_HASH_MISMATCH
    // 终态失败（真链集成实测）。无根的旧记录按 additive 原则省略键，哈希不变。
    ...(r.weightsMerkleRoot != null ? { weightsMerkleRoot: r.weightsMerkleRoot as Hex32 } : {}),
    ...(r.votesMerkleRoot != null ? { votesMerkleRoot: r.votesMerkleRoot as Hex32 } : {}),
  };
}

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: unknown }).code === 'P2002'
  );
}

// ---- Service factory ----

export function createPublicRecordService(deps: {
  prisma: PrismaLike;
  enqueue: EnqueueFn;
}): PublicRecordService {
  const { prisma, enqueue } = deps;

  async function getById(recordId: string): Promise<PublicRecordDTO | null> {
    const row = (await prisma.publicRecord.findUnique({
      where: { id: recordId },
    })) as PublicRecordRow | null;
    return row ? rowToDto(row) : null;
  }

  async function resolveSource(record: PublicRecordDTO): Promise<RecordSource> {
    switch (record.sourceTable) {
      case 'TokenMintEvent': {
        const raw = (await prisma.tokenMintEvent.findUnique({
          where: { id: record.sourceId },
        })) as MintRaw | null;
        if (!raw) {
          throw new TerminalError(`SOURCE_NOT_FOUND: TokenMintEvent ${record.sourceId}`);
        }
        const kind = record.recordType === 'advance_mint' ? 'advance_mint' : 'token_mint';
        return { kind, mintEvent: mapMint(raw) };
      }
      case 'TokenReversalEvent': {
        const raw = (await prisma.tokenReversalEvent.findUnique({
          where: { id: record.sourceId },
        })) as ReversalRaw | null;
        if (!raw) {
          throw new TerminalError(`SOURCE_NOT_FOUND: TokenReversalEvent ${record.sourceId}`);
        }
        const originals = (await prisma.publicRecord.findMany({
          where: { sourceTable: 'TokenMintEvent', sourceId: raw.originalMintEventId },
        })) as PublicRecordRow[];
        const original = originals[0];
        if (!original) {
          throw new TerminalError(`ORIGINAL_RECORD_MISSING: ${raw.originalMintEventId}`);
        }
        return {
          kind: 'token_reversal',
          reversalEvent: mapReversal(raw),
          originalRecordHash: original.recordHash as Hex32,
        };
      }
      case 'TokenEpoch': {
        const raw = (await prisma.tokenEpoch.findUnique({
          where: { id: record.sourceId },
        })) as EpochRaw | null;
        if (!raw) {
          throw new TerminalError(`SOURCE_NOT_FOUND: TokenEpoch ${record.sourceId}`);
        }
        return { kind: 'epoch_summary', epoch: mapEpoch(raw) };
      }
      case 'CommunityTokenPolicy': {
        const raw = (await prisma.communityTokenPolicy.findUnique({
          where: { id: record.sourceId },
        })) as PolicyRaw | null;
        if (!raw) {
          throw new TerminalError(`SOURCE_NOT_FOUND: CommunityTokenPolicy ${record.sourceId}`);
        }
        return { kind: 'policy_version', policy: mapPolicy(raw) };
      }
      case 'TokenPolicyVersion': {
        // Append-only policy version ledger (W3-6 records policy_version with
        // sourceTable='TokenPolicyVersion'). The version row carries no
        // communityId column, so resolve it via the owning CommunityTokenPolicy.
        const raw = (await prisma.tokenPolicyVersion.findUnique({
          where: { id: record.sourceId },
        })) as PolicyVersionRaw | null;
        if (!raw) {
          throw new TerminalError(`SOURCE_NOT_FOUND: TokenPolicyVersion ${record.sourceId}`);
        }
        const owner = (await prisma.communityTokenPolicy.findUnique({
          where: { id: raw.policyId },
        })) as { communityId: string } | null;
        if (!owner) {
          throw new TerminalError(`SOURCE_NOT_FOUND: CommunityTokenPolicy ${raw.policyId}`);
        }
        return {
          kind: 'policy_version',
          policy: mapPolicyVersion(raw, owner.communityId),
        };
      }
      case 'Proposal': {
        const raw = (await prisma.proposal.findUnique({
          where: { id: record.sourceId },
        })) as ProposalRaw | null;
        if (!raw) {
          throw new TerminalError(`SOURCE_NOT_FOUND: Proposal ${record.sourceId}`);
        }
        const kind =
          record.recordType === 'proposal_result' ? 'proposal_result' : 'proposal_snapshot';
        return { kind, proposal: mapProposal(raw) };
      }
      default:
        throw new TerminalError(`SOURCE_NOT_FOUND: unknown sourceTable '${record.sourceTable}'`);
    }
  }

  async function transition(
    recordId: string,
    from: readonly VerificationStatus[],
    to: VerificationStatus,
    patch?: RecordPatch,
  ): Promise<boolean> {
    for (const state of from) {
      assertTransition(state, to);
    }
    const result = await prisma.publicRecord.updateMany({
      where: { id: recordId, status: { in: from } },
      data: { status: to, ...sanitizePatch(patch) },
    });
    return result.count > 0;
  }

  async function patchInStatus(
    recordId: string,
    status: VerificationStatus,
    patch: RecordPatch,
  ): Promise<boolean> {
    const result = await prisma.publicRecord.updateMany({
      where: { id: recordId, status },
      data: sanitizePatch(patch),
    });
    return result.count > 0;
  }

  async function createPendingRecord(
    tx: PrismaTx,
    input: {
      recordType: RecordType;
      sourceTable: string;
      sourceId: string;
      communityId: string;
      envelope: RecordEnvelope;
      recordHash: Hex32;
      chainEligible?: boolean;
    },
  ): Promise<PublicRecordDTO> {
    const data: PublicRecordCreateData = {
      communityId: input.communityId,
      recordType: input.recordType,
      status: 'pending',
      // Default true (chain-mirrored); DB-only callers pass false explicitly.
      chainEligible: input.chainEligible ?? true,
      // Store the canonical preimage — the exact string keccak256 hashes into
      // recordHash — so GET /api/public-records/:id can expose it as
      // canonicalPayload for third-party verification. Plain JSON.stringify
      // produces a different key order and never re-hashes to recordHash
      // (BLOCKCHAIN-DESIGN §2/§7).
      envelopeJson: canonicalize(input.envelope),
      recordHash: input.recordHash,
      sourceTable: input.sourceTable,
      sourceId: input.sourceId,
    };
    try {
      const row = await tx.publicRecord.create({ data });
      return rowToDto(row as PublicRecordRow);
    } catch (e: unknown) {
      if (isUniqueViolation(e)) {
        throw new TerminalError(`DUPLICATE_RECORD_HASH: ${input.recordHash}`);
      }
      throw e;
    }
  }

  async function requestSubmission(
    recordId: string,
  ): Promise<{ queued: boolean; jobId: string }> {
    const dto = await getById(recordId);
    if (!dto) {
      throw new RecordNotFoundError(`PublicRecord ${recordId} not found`);
    }
    if (dto.status !== 'pending') {
      throw new InvalidStatusError(
        `PublicRecord ${recordId} is '${dto.status}', expected 'pending'`,
      );
    }
    // W2-B guard: DB-only records (chainEligible=false) are terminal on creation
    // and must never enter the submit queue; refuse the enqueue up front.
    if (dto.chainEligible === false) {
      throw new InvalidStatusError(
        `PublicRecord ${recordId} is DB-only; refusing enqueue`,
      );
    }
    return enqueue({ id: dto.id, attemptEpoch: dto.attemptEpoch });
  }

  async function getWithSource(recordId: string): Promise<PublicRecordWithSource | null> {
    const row = (await prisma.publicRecord.findUnique({
      where: { id: recordId },
    })) as PublicRecordRow | null;
    if (!row) {
      return null;
    }
    const record = rowToDto(row);
    const source = await resolveSource(record);
    return { record, source };
  }

  async function markSuperseded(
    originalRecordId: string,
    supersededByRecordId: string,
  ): Promise<void> {
    const ok = await transition(originalRecordId, ['verified'], 'superseded', {
      supersededByRecordId,
    });
    if (!ok) {
      throw new InvalidStatusError(
        `PublicRecord ${originalRecordId} is not 'verified'; cannot supersede`,
      );
    }
  }

  return {
    createPendingRecord,
    requestSubmission,
    getById,
    getWithSource,
    transition,
    patchInStatus,
    markSuperseded,
  };
}
