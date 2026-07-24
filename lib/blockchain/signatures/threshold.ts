// Off-chain mirror of the contract's approval-tier logic (YouFenGovernance
// `_checkMintApproval`, docs/BLOCKCHAIN-DESIGN-v0.7.md §2 step 7). This is a
// FAIL-FAST convenience for the request-assembler: it decides how many approver
// signatures to collect and whether a governing proposal must be attached BEFORE
// wasting a relayer submission. The contract remains the sole authority — this
// mirror must never be more permissive than the contract, and the shared
// governance test suite is the oracle that keeps them aligned.

const ADVANCE_DUAL_BPS = 1_000; // <=10% advance -> DUAL; >10% -> PROPOSAL
const ADVANCE_LIMIT_BPS = 2_500; // >25% cumulative advance -> forbidden

export type ApprovalTier = 'single' | 'dual' | 'proposal';

export interface MintApprovalInput {
  /** advance leg of the mint (0 for a normal mint). */
  readonly advanceAmount: bigint;
  /** (epochAdvanceMinted + advanceAmount) * 10000 / baseMintBudget — computed by the caller. */
  readonly cumulativeAdvanceBps: number;
  /** recipient is an owner/manager (escalates to at least DUAL). */
  readonly relatedParty: boolean;
  /** the community's baseline approver threshold (>= 1). */
  readonly approverThreshold: number;
}

export interface MintApprovalRequirement {
  readonly tier: ApprovalTier;
  /** distinct approver signatures required. */
  readonly requiredApprovers: number;
  /** a finalized+approved governing proposal must be attached. */
  readonly proposalRequired: boolean;
  /** the contract will hard-revert (ADVANCE_LIMIT_EXCEEDED) — do not submit. */
  readonly forbidden: boolean;
  readonly reason: string;
}

/**
 * Resolve the approval requirement for a mint, mirroring executeMint step 7.
 * Note: the member EPOCH CAP is a separate HARD revert (over-cap is not an
 * escalation — it needs a distinct special_mint proposal), so it is NOT modeled
 * here; the caller checks the cap independently.
 */
export function resolveMintApproval(input: MintApprovalInput): MintApprovalRequirement {
  const { advanceAmount, cumulativeAdvanceBps, relatedParty, approverThreshold } = input;
  const floor = approverThreshold >= 1 ? approverThreshold : 1;

  if (advanceAmount > 0n && cumulativeAdvanceBps > ADVANCE_LIMIT_BPS) {
    return {
      tier: 'proposal',
      requiredApprovers: floor,
      proposalRequired: true,
      forbidden: true,
      reason: 'ADVANCE_LIMIT_EXCEEDED',
    };
  }

  let tierFloor = 1;
  let proposalRequired = false;
  if (advanceAmount > 0n && cumulativeAdvanceBps > ADVANCE_DUAL_BPS) {
    proposalRequired = true; // advance > 10% -> BUDGET_ADVANCE proposal
  } else if (advanceAmount > 0n) {
    tierFloor = 2; // 0 < advance <= 10% -> DUAL
  }
  if (relatedParty && tierFloor < 2) tierFloor = 2;

  if (proposalRequired) {
    return {
      tier: 'proposal',
      requiredApprovers: floor,
      proposalRequired: true,
      forbidden: false,
      reason: 'PROPOSAL_REQUIRED',
    };
  }

  const requiredApprovers = Math.max(floor, tierFloor);
  return {
    tier: tierFloor >= 2 ? 'dual' : 'single',
    requiredApprovers,
    proposalRequired: false,
    forbidden: false,
    reason: tierFloor >= 2 ? 'DUAL' : 'SINGLE',
  };
}

/** Cumulative advance rate in bps: (alreadyMinted + requested) * 10000 / base. */
export function cumulativeAdvanceBps(
  epochAdvanceMinted: bigint,
  requested: bigint,
  baseMintBudget: bigint,
): number {
  if (baseMintBudget === 0n) return requested > 0n ? Number.POSITIVE_INFINITY : 0;
  return Number(((epochAdvanceMinted + requested) * 10_000n) / baseMintBudget);
}
