// Frozen cross-task contract types for the blockchain layer.
// Pure types only: every declaration here is erased at compile time, so this
// file never emits runtime code and is never imported at runtime. All amounts
// are bigint; all timestamps entering payloads are Unix seconds (see hashing).

import type { Prisma } from '@prisma/client';

// ---- Primitives (BLOCKCHAIN-DESIGN §3) ----

/** A lowercase 0x-prefixed 32-byte hex string (66 chars total). */
export type Hex32 = `0x${string}`;

export type RecordType =
  | 'token_mint'
  | 'advance_mint'
  | 'token_reversal'
  | 'epoch_summary'
  | 'policy_version'
  | 'proposal_snapshot'
  | 'proposal_result';

export type VerificationStatus =
  | 'pending'
  | 'submitting'
  | 'confirming'
  | 'verified'
  | 'failed'
  | 'superseded';

/** Canonical payload envelope — the exact preimage that gets hashed. */
export interface RecordEnvelope {
  readonly schema: 'youfen.record.v1';
  readonly type: RecordType;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

export interface SubmitResult {
  readonly txHash: string;
  readonly nonce: number;
  readonly submittedAt: Date;
}

export interface ConfirmResult {
  readonly status: 'confirmed' | 'reverted';
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly confirmedAt: Date;
}

export interface ChainRecordMeta {
  readonly exists: boolean;
  readonly recordType?: number;
  readonly blockNumber?: number;
  readonly timestamp?: number;
}

export interface VerifyResult {
  readonly verified: boolean;
  readonly hashMatches: boolean;
  readonly onChain: boolean;
  readonly computedHash: Hex32;
  readonly storedHash: Hex32;
  readonly txHash?: string;
  readonly blockNumber?: number;
  readonly explorerUrl?: string;
  readonly failureReason?: string;
}

/** Minimal record view needed to submit; assembled from the DB. */
export interface SubmittableRecord {
  readonly recordId: string;
  readonly recordType: RecordType;
  readonly recordHash: Hex32;
  readonly chainArgs: readonly (Hex32 | bigint | number)[];
}

// ---- Pure-function layer (BLOCKCHAIN-DESIGN §3) ----

export interface RecordHasher {
  canonicalize(envelope: RecordEnvelope): string;
  computeRecordHash(envelope: RecordEnvelope): Hex32;
  hashCommunityId(communityId: string): Hex32;
  hashMemberId(communityId: string, memberId: string): Hex32;
}

export interface PayloadBuilder {
  build(source: RecordSource): {
    envelope: RecordEnvelope;
    chainArgs: SubmittableRecord['chainArgs'];
  };
}

// ---- Chain-interaction layer (BLOCKCHAIN-DESIGN §3) ----

export interface TxSubmitter {
  submitRecord(record: SubmittableRecord, nonce: number): Promise<SubmitResult>;
  resyncNonce(): Promise<number>;
}

export interface TxConfirmer {
  waitForConfirmation(
    txHash: string,
    // Additive (W2-B): `recordHash` is optional so every pre-existing caller
    // stays byte-identical. When supplied together with a confirmer wired with
    // a readRecord probe it arms the null-receipt fast path (a load-balanced RPC
    // whose receipt index lags getLogs): after N consecutive null receipts the
    // confirmer consults the contract's getRecord existence instead.
    opts?: { confirmations?: number; timeoutMs?: number; recordHash?: Hex32 },
  ): Promise<ConfirmResult>;
  getTransactionStatus(
    txHash: string,
  ): Promise<'pending' | 'confirmed' | 'reverted' | 'not_found'>;
  findTxByRecordHash(
    recordHash: Hex32,
  ): Promise<{ txHash: string; blockNumber: number } | null>;
}

export interface RecordVerifier {
  readChainRecord(recordHash: Hex32): Promise<ChainRecordMeta>;
  verifyRecord(recordId: string): Promise<VerifyResult>;
}

/** Facade — API/workers depend only on this. */
export interface InjectiveService {
  readonly submitter: TxSubmitter;
  readonly confirmer: TxConfirmer;
  readonly verifier: RecordVerifier;
  readonly hasher: RecordHasher;
}

// ---- DB record view + source entities (plan extensions of §3) ----

/** Read view of a PublicRecord row, decoupled from the Prisma model shape. */
export interface PublicRecordDTO {
  readonly id: string;
  readonly communityId: string;
  readonly sourceTable: string;
  readonly sourceId: string;
  readonly recordType: RecordType;
  readonly status: VerificationStatus;
  readonly envelopeJson: string;
  readonly recordHash: Hex32;
  readonly txHash: string | null;
  readonly assignedNonce: number | null;
  readonly blockNumber: number | null;
  readonly blockHash: string | null;
  readonly submittedAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly attemptEpoch: number;
  readonly lastError: string | null;
  readonly supersededByRecordId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /**
   * Additive-only (W2-B). DB-only records (epoch_budget_created / budget_advance
   * / advance_debt_repayment / inflation_rate_change / proposal_created) set this
   * false: they are terminal on creation, never enqueued, never scanned by the
   * reconciler. Optional so pre-existing rows/DTOs stay shape-compatible; a row
   * lacking the column reads as true (chain-mirrored, the default).
   */
  readonly chainEligible?: boolean;
}

export interface TokenMintEventData {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: string;
  readonly epochNumber: number;
  readonly mintType: string;
  readonly budgetSource: 'current_epoch' | 'next_epoch_advance';
  readonly amount: bigint;
  readonly memberBalanceBefore: bigint;
  readonly memberBalanceAfter: bigint;
  readonly totalSupplyBefore: bigint;
  readonly totalSupplyAfter: bigint;
  readonly governanceActivationEpoch: number | null;
  readonly tokenPolicyVersion: number;
  readonly createdAt: Date;
  /**
   * Additive-only extension (frozen-contract rule): community-scoped, strictly
   * increasing ledger sequence assigned inside the DB transaction. Feeds the
   * contract's ledgerSeq guard (see YouFenRecords invariant 6). Optional so
   * pre-existing sources/vectors remain byte-identical; when present it enters
   * both the canonical payload and chainArgs.
   */
  readonly ledgerSeq?: number;
}

export interface TokenReversalEventData {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: string;
  readonly originalMintEventId: string;
  readonly amount: bigint;
  readonly totalBalanceAfter: bigint;
  readonly totalSupplyAfter: bigint;
  readonly createdAt: Date;
  /** Additive-only ledger-sequence guard input; see TokenMintEventData.ledgerSeq. */
  readonly ledgerSeq?: number;
}

export interface TokenEpochData {
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

export interface TokenPolicyData {
  readonly id: string;
  readonly communityId: string;
  readonly policyVersion: number;
  readonly monthlyInflationRateBps: number;
  readonly maxAdvanceRateBps: number;
  readonly memberMintCapRateBps: number;
  readonly effectiveEpoch: number;
  readonly createdAt: Date;
}

export interface ProposalData {
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
  readonly createdAt: Date;
  /**
   * Additive-only extension (frozen-contract rule, T3): Merkle root over the
   * per-member snapshot leaf set (leaf = keccak256(abi.encodePacked(memberIdHash,
   * weight)); see hashing/merkle.ts). Lets any member self-prove their frozen
   * voting weight was included. Optional so pre-existing snapshot vectors stay
   * byte-identical; when present it enters both the canonical payload and
   * chainArgs (as the last arg before recordHash, matching the contract).
   */
  readonly weightsMerkleRoot?: Hex32;
  /**
   * Additive-only extension (frozen-contract rule, T3): Merkle root over the
   * per-vote leaf set (leaf = keccak256(abi.encodePacked(memberIdHash,
   * optionIdHash, weight)); see hashing/merkle.ts). Lets any voter self-prove
   * their counted ballot entered the tally. Optional; same additive semantics
   * as weightsMerkleRoot but for the proposal_result record.
   */
  readonly votesMerkleRoot?: Hex32;
}

/** Tagged union of every buildable record source. */
export type RecordSource =
  | { readonly kind: 'token_mint' | 'advance_mint'; readonly mintEvent: TokenMintEventData }
  | {
      readonly kind: 'token_reversal';
      readonly reversalEvent: TokenReversalEventData;
      readonly originalRecordHash: Hex32;
    }
  | { readonly kind: 'epoch_summary'; readonly epoch: TokenEpochData }
  | { readonly kind: 'policy_version'; readonly policy: TokenPolicyData }
  | {
      readonly kind: 'proposal_snapshot' | 'proposal_result';
      readonly proposal: ProposalData;
    };

/** Output of building an envelope from a source: preimage + hash + chain args. */
export interface BuiltRecord {
  readonly recordType: RecordType;
  readonly envelope: RecordEnvelope;
  readonly canonicalJson: string;
  readonly recordHash: Hex32;
  readonly chainArgs: SubmittableRecord['chainArgs'];
}

export type BuildEnvelopeFn = (source: RecordSource, pepper: string) => BuiltRecord;

/** queued=false means BullMQ de-duplicated an existing job with the same id. */
export type EnqueueFn = (
  record: { readonly id: string; readonly attemptEpoch: number },
) => Promise<{ queued: boolean; jobId: string }>;

/** Field patch for same-status persistence and transition side effects. */
export type RecordPatch = Partial<{
  txHash: string;
  assignedNonce: number;
  blockNumber: number;
  blockHash: string;
  submittedAt: Date;
  confirmedAt: Date;
  attemptEpoch: number;
  lastError: string | null;
  supersededByRecordId: string;
}>;

export interface ReconcileReport {
  readonly scanned: number;
  readonly recovered: number;
  readonly requeued: number;
  readonly failed: number;
  readonly untouched: number;
}

export interface Reconciler {
  reconcileOnce(now?: Date): Promise<ReconcileReport>;
}

export interface PublicRecordWithSource {
  readonly record: PublicRecordDTO;
  readonly source: RecordSource;
}

/** Prisma interactive-transaction client used inside business transactions. */
export type PrismaTx = Prisma.TransactionClient;

export interface PublicRecordService {
  createPendingRecord(
    tx: PrismaTx,
    input: {
      recordType: RecordType;
      sourceTable: string;
      sourceId: string;
      communityId: string;
      envelope: RecordEnvelope;
      recordHash: Hex32;
      /**
       * Additive-only (W2-B). false marks a DB-only record (terminal, never
       * enqueued/scanned). Omitted/undefined defaults to true (chain-mirrored).
       */
      chainEligible?: boolean;
    },
  ): Promise<PublicRecordDTO>;
  requestSubmission(recordId: string): Promise<{ queued: boolean; jobId: string }>;
  getById(recordId: string): Promise<PublicRecordDTO | null>;
  getWithSource(recordId: string): Promise<PublicRecordWithSource | null>;
  /** Conditional UPDATE across the state machine; 0 rows -> false (lost race). */
  transition(
    recordId: string,
    from: readonly VerificationStatus[],
    to: VerificationStatus,
    patch?: RecordPatch,
  ): Promise<boolean>;
  /**
   * Same-status field patch (e.g. persisting assignedNonce). Conditional UPDATE
   * on id + status; bypasses state-machine validation; 0 rows -> false.
   */
  patchInStatus(
    recordId: string,
    status: VerificationStatus,
    patch: RecordPatch,
  ): Promise<boolean>;
  markSuperseded(originalRecordId: string, supersededByRecordId: string): Promise<void>;
}

// ---- Config + runtime composition (plan extensions) ----

export interface BlockchainConfig {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly contractAddress: string;
  readonly privateKey: string;
  readonly pepper: string;
  readonly confirmations: number;
  readonly explorerBaseUrl: string;
  readonly contractDeployBlock: number;
  readonly redisUrl: string;
  readonly internalApiToken: string;
}

export interface BlockchainRuntime {
  readonly config: BlockchainConfig;
  readonly injective: InjectiveService;
  readonly records: PublicRecordService;
  readonly reconciler: Reconciler;
  readonly enqueueRecordSubmission: EnqueueFn;
}
