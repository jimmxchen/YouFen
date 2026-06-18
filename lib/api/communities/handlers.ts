// Pure Community read-endpoint handlers (W5-4): token-policy detail + change
// proposal, policy-version list, epoch list, and the merged token ledger
// (PRD §18). Each handler is a (deps, input) => Promise<ApiResult> with all
// collaborators injected, so it is unit-testable with structural fakes. Route
// adapters wire real deps (engine proposal service + Prisma reads).

import { z } from 'zod';

import type { AuthContext, AuthorizeAdminFn } from '../core/auth';
import { fail, mapEngineError, ok, type ApiMeta, type ApiResult } from '../core/respond';
import { parseBody, zBps } from '../core/validation';
import type { ProposalService } from '../../engine/types';

// ---- Injected ports --------------------------------------------------------

interface FindUniqueDelegate {
  findUnique(args: unknown): Promise<unknown>;
}
interface ListDelegate {
  findMany(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
}

/** The Prisma read surface the community handlers touch. */
export interface CommunitiesDb {
  readonly communityTokenPolicy: FindUniqueDelegate;
  readonly communityTokenState: FindUniqueDelegate;
  readonly tokenPolicyVersion: FindUniqueDelegate & ListDelegate;
  readonly tokenEpoch: ListDelegate;
  readonly tokenMintEvent: ListDelegate;
  readonly tokenReversalEvent: ListDelegate;
  readonly publicRecord: {
    findMany(args: unknown): Promise<unknown>;
    count(args: unknown): Promise<number>;
  };
}

export interface CommunitiesDeps {
  readonly db: CommunitiesDb;
  readonly proposal: Pick<ProposalService, 'create'>;
  readonly authorize: AuthorizeAdminFn;
}

// ---- Shared helpers --------------------------------------------------------

function meta(total: number, page: number, limit: number): ApiMeta {
  return { total, page, limit };
}
function iso(date: unknown): string | null {
  return date instanceof Date ? date.toISOString() : null;
}

// ---- GET /api/communities/:id/token-policy  (public) ----

interface PolicyRow {
  id: string; communityId: string; tokenName: string; tokenSymbol: string;
  epochDurationDays: number; monthlyInflationRateBps: number; maxAdvanceRateBps: number;
  memberMintCapRateBps: number; policyVersion: number; effectiveEpoch: number;
  rules: unknown; isTransferable: boolean; pendingPolicyVersionId: string | null;
}
interface PendingVersionRow {
  version: number; effectiveEpoch: number;
  monthlyInflationRateBps: number; maxAdvanceRateBps: number; memberMintCapRateBps: number;
}

export async function handleGetTokenPolicy(
  deps: CommunitiesDeps,
  input: { communityId: string },
): Promise<ApiResult> {
  const policy = (await deps.db.communityTokenPolicy.findUnique({
    where: { communityId: input.communityId },
  })) as PolicyRow | null;
  if (!policy) {
    return fail(404, 'NOT_FOUND', `No token policy for community '${input.communityId}'`);
  }

  const state = (await deps.db.communityTokenState.findUnique({
    where: { communityId: input.communityId },
  })) as { currentTotalSupply: bigint } | null;

  let pendingVersion: PendingVersionRow | null = null;
  if (policy.pendingPolicyVersionId !== null) {
    const ver = (await deps.db.tokenPolicyVersion.findUnique({
      where: { id: policy.pendingPolicyVersionId },
    })) as PendingVersionRow | null;
    if (ver) {
      pendingVersion = {
        version: ver.version, effectiveEpoch: ver.effectiveEpoch,
        monthlyInflationRateBps: ver.monthlyInflationRateBps,
        maxAdvanceRateBps: ver.maxAdvanceRateBps, memberMintCapRateBps: ver.memberMintCapRateBps,
      };
    }
  }

  return ok({
    communityId: policy.communityId, tokenName: policy.tokenName, tokenSymbol: policy.tokenSymbol,
    policyVersion: policy.policyVersion, effectiveEpoch: policy.effectiveEpoch,
    epochDurationDays: policy.epochDurationDays, monthlyInflationRateBps: policy.monthlyInflationRateBps,
    maxAdvanceRateBps: policy.maxAdvanceRateBps, memberMintCapRateBps: policy.memberMintCapRateBps,
    isTransferable: policy.isTransferable, rules: policy.rules,
    currentTotalSupply: state?.currentTotalSupply ?? 0n, pendingVersion,
  });
}

// ---- POST /api/communities/:id/token-policy/proposals  (admin) ----

const policyProposalSchema = z.object({
  monthlyInflationRateBps: zBps,
  maxAdvanceRateBps: zBps,
  memberMintCapRateBps: zBps,
  rules: z.unknown().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
});

export async function handleCreatePolicyProposal(
  deps: CommunitiesDeps,
  input: { communityId: string; body: unknown; auth: AuthContext },
): Promise<ApiResult> {
  if (!(await deps.authorize(input.auth, input.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }
  const parsed = parseBody(policyProposalSchema, input.body);
  if (!parsed.ok) return parsed.response;
  const { monthlyInflationRateBps, maxAdvanceRateBps, memberMintCapRateBps, rules, title } =
    parsed.data;

  const policyChangePayload: Record<string, unknown> = {
    monthlyInflationRateBps,
    maxAdvanceRateBps,
    memberMintCapRateBps,
    ...(rules !== undefined ? { rules } : {}),
  };

  try {
    const { proposalId } = await deps.proposal.create({
      communityId: input.communityId,
      title: title ?? 'Token policy change',
      type: 'token_policy_change',
      createdBy: input.auth.actorId ?? 'system',
      options: [{ id: 'approve' }, { id: 'reject' }],
      metadata: { policyChangePayload },
    });
    return ok(
      {
        proposalId,
        message:
          'Proposal created. The new policy version is created by the settlement callback only after the proposal passes.',
      },
      201,
    );
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}

// ---- GET /api/communities/:id/token-policy/versions  (public) ----

interface VersionRow {
  id: string; version: number; effectiveEpoch: number;
  monthlyInflationRateBps: number; maxAdvanceRateBps: number; memberMintCapRateBps: number;
  rules: unknown; proposalId: string | null; publicRecordId: string | null; createdAt: Date;
}

export async function handleListPolicyVersions(
  deps: CommunitiesDeps,
  input: { communityId: string; page: number; limit: number },
): Promise<ApiResult> {
  const policy = (await deps.db.communityTokenPolicy.findUnique({
    where: { communityId: input.communityId },
  })) as { id: string } | null;
  if (!policy) {
    return fail(404, 'NOT_FOUND', `No token policy for community '${input.communityId}'`);
  }

  const where = { policyId: policy.id };
  const skip = (input.page - 1) * input.limit;
  const [rows, total] = await Promise.all([
    deps.db.tokenPolicyVersion.findMany({
      where,
      orderBy: { version: 'desc' },
      skip,
      take: input.limit,
    }) as Promise<VersionRow[]>,
    deps.db.tokenPolicyVersion.count({ where }),
  ]);

  const data = rows.map((v) => ({
    id: v.id, version: v.version, effectiveEpoch: v.effectiveEpoch,
    monthlyInflationRateBps: v.monthlyInflationRateBps, maxAdvanceRateBps: v.maxAdvanceRateBps,
    memberMintCapRateBps: v.memberMintCapRateBps, rules: v.rules,
    proposalId: v.proposalId, publicRecordId: v.publicRecordId, createdAt: iso(v.createdAt),
  }));
  return ok(data, 200, meta(total, input.page, input.limit));
}

// ---- GET /api/communities/:id/token-epochs  (public) ----

interface EpochListRow {
  id: string; epochNumber: number; openingSupply: bigint; inflationRateBps: number;
  baseMintBudget: bigint; advanceDebtFromPreviousEpoch: bigint; regularMintedAmount: bigint;
  advancedMintedAmount: bigint; status: string; startTime: Date | null; endTime: Date | null;
  effectiveRegularBudget: bigint; maxAdvanceAmount: bigint; unusedRegularBudget: bigint;
  closedAt: Date | null; publicRecordId: string | null; createdAt: Date;
}

export async function handleListEpochs(
  deps: CommunitiesDeps,
  input: { communityId: string; page: number; limit: number },
): Promise<ApiResult> {
  const where = { communityId: input.communityId };
  const skip = (input.page - 1) * input.limit;
  const [rows, total] = await Promise.all([
    deps.db.tokenEpoch.findMany({
      where,
      orderBy: { epochNumber: 'desc' },
      skip,
      take: input.limit,
    }) as Promise<EpochListRow[]>,
    deps.db.tokenEpoch.count({ where }),
  ]);

  const data = rows.map((e) => ({
    id: e.id, epochNumber: e.epochNumber, openingSupply: e.openingSupply,
    inflationRateBps: e.inflationRateBps, baseMintBudget: e.baseMintBudget,
    advanceDebtFromPreviousEpoch: e.advanceDebtFromPreviousEpoch,
    regularMintedAmount: e.regularMintedAmount, advancedMintedAmount: e.advancedMintedAmount,
    effectiveRegularBudget: e.effectiveRegularBudget, maxAdvanceAmount: e.maxAdvanceAmount,
    unusedRegularBudget: e.unusedRegularBudget, status: e.status,
    startTime: iso(e.startTime), endTime: iso(e.endTime), closedAt: iso(e.closedAt),
    publicRecordId: e.publicRecordId, createdAt: iso(e.createdAt),
  }));
  return ok(data, 200, meta(total, input.page, input.limit));
}

// ---- GET /api/communities/:id/token-ledger  (public) ----

export const LEDGER_FILTERS = [
  'all', 'regular_mint', 'advance_mint', 'initial_allocation', 'special_reward',
  'related_party', 'reversal', 'pending_governance', 'injective_verified', 'verification_failed',
] as const;
export type LedgerFilter = (typeof LEDGER_FILTERS)[number];

interface LedgerPlan {
  mint: boolean; reversal: boolean;
  mintExtra: Record<string, unknown>; injective?: 'verified' | 'failed';
}

/** Translate a filter into which streams to read + their conditions. */
function planLedger(filter: LedgerFilter): LedgerPlan {
  switch (filter) {
    case 'all': return { mint: true, reversal: true, mintExtra: {} };
    case 'regular_mint':
      return { mint: true, reversal: false, mintExtra: { mintType: 'contribution', budgetSource: 'current_epoch' } };
    case 'advance_mint':
      return { mint: true, reversal: false, mintExtra: { budgetSource: 'next_epoch_advance' } };
    case 'initial_allocation':
      return { mint: true, reversal: false, mintExtra: { mintType: 'initial_allocation' } };
    case 'special_reward':
      return { mint: true, reversal: false, mintExtra: { mintType: 'special_reward' } };
    case 'related_party':
      return { mint: true, reversal: false, mintExtra: { relatedParty: true } };
    case 'reversal': return { mint: false, reversal: true, mintExtra: {} };
    case 'pending_governance':
      return { mint: true, reversal: false, mintExtra: { governanceStatus: 'pending' } };
    case 'injective_verified':
      return { mint: true, reversal: true, mintExtra: {}, injective: 'verified' };
    case 'verification_failed':
      return { mint: true, reversal: true, mintExtra: {}, injective: 'failed' };
  }
}

interface MintLedgerRow {
  id: string; memberId: string; mintType: string; budgetSource: string; amount: bigint;
  governanceActivationEpoch: number | null; governanceStatus: string;
  memberBalanceBefore: bigint; memberBalanceAfter: bigint;
  totalSupplyBefore: bigint; totalSupplyAfter: bigint;
  ownershipPercentageBefore: number | null; ownershipPercentageAfter: number | null;
  tokenPolicyVersion: number; contributionId: string | null; approvedBy: string;
  proposalId: string | null; relatedParty: boolean; publicRecordId: string | null; createdAt: Date;
}
interface ReversalLedgerRow {
  id: string; memberId: string; amount: bigint; reason: string; totalBalanceAfter: bigint;
  totalSupplyAfter: bigint; approvedBy: string; proposalId: string | null;
  publicRecordId: string | null; createdAt: Date;
}
interface UnifiedRow {
  sortKey: number; publicRecordId: string | null; row: Record<string, unknown>;
}

/** verified->confirmed, failed->failed, everything else->pending. */
function injectiveStatus(status: string | undefined): 'confirmed' | 'failed' | 'pending' {
  if (status === 'verified') return 'confirmed';
  if (status === 'failed') return 'failed';
  return 'pending';
}

/** Fields absent on one or both event kinds default here to keep rows uniform. */
const ROW_DEFAULTS: Record<string, unknown> = {
  mintType: null, budgetSource: null, governanceStatus: null, activationEpoch: null,
  memberBalanceBefore: null, memberBalanceAfter: null, totalSupplyBefore: null,
  totalSupplyAfter: null, ownershipPercentageBefore: null, ownershipPercentageAfter: null,
  contributionId: null, tokenPolicyVersion: null, approvedBy: null, proposalId: null,
  relatedParty: false, reason: null,
};

function mintToUnified(m: MintLedgerRow): UnifiedRow {
  return {
    sortKey: m.createdAt.getTime(),
    publicRecordId: m.publicRecordId,
    row: {
      ...ROW_DEFAULTS,
      id: m.id, time: m.createdAt.toISOString(), memberId: m.memberId,
      eventType: m.budgetSource === 'next_epoch_advance' ? 'advance_mint' : 'mint',
      mintType: m.mintType, amount: m.amount, budgetSource: m.budgetSource,
      governanceStatus: m.governanceStatus, activationEpoch: m.governanceActivationEpoch,
      memberBalanceBefore: m.memberBalanceBefore, memberBalanceAfter: m.memberBalanceAfter,
      totalSupplyBefore: m.totalSupplyBefore, totalSupplyAfter: m.totalSupplyAfter,
      ownershipPercentageBefore: m.ownershipPercentageBefore,
      ownershipPercentageAfter: m.ownershipPercentageAfter,
      contributionId: m.contributionId, tokenPolicyVersion: m.tokenPolicyVersion,
      approvedBy: m.approvedBy, proposalId: m.proposalId, relatedParty: m.relatedParty,
    },
  };
}

function reversalToUnified(r: ReversalLedgerRow): UnifiedRow {
  return {
    sortKey: r.createdAt.getTime(),
    publicRecordId: r.publicRecordId,
    row: {
      ...ROW_DEFAULTS,
      id: r.id, eventType: 'reversal', time: r.createdAt.toISOString(), memberId: r.memberId,
      amount: r.amount, memberBalanceAfter: r.totalBalanceAfter, totalSupplyAfter: r.totalSupplyAfter,
      approvedBy: r.approvedBy, proposalId: r.proposalId, reason: r.reason,
    },
  };
}

export async function handleGetLedger(
  deps: CommunitiesDeps,
  input: { communityId: string; filter: string; page: number; limit: number },
): Promise<ApiResult> {
  if (!LEDGER_FILTERS.includes(input.filter as LedgerFilter)) {
    return fail(400, 'VALIDATION_ERROR', `Unknown ledger filter '${input.filter}'`);
  }
  const plan = planLedger(input.filter as LedgerFilter);

  // DB-side pagination: never materialize the full ledger. To page a merge of
  // two DESC-by-createdAt streams it suffices to pull each stream's top
  // (skip + limit) rows — any row in the global top (skip + limit) is also in
  // its own stream's top (skip + limit) — then merge, sort, and slice the
  // window. Totals come from DB count() aggregates, not from row materialization,
  // so an unauthenticated caller can no longer force loading/sorting all N rows.
  const skip = (input.page - 1) * input.limit;
  const take = skip + input.limit;

  // Injective filters: resolve the eligible record ids in the requested state,
  // then constrain both event streams to those ids. Because TokenMintEvent /
  // TokenReversalEvent carry only a scalar publicRecordId (no Prisma relation —
  // relation fields are forbidden on these models), the status filter cannot be
  // pushed into the event query and must be resolved via this id set. The scan
  // is bounded by the same page window (most-recent `take` records) and never
  // the full match set: the returned window is at most (skip + limit) rows, so
  // (skip + limit) record ids suffice to back it. This keeps an unauthenticated
  // caller from forcing every matching record id into memory / the SQL in-list.
  let recordIdConstraint: Record<string, unknown> = {};
  if (plan.injective !== undefined) {
    const recs = (await deps.db.publicRecord.findMany({
      where: {
        communityId: input.communityId,
        status: plan.injective,
        recordType: { in: ['token_mint', 'advance_mint', 'token_reversal'] },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true },
    })) as Array<{ id: string }>;
    recordIdConstraint = { publicRecordId: { in: recs.map((r) => r.id) } };
  }

  const mintWhere = { communityId: input.communityId, ...plan.mintExtra, ...recordIdConstraint };
  const reversalWhere = { communityId: input.communityId, ...recordIdConstraint };

  // Totals must reflect the true match count, never the page window. For
  // non-injective filters the event count() over its own where is exact. For
  // injective filters the event where carries the bounded recordId in-list
  // (<= take ids), so counting events against it would clamp the total to the
  // window; instead count the eligible PublicRecords directly — an aggregate
  // (no row materialization, no DoS) — partitioned by recordType to match how
  // each resolved id maps to a stream (token_mint/advance_mint -> mint,
  // token_reversal -> reversal).
  const mintTotalP: Promise<number> = !plan.mint
    ? Promise.resolve(0)
    : plan.injective !== undefined
      ? deps.db.publicRecord.count({
          where: {
            communityId: input.communityId,
            status: plan.injective,
            recordType: { in: ['token_mint', 'advance_mint'] },
          },
        })
      : deps.db.tokenMintEvent.count({ where: mintWhere });
  const reversalTotalP: Promise<number> = !plan.reversal
    ? Promise.resolve(0)
    : plan.injective !== undefined
      ? deps.db.publicRecord.count({
          where: {
            communityId: input.communityId,
            status: plan.injective,
            recordType: 'token_reversal',
          },
        })
      : deps.db.tokenReversalEvent.count({ where: reversalWhere });

  const [mints, mintTotal, reversals, reversalTotal] = await Promise.all([
    plan.mint
      ? (deps.db.tokenMintEvent.findMany({ where: mintWhere, orderBy: { createdAt: 'desc' }, take }) as Promise<MintLedgerRow[]>)
      : Promise.resolve<MintLedgerRow[]>([]),
    mintTotalP,
    plan.reversal
      ? (deps.db.tokenReversalEvent.findMany({ where: reversalWhere, orderBy: { createdAt: 'desc' }, take }) as Promise<ReversalLedgerRow[]>)
      : Promise.resolve<ReversalLedgerRow[]>([]),
    reversalTotalP,
  ]);

  const unified = [...mints.map(mintToUnified), ...reversals.map(reversalToUnified)].sort(
    (a, b) => b.sortKey - a.sortKey,
  );
  const total = mintTotal + reversalTotal;
  const pageRows = unified.slice(skip, skip + input.limit);

  // Resolve injectiveStatus + txHash for the page's rows from their records.
  const recordIds = pageRows.map((u) => u.publicRecordId).filter((id): id is string => id !== null);
  const records =
    recordIds.length > 0
      ? ((await deps.db.publicRecord.findMany({
          where: { id: { in: recordIds } },
          select: { id: true, status: true, txHash: true },
        })) as Array<{ id: string; status: string; txHash: string | null }>)
      : [];
  const recordById = new Map(records.map((r) => [r.id, r]));

  const data = pageRows.map((u) => {
    const rec = u.publicRecordId !== null ? recordById.get(u.publicRecordId) : undefined;
    return { ...u.row, injectiveStatus: injectiveStatus(rec?.status), txHash: rec?.txHash ?? null };
  });

  return ok(data, 200, meta(total, input.page, input.limit));
}
