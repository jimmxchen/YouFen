// Single source of truth for every business-condition raw UPDATE in the engine
// (red-team revision). W3 services NEVER template-tag raw SQL directly; they
// call these functions, so the fake needs to match only this one file's
// statement set. Each function returns the affected row count from $executeRaw.
//
// This list is the closure: all conditional UPDATEs W3 needs are enumerated
// here. Epoch close uses db-locks.lockEpochById + an in-code status check, so no
// status-bearing epoch UPDATE variant is required.

import type { EngineTx } from './types';

/**
 * Add `amount` to TokenEpoch.regularMintedAmount only if it keeps the running
 * total within effectiveRegularBudget. Returns 1 if applied, 0 if the guard
 * blocked it (budget exceeded or epoch not found).
 */
export function incrementRegularMintedGuarded(
  tx: EngineTx,
  epochId: string,
  amount: bigint,
): Promise<number> {
  return tx.$executeRaw`UPDATE "TokenEpoch" SET "regularMintedAmount" = "regularMintedAmount" + ${amount} WHERE "id" = ${epochId} AND "regularMintedAmount" + ${amount} <= "effectiveRegularBudget"`;
}

/**
 * Add `amount` to TokenEpoch.advancedMintedAmount only if it stays within
 * maxAdvanceAmount. Returns 1 if applied, 0 if the guard blocked it.
 */
export function incrementAdvancedMintedGuarded(
  tx: EngineTx,
  epochId: string,
  amount: bigint,
): Promise<number> {
  return tx.$executeRaw`UPDATE "TokenEpoch" SET "advancedMintedAmount" = "advancedMintedAmount" + ${amount} WHERE "id" = ${epochId} AND "advancedMintedAmount" + ${amount} <= "maxAdvanceAmount"`;
}

/**
 * Roll every member's pendingGovernanceBalance into activeGovernanceBalance at
 * epoch rollover. Returns the number of balances that had pending > 0.
 */
export function activatePendingGovernance(
  tx: EngineTx,
  communityId: string,
): Promise<number> {
  return tx.$executeRaw`UPDATE "MemberTokenBalance" SET "activeGovernanceBalance" = "activeGovernanceBalance" + "pendingGovernanceBalance", "pendingGovernanceBalance" = 0 WHERE "communityId" = ${communityId} AND "pendingGovernanceBalance" > 0`;
}

/**
 * Compare-and-set a Proposal's status: from -> to only if it is currently
 * `from`. Returns 1 on success, 0 if the current status did not match.
 */
export function transitionProposalStatus(
  tx: EngineTx,
  proposalId: string,
  from: string,
  to: string,
): Promise<number> {
  return tx.$executeRaw`UPDATE "Proposal" SET "status" = ${to} WHERE "id" = ${proposalId} AND "status" = ${from}`;
}

/**
 * Mark an active Proposal `ended` if its endTime is due. Returns 1 if it was
 * transitioned, 0 otherwise (not active, or not yet due).
 */
export function endProposalIfDue(
  tx: EngineTx,
  proposalId: string,
  now: Date,
): Promise<number> {
  return tx.$executeRaw`UPDATE "Proposal" SET "status" = 'ended' WHERE "id" = ${proposalId} AND "status" = 'active' AND "endTime" <= ${now}`;
}
