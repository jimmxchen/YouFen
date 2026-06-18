// AI service-layer type contract (ARCHITECTURE §9). Pure types only: this file
// never imports the engine write path, lib/db, or the Prisma client. AI output
// is advisory — every write is executed later by the deterministic engine after
// human approval (§9.1). Amounts entering deterministic math are bigint; ratios
// are integer bps.

/** PRD §23.1 — a generated (draft) token contribution rule. */
export interface GeneratedTokenRule {
  readonly name: string;
  readonly description: string;
  readonly tokenAmount: number;
  readonly repeatLimitPerEpoch?: number;
  readonly evidenceRequired: boolean;
  readonly abuseRisk: string;
  readonly reasoning: string;
}

/** A generated rule carrying the stable id assigned once persisted. */
export interface RuleWithId extends GeneratedTokenRule {
  readonly id: string;
}

/**
 * ARCHITECTURE §9.3 — the approval path a contribution analysis resolves to.
 * Structurally identical to the engine's AdvanceApprovalPath so the calc-layer
 * resolver output is directly assignable.
 */
export type RequiredApproval =
  | 'standard_rule'
  | 'dual_admin'
  | 'community_proposal'
  | 'system_forbidden';

/**
 * ARCHITECTURE §9.3 — deterministic fact snapshot read from the DB before the
 * LLM is ever called. Every amount is bigint; the LLM never sees a mutable
 * source of budget truth.
 */
export interface DeterministicMintContext {
  readonly baseMintBudget: bigint;
  readonly remainingRegularBudget: bigint;
  readonly memberEarnedThisEpoch: bigint;
  readonly memberEpochCap: bigint;
  readonly maxAdvanceAmount: bigint;
  readonly advancedMintedThisEpoch: bigint;
  readonly hasOutstandingAdvance: boolean;
  readonly isRelatedParty: boolean;
  readonly policyVersion: number;
  readonly epochNumber: number;
}

/** ARCHITECTURE §9.3 (eleven-item interface) plus cumulativeAdvanceRateBps. */
export interface ContributionAnalysis {
  readonly matchedRuleId: string | null;
  readonly matchedRuleName: string | null;
  readonly suggestedTokenAmount: number;
  readonly contributionValue: string;
  readonly isDuplicate: boolean;
  readonly exceedsMemberEpochCap: boolean;
  readonly regularBudgetSufficient: boolean;
  readonly requiresAdvance: boolean;
  readonly advanceRateBps: number;
  readonly relatedPartyRisk: boolean;
  readonly requiredApproval: RequiredApproval;
  readonly riskWarnings: readonly string[];
  readonly cumulativeAdvanceRateBps: number;
}

/** One rule-classified slice of the epoch token distribution. */
export interface DistributionSlice {
  readonly label: string;
  readonly amount: bigint;
}

/** ARCHITECTURE §9.4 — deterministic epoch summary fed to the report. */
export interface EpochHealthInput {
  readonly communityName: string;
  readonly epochNumber: number;
  readonly openingSupply: bigint;
  readonly regularMintedAmount: bigint;
  readonly advancedMintedAmount: bigint;
  readonly advanceDebt: bigint;
  readonly inflationRateBps: number;
  readonly distribution: readonly DistributionSlice[];
  readonly topThreeConcentrationBps: number;
  readonly previousTopThreeConcentrationBps: number | null;
}

/** A distribution slice with its share of the epoch total, in bps. */
export interface DistributionShare {
  readonly label: string;
  readonly percentageBps: number;
}

/** Deterministic metrics — every value derived from ledger figures, not the LLM. */
export interface EpochHealthMetrics {
  readonly baseInflationRateBps: number;
  readonly regularInflationBps: number;
  readonly advancedInflationBps: number;
  readonly totalSupplyGrowthBps: number;
  readonly advanceDebt: bigint;
  readonly distribution: readonly DistributionShare[];
  readonly topThreeConcentrationBps: number;
  readonly previousTopThreeConcentrationBps: number | null;
  readonly usedFutureBudget: boolean;
}

export interface EpochHealthReport {
  readonly metrics: EpochHealthMetrics;
  readonly reportText: string;
}

/**
 * Advisory result envelope. `degraded` is true when the LLM was unavailable or
 * returned unusable output; `data` may still carry a deterministic-only payload
 * so callers never lose the code-computed facts.
 */
export type AiResult<T> =
  | { readonly ok: true; readonly data: T; readonly degraded: false }
  | {
      readonly ok: false;
      readonly degraded: true;
      readonly code: 'AI_UNAVAILABLE';
      readonly message: string;
      readonly data: T | null;
    };
