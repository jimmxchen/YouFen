// Pessimistic row-lock adapters (SELECT ... FOR UPDATE), single source of
// truth. Five locks; each returns the frozen W1-B structured row type with
// every bigint column normalized through BigInt() (Prisma returns bigint, a raw
// driver may hand back number/string — normalization makes the shape uniform).
//
// lockEpochById locks by id only; the caller checks status in code (no
// status-bearing SQL variant, per the sql.ts closure note).

import type {
  BalanceRow,
  EngineTx,
  EpochRow,
  MintEventRow,
  StateRow,
} from './types';

type Raw = Record<string, unknown>;

/** Normalize any bigint-carrying value to bigint. */
function big(value: unknown): bigint {
  return BigInt(value as bigint | number | string);
}

function num(value: unknown): number {
  return Number(value);
}

function mapEpoch(r: Raw): EpochRow {
  return {
    id: r.id as string,
    communityId: r.communityId as string,
    epochNumber: num(r.epochNumber),
    openingSupply: big(r.openingSupply),
    baseMintBudget: big(r.baseMintBudget),
    advanceDebtFromPreviousEpoch: big(r.advanceDebtFromPreviousEpoch),
    effectiveRegularBudget: big(r.effectiveRegularBudget),
    maxAdvanceAmount: big(r.maxAdvanceAmount),
    regularMintedAmount: big(r.regularMintedAmount),
    advancedMintedAmount: big(r.advancedMintedAmount),
    unusedRegularBudget: big(r.unusedRegularBudget),
    inflationRateBps: num(r.inflationRateBps),
    status: r.status as string,
    startTime: (r.startTime as Date | null) ?? null,
    endTime: (r.endTime as Date | null) ?? null,
  };
}

function mapBalance(r: Raw): BalanceRow {
  return {
    id: r.id as string,
    communityId: r.communityId as string,
    memberId: r.memberId as string,
    totalBalance: big(r.totalBalance),
    activeGovernanceBalance: big(r.activeGovernanceBalance),
    pendingGovernanceBalance: big(r.pendingGovernanceBalance),
    tokensEarnedCurrentEpoch: big(r.tokensEarnedCurrentEpoch),
    tokensEarnedLifetime: big(r.tokensEarnedLifetime),
    tokensReversedLifetime: big(r.tokensReversedLifetime),
  };
}

function mapState(r: Raw): StateRow {
  return {
    communityId: r.communityId as string,
    currentTotalSupply: big(r.currentTotalSupply),
    ledgerSeq: big(r.ledgerSeq),
  };
}

function mapMintEvent(r: Raw): MintEventRow {
  return {
    id: r.id as string,
    communityId: r.communityId as string,
    memberId: r.memberId as string,
    epochId: r.epochId as string,
    epochNumber: num(r.epochNumber),
    mintType: r.mintType as string,
    budgetSource: r.budgetSource as string,
    amount: big(r.amount),
    governanceActivationEpoch:
      r.governanceActivationEpoch == null ? null : num(r.governanceActivationEpoch),
    governanceStatus: r.governanceStatus as string,
    memberBalanceBefore: big(r.memberBalanceBefore),
    memberBalanceAfter: big(r.memberBalanceAfter),
    totalSupplyBefore: big(r.totalSupplyBefore),
    totalSupplyAfter: big(r.totalSupplyAfter),
    tokenPolicyVersion: num(r.tokenPolicyVersion),
    reason: r.reason as string,
    approvedBy: r.approvedBy as string,
    advanceRequestId: (r.advanceRequestId as string | null) ?? null,
    publicRecordId: (r.publicRecordId as string | null) ?? null,
    ledgerSeq: r.ledgerSeq == null ? null : num(r.ledgerSeq),
    createdAt: r.createdAt as Date,
  };
}

/** Lock the community's active epoch (WHERE communityId AND status='active'). */
export async function lockActiveEpoch(
  tx: EngineTx,
  communityId: string,
): Promise<EpochRow | null> {
  const rows = await tx.$queryRaw<Raw[]>`SELECT * FROM "TokenEpoch" WHERE "communityId" = ${communityId} AND "status" = 'active' FOR UPDATE`;
  return rows.length > 0 ? mapEpoch(rows[0]) : null;
}

/** Lock an epoch by id only; the caller checks status in code. */
export async function lockEpochById(
  tx: EngineTx,
  epochId: string,
): Promise<EpochRow | null> {
  const rows = await tx.$queryRaw<Raw[]>`SELECT * FROM "TokenEpoch" WHERE "id" = ${epochId} FOR UPDATE`;
  return rows.length > 0 ? mapEpoch(rows[0]) : null;
}

/** Lock a member's balance row. */
export async function lockBalance(
  tx: EngineTx,
  communityId: string,
  memberId: string,
): Promise<BalanceRow | null> {
  const rows = await tx.$queryRaw<Raw[]>`SELECT * FROM "MemberTokenBalance" WHERE "communityId" = ${communityId} AND "memberId" = ${memberId} FOR UPDATE`;
  return rows.length > 0 ? mapBalance(rows[0]) : null;
}

/** Lock the community token state (supply + ledger sequence). */
export async function lockState(
  tx: EngineTx,
  communityId: string,
): Promise<StateRow | null> {
  const rows = await tx.$queryRaw<Raw[]>`SELECT * FROM "CommunityTokenState" WHERE "communityId" = ${communityId} FOR UPDATE`;
  return rows.length > 0 ? mapState(rows[0]) : null;
}

/**
 * Lock a proposal row by id (FOR UPDATE). The vote/end serialization point: a
 * deadline-boundary ballot contends here with end()'s status-transition UPDATE,
 * so a late vote can never commit after the tally yet outside the Merkle root.
 * Returns the raw locked row for an existence check; the caller re-reads typed
 * columns through Prisma (no bespoke mapper — the Proposal shape lives in the
 * service).
 */
export async function lockProposal(
  tx: EngineTx,
  proposalId: string,
): Promise<Record<string, unknown> | null> {
  const rows = await tx.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "Proposal" WHERE "id" = ${proposalId} FOR UPDATE`;
  return rows.length > 0 ? rows[0] : null;
}

/** Lock a mint event by id (reversal source-of-truth read). */
export async function lockMintEvent(
  tx: EngineTx,
  id: string,
): Promise<MintEventRow | null> {
  const rows = await tx.$queryRaw<Raw[]>`SELECT * FROM "TokenMintEvent" WHERE "id" = ${id} FOR UPDATE`;
  return rows.length > 0 ? mapMintEvent(rows[0]) : null;
}
