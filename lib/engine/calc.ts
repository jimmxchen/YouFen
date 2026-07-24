// Pure token-economics math (frozen contract). Every amount is bigint; integer
// division floors (operands are validated non-negative first, so truncation ==
// floor). Ratios are basis points (bps, integer). No IO, no mutation.

import { EngineError } from './errors';

const BPS_DENOMINATOR = 10_000n;

/** Reject a negative bigint at the boundary. */
function assertNonNegativeBigint(value: bigint): void {
  if (value < 0n) {
    throw new EngineError('VALIDATION_ERROR', 'amount must be non-negative');
  }
}

/** Reject a negative bps / integer rate at the boundary. */
function assertNonNegativeBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0) {
    throw new EngineError('VALIDATION_ERROR', 'bps must be a non-negative integer');
  }
}

/** base = openingSupply * bps / 10000 (floored). */
export function calculateBaseMintBudget(
  openingSupply: bigint,
  inflationRateBps: number,
): bigint {
  assertNonNegativeBigint(openingSupply);
  assertNonNegativeBps(inflationRateBps);
  return (openingSupply * BigInt(inflationRateBps)) / BPS_DENOMINATOR;
}

/** effective = max(0, base - debt). */
export function calculateEffectiveRegularBudget(base: bigint, debt: bigint): bigint {
  assertNonNegativeBigint(base);
  assertNonNegativeBigint(debt);
  const remaining = base - debt;
  return remaining > 0n ? remaining : 0n;
}

/** carried-over debt = max(0, debt - base) rolled into the next epoch. */
export function calculateCarriedOverDebt(base: bigint, debt: bigint): bigint {
  assertNonNegativeBigint(base);
  assertNonNegativeBigint(debt);
  const carried = debt - base;
  return carried > 0n ? carried : 0n;
}

/** max advance = base * maxAdvanceRateBps / 10000 (floored). */
export function calculateMaxAdvanceAmount(
  base: bigint,
  maxAdvanceRateBps: number,
): bigint {
  assertNonNegativeBigint(base);
  assertNonNegativeBps(maxAdvanceRateBps);
  return (base * BigInt(maxAdvanceRateBps)) / BPS_DENOMINATOR;
}

/** per-member epoch cap = base * memberMintCapRateBps / 10000 (floored). */
export function calculateMemberEpochCap(
  base: bigint,
  memberMintCapRateBps: number,
): bigint {
  assertNonNegativeBigint(base);
  assertNonNegativeBps(memberMintCapRateBps);
  return (base * BigInt(memberMintCapRateBps)) / BPS_DENOMINATOR;
}

/**
 * Ownership as a percentage in [0, 100]. supply == 0 -> 0. Computed with a
 * bigint intermediate (balance * 1_000_000 / supply) to preserve four decimal
 * places before crossing into Number, matching the Float snapshot columns.
 */
export function calculateOwnershipPercentage(balance: bigint, supply: bigint): number {
  assertNonNegativeBigint(balance);
  assertNonNegativeBigint(supply);
  if (supply === 0n) {
    return 0;
  }
  return Number((balance * 1_000_000n) / supply) / 10_000;
}

/**
 * Cumulative advance rate in bps = (alreadyAdvanced + requested) * 10000 / base.
 * base == 0 -> MAX_SAFE_INTEGER when anything is requested (unbounded), else 0.
 */
export function calculateCumulativeAdvanceRateBps(
  alreadyAdvanced: bigint,
  requested: bigint,
  baseMintBudget: bigint,
): number {
  assertNonNegativeBigint(alreadyAdvanced);
  assertNonNegativeBigint(requested);
  assertNonNegativeBigint(baseMintBudget);
  if (baseMintBudget === 0n) {
    return requested > 0n ? Number.MAX_SAFE_INTEGER : 0;
  }
  return Number(((alreadyAdvanced + requested) * BPS_DENOMINATOR) / baseMintBudget);
}

/** The advance-approval path a cumulative rate resolves to (§6.2). */
export type AdvanceApprovalPath =
  | 'standard_rule'
  | 'dual_admin'
  | 'community_proposal'
  | 'system_forbidden';

/**
 * §6.2 decision table (order matters):
 *  - cumulative > 2500 bps            -> system_forbidden
 *  - related party OR special mint    -> community_proposal
 *  - cumulative > 1000 bps            -> community_proposal
 *  - cumulative > 0 bps               -> dual_admin
 *  - cumulative == 0 bps              -> standard_rule
 */
export function resolveAdvanceApproval(
  cumulativeBps: number,
  relatedParty: boolean,
  isSpecialNoContribution: boolean,
): AdvanceApprovalPath {
  if (cumulativeBps > 2500) {
    return 'system_forbidden';
  }
  if (relatedParty || isSpecialNoContribution) {
    return 'community_proposal';
  }
  if (cumulativeBps > 1000) {
    return 'community_proposal';
  }
  if (cumulativeBps > 0) {
    return 'dual_admin';
  }
  return 'standard_rule';
}
