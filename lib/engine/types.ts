// Engine cross-task type contract (frozen). Structural types only — this file
// never imports @prisma/client, so the engine layer stays decoupled from the
// generated client shape. Every amount/supply/balance is bigint; every ratio is
// integer bps. Downstream engine + API tasks conform to these signatures; after
// review this file is additive-only.
//
// The lone runtime export is REVERSAL_REASONS (a frozen tuple); everything else
// is erased at compile time.

import type { RecordSource } from '../blockchain/types';

/** A lowercase 0x-prefixed 32-byte hex string (66 chars total). */
export type Hex32 = `0x${string}`;

// ---- Canonical string-enum unions (align lib/blockchain/types.ts) ----

export type BudgetSource = 'current_epoch' | 'next_epoch_advance';

export type MintType =
  | 'contribution'
  | 'initial_allocation'
  | 'special_reward'
  | 'historical_correction';

export type GovernanceStatus = 'active' | 'pending';

export type ProposalType =
  | 'community_decision'
  | 'token_policy_change'
  | 'budget_advance'
  | 'special_mint'
  | 'related_party_mint'
  | 'token_reversal';

// ================================================================
// ① Structured row types (DB-shape-independent views)
// ================================================================

export interface EpochRow {
  readonly id: string;
  readonly communityId: string;
  readonly epochNumber: number;
  readonly openingSupply: bigint;
  readonly baseMintBudget: bigint;
  readonly advanceDebtFromPreviousEpoch: bigint;
  readonly effectiveRegularBudget: bigint;
  readonly maxAdvanceAmount: bigint;
  readonly regularMintedAmount: bigint;
  readonly advancedMintedAmount: bigint;
  readonly unusedRegularBudget: bigint;
  readonly inflationRateBps: number;
  readonly status: string;
  readonly startTime: Date | null;
  readonly endTime: Date | null;
}

/** Per-member token balances. Six bigint balance fields + identity columns. */
export interface BalanceRow {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: string;
  /** All tokens held by the member. */
  readonly totalBalance: bigint;
  /** Tokens whose governance rights are effective now. */
  readonly activeGovernanceBalance: bigint;
  /** Tokens minted this epoch whose governance activates next epoch. */
  readonly pendingGovernanceBalance: bigint;
  /** Tokens earned by this member in the current epoch (per-member cap tracking). */
  readonly tokensEarnedCurrentEpoch: bigint;
  /** Cumulative tokens earned by this member across all epochs. */
  readonly tokensEarnedLifetime: bigint;
  /** Cumulative amount reversed/burned from this member. */
  readonly tokensReversedLifetime: bigint;
}

export interface StateRow {
  readonly communityId: string;
  readonly currentTotalSupply: bigint;
  readonly ledgerSeq: bigint;
}

export interface MintEventRow {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: string;
  readonly epochId: string;
  readonly epochNumber: number;
  readonly mintType: string;
  readonly budgetSource: string;
  readonly amount: bigint;
  readonly governanceActivationEpoch: number | null;
  readonly governanceStatus: string;
  readonly memberBalanceBefore: bigint;
  readonly memberBalanceAfter: bigint;
  readonly totalSupplyBefore: bigint;
  readonly totalSupplyAfter: bigint;
  readonly tokenPolicyVersion: number;
  readonly reason: string;
  readonly approvedBy: string;
  /** Sourcing + idempotency link for advance-request-driven mints. */
  readonly advanceRequestId: string | null;
  readonly publicRecordId: string | null;
  readonly ledgerSeq: number | null;
  readonly createdAt: Date;
}

export interface PolicyRow {
  readonly communityId: string;
  readonly policyVersion: number;
  readonly rules: unknown;
  readonly monthlyInflationRateBps: number;
  readonly maxAdvanceRateBps: number;
  readonly memberMintCapRateBps: number;
  readonly epochDurationDays: number;
  readonly pendingPolicyVersionId: string | null;
  readonly pendingPolicyEffectiveEpoch: number | null;
}

// ================================================================
// ② EngineTx — raw SQL escape hatch + 15 loose model delegates
// ================================================================

/**
 * A Prisma-style model delegate with loose structural signatures. Args and
 * results are `unknown` on purpose: the fake (W2-A) and the real client both
 * satisfy this without pinning a per-model row shape here.
 */
export interface EngineDelegate {
  findUnique(args: unknown): Promise<unknown>;
  findFirst(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
  createMany(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  updateMany(args: unknown): Promise<unknown>;
}

/**
 * The transactional client handed to engine services. Business condition
 * UPDATEs / row locks / sequence allocation go through lib/engine/sql.ts,
 * db-locks.ts and ledger-seq.ts (the only files allowed to call $queryRaw /
 * $executeRaw); services never template-tag raw SQL directly.
 */
export interface EngineTx {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;

  readonly member: EngineDelegate;
  readonly community: EngineDelegate;
  readonly contribution: EngineDelegate;
  readonly tokenMintEvent: EngineDelegate;
  readonly tokenReversalEvent: EngineDelegate;
  readonly memberTokenBalance: EngineDelegate;
  readonly communityTokenState: EngineDelegate;
  readonly communityTokenPolicy: EngineDelegate;
  readonly tokenPolicyVersion: EngineDelegate;
  readonly tokenAdvanceRequest: EngineDelegate;
  readonly tokenEpoch: EngineDelegate;
  readonly proposal: EngineDelegate;
  readonly proposalMemberSnapshot: EngineDelegate;
  readonly vote: EngineDelegate;
  readonly publicRecord: EngineDelegate;
}

// ================================================================
// ③ EngineDb — interactive-transaction runner + tx surface
// ================================================================

export type EngineDb = {
  $transaction<T>(fn: (tx: EngineTx) => Promise<T>): Promise<T>;
} & EngineTx;

// ================================================================
// ④ RecordsPort — engine's view of the PublicRecord service
// ================================================================

export interface RecordsPort {
  createPendingRecord(
    tx: EngineTx,
    input: {
      recordType: string;
      sourceTable: string;
      sourceId: string;
      communityId: string;
      envelope: unknown;
      recordHash: Hex32;
    },
  ): Promise<{ id: string }>;
  requestSubmission(recordId: string): Promise<{ queued: boolean; jobId: string }>;
  markSuperseded(originalId: string, byId: string): Promise<void>;
  getById(id: string): Promise<{ id: string; status: string; recordHash: string } | null>;
}

// ================================================================
// ⑤ BuildEnvelopePort — canonical envelope + hash from a source
// ================================================================

export type BuildEnvelopePort = (source: RecordSource) => {
  envelope: unknown;
  recordHash: Hex32;
};

// ================================================================
// ⑥ PolicyActivationPort — flip a pending policy at epoch rollover
// ================================================================

export interface PolicyActivationPort {
  activatePendingVersion(
    tx: EngineTx,
    communityId: string,
    nextEpochNumber: number,
  ): Promise<{ monthlyInflationRateBps: number; chainRecordIds: string[] } | null>;
}

// ================================================================
// ⑦ HashPorts — pepper-bound / domain id hashers (2-arg each)
// ================================================================

export interface HashPorts {
  hashMemberId: (communityId: string, memberId: string) => Hex32;
  hashOptionId: (proposalId: string, optionId: string) => Hex32;
}

// ================================================================
// ⑧ EngineDeps — composed dependency bundle
// ================================================================

export interface EngineDeps {
  readonly db: EngineDb;
  readonly records: RecordsPort;
  readonly buildEnvelope: BuildEnvelopePort;
  readonly now?: () => Date;
}

// ================================================================
// ⑨ Service interfaces
// ================================================================

export interface MintOutcome {
  readonly mintEvents: ReadonlyArray<{
    id: string;
    amount: bigint;
    budgetSource: BudgetSource;
    governanceStatus: GovernanceStatus;
    publicRecordId: string | null;
  }>;
  readonly memberBalanceAfter: bigint;
  readonly totalSupplyAfter: bigint;
}

export interface MintService {
  mintForContribution(input: {
    contributionId: string;
    approverId: string;
    secondApproverId?: string;
    proposalId?: string;
    advanceRequestId?: string;
  }): Promise<MintOutcome>;
  /** Seed / genesis distribution entry point. */
  mintInitialAllocation(input: {
    communityId: string;
    allocations: ReadonlyArray<{ memberId: string; amount: bigint }>;
    reason: string;
    approvedBy: string;
  }): Promise<MintOutcome>;
}

export interface AdvanceRequestInput {
  communityId: string;
  memberId: string;
  amount: bigint;
  requestedBy: string;
  budgetSource?: BudgetSource;
  isSpecialNoContribution?: boolean;
  reason?: string;
  contributionIds?: string[];
}

export interface AdvanceRequestSummary {
  requestId: string;
  status: string;
}

export interface AdvanceService {
  createRequest(input: AdvanceRequestInput): Promise<AdvanceRequestSummary>;
  secondApprove(id: string, approverId: string): Promise<AdvanceRequestSummary>;
  attachProposal(id: string, proposalId: string): Promise<AdvanceRequestSummary>;
  reject(id: string, actorId: string): Promise<AdvanceRequestSummary>;
  /** Idempotent via TokenMintEvent.advanceRequestId re-lookup. */
  execute(input: {
    requestId: string;
    memberId?: string;
    evidenceUrls?: string[];
  }): Promise<MintOutcome>;
}

export interface EpochService {
  closeEpoch(
    epochId: string,
  ): Promise<
    | { communityId: string; nextEpochId: string; chainRecordIds: string[] }
    | { noop: true }
  >;
  createNextEpoch(communityId: string): Promise<{ epochId: string; created: boolean }>;
}

export interface ReversalService {
  reverseMint(input: {
    originalMintEventId: string;
    amount?: bigint;
    reason: ReversalReason;
    approvedBy: string;
    proposalId?: string;
  }): Promise<{ reversalEventId: string; publicRecordId: string }>;
  finalizeSupersede(reversalEventId: string): Promise<boolean>;
}

export interface ProposalCreateInput {
  communityId: string;
  title: string;
  type: ProposalType;
  createdBy: string;
  options?: ReadonlyArray<{ id: string; label?: string }>;
  metadata?: unknown;
}

export interface ProposalService {
  create(input: ProposalCreateInput): Promise<{ proposalId: string }>;
  activate(id: string): Promise<{ snapshotRecordId: string } | { noop: true }>;
  castVote(input: {
    proposalId: string;
    memberId: string;
    optionId: string;
  }): Promise<{ voteId: string; idempotent?: boolean }>;
  end(
    id: string,
  ): Promise<
    | {
        winningOptionId: string | null;
        voterCount: number;
        totalVoteWeight: bigint;
        resultRecordId: string;
        quorumMet: boolean;
      }
    | { noop: true }
  >;
}

export interface PolicyService extends PolicyActivationPort {
  createPendingVersion(
    tx: EngineTx,
    input: {
      communityId: string;
      proposalId: string;
      monthlyInflationRateBps: number;
      maxAdvanceRateBps: number;
      memberMintCapRateBps: number;
      rules?: unknown;
    },
  ): Promise<{ versionId: string; version: number; effectiveEpoch: number }>;
  getCurrentPolicy(communityId: string): Promise<PolicyRow | null>;
  listVersions(communityId: string): Promise<PolicyRow[]>;
}

// ================================================================
// Reversal reasons (frozen tuple) + derived union
// ================================================================

export const REVERSAL_REASONS = [
  'fabricated_evidence',
  'duplicate_claim',
  'multi_account_abuse',
  'vote_manipulation',
  'entry_error',
  'community_proposal',
] as const;

export type ReversalReason = (typeof REVERSAL_REASONS)[number];
