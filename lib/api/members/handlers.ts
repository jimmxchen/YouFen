// Pure handlers for the members read endpoints and the public token-epoch detail
// (W5-5, PRD §24.2/§24.3/§24.4). Every handler is a (deps, input) => Promise<ApiResult>
// function with all collaborators injected via a MembersReader port, so it is fully
// unit-testable with structural fakes. Route adapters wire the real reader.
//
// Derived percentages (ownershipPercentage / governancePercentage) are NEVER
// persisted: they are computed at query time from the live CommunityTokenState
// supply and the community-wide Σ activeGovernanceBalance (PRD §24.3), so a balance
// change is reflected immediately on the next read.

import type { AuthContext } from '../core/auth';
import { fail, ok, mapEngineError, type ApiResult } from '../core';

// ---- Injected reader port (structural subset over Prisma) ----

export interface MemberBalanceRow {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: string;
  readonly totalBalance: bigint;
  readonly activeGovernanceBalance: bigint;
  readonly pendingGovernanceBalance: bigint;
  readonly tokensEarnedCurrentEpoch: bigint;
  readonly tokensEarnedLifetime: bigint;
  readonly tokensReversedLifetime: bigint;
  readonly lastContributionAt: Date | null;
  readonly lastMintAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MintEventRow {
  readonly id: string;
  readonly amount: bigint;
  readonly mintType: string;
  readonly budgetSource: string;
  readonly governanceStatus: string;
  readonly memberBalanceBefore: bigint;
  readonly memberBalanceAfter: bigint;
  readonly ownershipPercentageBefore: number | null;
  readonly ownershipPercentageAfter: number | null;
  readonly reason: string;
  readonly publicRecordId: string | null;
  readonly createdAt: Date;
}

export interface ReversalEventRow {
  readonly id: string;
  readonly amount: bigint;
  readonly reason: string;
  readonly totalBalanceAfter: bigint;
  readonly activeGovernanceBalanceAfter: bigint | null;
  readonly pendingGovernanceBalanceAfter: bigint | null;
  readonly totalSupplyAfter: bigint;
  readonly publicRecordId: string | null;
  readonly createdAt: Date;
}

export interface EpochRow {
  readonly id: string;
  readonly communityId: string;
  readonly epochNumber: number;
  readonly openingSupply: bigint;
  readonly inflationRateBps: number;
  readonly baseMintBudget: bigint;
  readonly advanceDebtFromPreviousEpoch: bigint;
  readonly effectiveRegularBudget: bigint;
  readonly maxAdvanceAmount: bigint;
  readonly regularMintedAmount: bigint;
  readonly advancedMintedAmount: bigint;
  readonly unusedRegularBudget: bigint;
  readonly status: string;
  readonly startTime: Date | null;
  readonly endTime: Date | null;
  readonly closedAt: Date | null;
  readonly publicRecordId: string | null;
  readonly createdAt: Date;
}

/** Read-only surface the members/epoch handlers touch. */
export interface MembersReader {
  getBalance(memberId: string): Promise<MemberBalanceRow | null>;
  getTokenState(communityId: string): Promise<{ currentTotalSupply: bigint } | null>;
  sumActiveGovernance(communityId: string): Promise<bigint>;
  listMintEvents(memberId: string): Promise<readonly MintEventRow[]>;
  listReversalEvents(memberId: string): Promise<readonly ReversalEventRow[]>;
  getEpoch(epochId: string): Promise<EpochRow | null>;
}

/** Self-or-admin predicate. Default: admin/internal OR the actor is the member. */
export type AuthorizeMemberFn = (ctx: AuthContext, memberId: string) => boolean;

export interface MembersDeps {
  readonly reader: MembersReader;
  readonly authorizeMember: AuthorizeMemberFn;
}

// ---- Helpers ----

/** Derived percentage as a ratio in [0,1]; 0 when the denominator is non-positive. */
function ratio(numerator: bigint, denominator: bigint): number {
  if (denominator <= 0n) return 0;
  return Number(numerator) / Number(denominator);
}

// ---- GET /api/members/:id/token-balance (member: self or admin) ----

export async function handleTokenBalance(
  deps: MembersDeps,
  input: { memberId: string; ctx: AuthContext },
): Promise<ApiResult> {
  if (!deps.authorizeMember(input.ctx, input.memberId)) {
    return fail(403, 'FORBIDDEN', 'Not authorized to view this member balance');
  }
  try {
    const balance = await deps.reader.getBalance(input.memberId);
    if (!balance) {
      return fail(404, 'NOT_FOUND', `Member balance for '${input.memberId}' not found`);
    }

    const [state, activeGovernanceTotal] = await Promise.all([
      deps.reader.getTokenState(balance.communityId),
      deps.reader.sumActiveGovernance(balance.communityId),
    ]);
    const currentTotalSupply = state?.currentTotalSupply ?? 0n;

    return ok({
      memberId: balance.memberId,
      communityId: balance.communityId,
      totalBalance: balance.totalBalance,
      activeGovernanceBalance: balance.activeGovernanceBalance,
      pendingGovernanceBalance: balance.pendingGovernanceBalance,
      tokensEarnedCurrentEpoch: balance.tokensEarnedCurrentEpoch,
      tokensEarnedLifetime: balance.tokensEarnedLifetime,
      tokensReversedLifetime: balance.tokensReversedLifetime,
      // Derived at read time from live supply / Σ activeGovernanceBalance; never stored.
      ownershipPercentage: ratio(balance.totalBalance, currentTotalSupply),
      governancePercentage: ratio(balance.activeGovernanceBalance, activeGovernanceTotal),
      lastContributionAt: balance.lastContributionAt,
      lastMintAt: balance.lastMintAt,
      createdAt: balance.createdAt,
      updatedAt: balance.updatedAt,
    });
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}

// ---- GET /api/members/:id/token-history (member: self or admin, paginated) ----

interface HistoryItem {
  readonly kind: 'mint' | 'reversal';
  readonly sortAt: number;
  readonly payload: Record<string, unknown>;
}

function mintItem(row: MintEventRow): HistoryItem {
  return {
    kind: 'mint',
    sortAt: row.createdAt.getTime(),
    payload: {
      kind: 'mint',
      id: row.id,
      amount: row.amount,
      mintType: row.mintType,
      budgetSource: row.budgetSource,
      governanceStatus: row.governanceStatus,
      memberBalanceBefore: row.memberBalanceBefore,
      memberBalanceAfter: row.memberBalanceAfter,
      ownershipPercentageBefore: row.ownershipPercentageBefore,
      ownershipPercentageAfter: row.ownershipPercentageAfter,
      reason: row.reason,
      publicRecordId: row.publicRecordId,
      createdAt: row.createdAt,
    },
  };
}

function reversalItem(row: ReversalEventRow): HistoryItem {
  return {
    kind: 'reversal',
    sortAt: row.createdAt.getTime(),
    payload: {
      kind: 'reversal',
      id: row.id,
      amount: row.amount,
      reason: row.reason,
      totalBalanceAfter: row.totalBalanceAfter,
      activeGovernanceBalanceAfter: row.activeGovernanceBalanceAfter,
      pendingGovernanceBalanceAfter: row.pendingGovernanceBalanceAfter,
      totalSupplyAfter: row.totalSupplyAfter,
      publicRecordId: row.publicRecordId,
      createdAt: row.createdAt,
    },
  };
}

export async function handleTokenHistory(
  deps: MembersDeps,
  input: { memberId: string; ctx: AuthContext; page: number; limit: number },
): Promise<ApiResult> {
  if (!deps.authorizeMember(input.ctx, input.memberId)) {
    return fail(403, 'FORBIDDEN', 'Not authorized to view this member history');
  }
  try {
    const [mints, reversals] = await Promise.all([
      deps.reader.listMintEvents(input.memberId),
      deps.reader.listReversalEvents(input.memberId),
    ]);

    const merged: readonly HistoryItem[] = [
      ...mints.map(mintItem),
      ...reversals.map(reversalItem),
    ]
      .slice()
      .sort((a, b) => b.sortAt - a.sortAt);

    const total = merged.length;
    const start = (input.page - 1) * input.limit;
    const pageItems = merged.slice(start, start + input.limit).map((i) => i.payload);

    return ok(pageItems, 200, { total, page: input.page, limit: input.limit });
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}

// ---- GET /api/token-epochs/:id (public) ----

export async function handleEpochDetail(
  deps: MembersDeps,
  input: { epochId: string },
): Promise<ApiResult> {
  try {
    const epoch = await deps.reader.getEpoch(input.epochId);
    if (!epoch) {
      return fail(404, 'NOT_FOUND', `Token epoch '${input.epochId}' not found`);
    }
    return ok({
      id: epoch.id,
      communityId: epoch.communityId,
      epochNumber: epoch.epochNumber,
      openingSupply: epoch.openingSupply,
      inflationRateBps: epoch.inflationRateBps,
      baseMintBudget: epoch.baseMintBudget,
      advanceDebtFromPreviousEpoch: epoch.advanceDebtFromPreviousEpoch,
      effectiveRegularBudget: epoch.effectiveRegularBudget,
      maxAdvanceAmount: epoch.maxAdvanceAmount,
      regularMintedAmount: epoch.regularMintedAmount,
      advancedMintedAmount: epoch.advancedMintedAmount,
      unusedRegularBudget: epoch.unusedRegularBudget,
      status: epoch.status,
      startTime: epoch.startTime,
      endTime: epoch.endTime,
      closedAt: epoch.closedAt,
      publicRecordId: epoch.publicRecordId,
      createdAt: epoch.createdAt,
    });
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}

/**
 * Default self-or-admin policy.
 *
 * SECURITY (IDOR): `ctx.actorId` is derived solely from the client-controlled,
 * unauthenticated `x-youfen-actor-id` header (see lib/api/core/auth.ts). A bare
 * `actorId === memberId` match therefore does NOT prove the caller *is* that member:
 * any anonymous request can spoof the header and read an arbitrary member's financial
 * data. Until the actor identity is resolved from an authenticated session (NextAuth)
 * in the route adapter, the asserted actorId cannot be trusted for self-access, so we
 * grant only trusted principals: an admin, or an authenticated internal/service caller
 * (valid Bearer token -> `isInternal`). When a genuine session channel is added, this
 * predicate can safely re-admit a verified `actorId === memberId` match.
 */
export const defaultAuthorizeMember: AuthorizeMemberFn = (ctx, _memberId) =>
  ctx.isAdmin || ctx.isInternal;
