// Pure Contributions API handlers (PRD §27, conventions §API-endpoint-group).
// Five endpoints for the contribution mint lifecycle:
//   POST /api/contributions            create (member, Idempotency-Key required)
//   POST /api/contributions/:id/analyze  read-only AI analysis (admin, §8.3)
//   POST /api/contributions/:id/approve  approve + persist aiReason (admin)
//   POST /api/contributions/:id/mint     execute the engine mint (admin)
//   POST /api/contributions/:id/reject   reject a pending contribution (admin)
//
// Every handler is a (deps, input) => Promise<ApiResult> pure function with all
// collaborators injected, so it imports nothing from the runtime and is fully
// unit-testable with structural fakes. Route adapters wire real deps.
//
// analyze is strictly read-only (red-team §8.3): it computes the deterministic
// mint context and calls lib/ai, but writes NOTHING (aiReason is carried by the
// approver on /approve instead). The ledger write path lives entirely behind
// deps.mint (the engine MintService); this module never touches raw SQL.

import { z } from 'zod';

import { analyzeContribution } from '../../ai';
import type {
  AiResult,
  ContributionAnalysis,
  DeterministicMintContext,
  RuleWithId,
} from '../../ai';
import type { ClaudeClient } from '../../ai';
import { calculateMemberEpochCap } from '../../engine/calc';
import type { MintService } from '../../engine/types';
import type { AuthContext, AuthorizeAdminFn } from '../core/auth';
import { requireVerifiedActor } from '../core/auth';
import {
  hashRequestBody,
  withIdempotency,
  type IdempotencyStore,
} from '../core/idempotency';
import { fail, mapEngineError, ok, type ApiResult } from '../core/respond';
import { parseBody, zBigIntAmount, zId } from '../core/validation';

// ---- Injected ports ------------------------------------------------------

/** A contribution row, in the subset these handlers read. */
export interface ContributionRow {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: string;
  readonly description: string;
  readonly type: string | null;
  readonly ruleId: string | null;
  readonly suggestedTokenAmount: bigint;
  readonly approvedTokenAmount: bigint | null;
  readonly status: string;
  readonly aiReason: string | null;
  readonly evidence: readonly string[];
  readonly submittedBy: string;
}

/** One current-epoch mint event, as returned to the ALREADY_MINTED replay. */
export interface MintEventSummary {
  readonly id: string;
  readonly amount: bigint;
  readonly budgetSource: string;
  readonly governanceStatus: string;
  readonly publicRecordId: string | null;
}

/** The active-epoch fields feeding the deterministic context. */
export interface EpochContext {
  readonly epochNumber: number;
  readonly baseMintBudget: bigint;
  readonly effectiveRegularBudget: bigint;
  readonly regularMintedAmount: bigint;
  readonly advancedMintedAmount: bigint;
  readonly maxAdvanceAmount: bigint;
  readonly advanceDebtFromPreviousEpoch: bigint;
}

/** The member-balance fields feeding the deterministic context. */
export interface BalanceContext {
  readonly tokensEarnedCurrentEpoch: bigint;
}

/** The current-policy fields feeding rules + the deterministic context. */
export interface PolicyContext {
  readonly policyVersion: number;
  readonly memberMintCapRateBps: number;
  readonly rules: unknown;
}

export interface CreateContributionData {
  readonly communityId: string;
  readonly memberId: string;
  readonly description: string;
  readonly type: string | null;
  readonly suggestedTokenAmount: bigint;
  readonly evidence: readonly string[];
  readonly submittedBy: string;
}

export interface ApprovePatch {
  readonly approvedTokenAmount: bigint;
  readonly ruleId: string;
  readonly aiReason: string | null;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date;
}

/** The data-access surface the handlers depend on (Prisma-backed in prod). */
export interface ContributionsDb {
  createContribution(data: CreateContributionData): Promise<{ id: string; status: string }>;
  findContribution(id: string): Promise<ContributionRow | null>;
  /** Conditional 'pending' -> 'approved'; returns rows affected (0 or 1). */
  approveIfPending(id: string, patch: ApprovePatch): Promise<number>;
  /** Conditional 'pending' -> 'rejected'; returns rows affected (0 or 1). */
  rejectIfPending(id: string, reviewedBy: string | null, reviewedAt: Date): Promise<number>;
  findCurrentEpochMintEvents(contributionId: string): Promise<readonly MintEventSummary[]>;
  findMemberRole(memberId: string): Promise<string | null>;
  /** 第二审批人资格校验：返回成员的社区归属与角色（不存在则 null）。 */
  findMemberContext(memberId: string): Promise<{ communityId: string; role: string } | null>;
  findActiveEpoch(communityId: string): Promise<EpochContext | null>;
  findBalance(communityId: string, memberId: string): Promise<BalanceContext | null>;
  findCurrentPolicy(communityId: string): Promise<PolicyContext | null>;
}

/** The engine mint surface the mint handler touches. */
export type MintPort = Pick<MintService, 'mintForContribution'>;

export interface ContributionsDeps {
  readonly db: ContributionsDb;
  readonly mint: MintPort;
  readonly idempotency: IdempotencyStore;
  readonly authorizeAdmin: AuthorizeAdminFn;
  readonly aiClient: ClaudeClient;
  readonly now: () => Date;
}

// ---- Request schemas -----------------------------------------------------

const createSchema = z.object({
  communityId: zId,
  memberId: zId,
  description: z.string().min(1).max(2000),
  type: z.string().optional(),
  suggestedTokenAmount: zBigIntAmount,
  evidence: z.array(z.string()).optional(),
  submittedBy: zId,
});

const approveSchema = z.object({
  approvedTokenAmount: zBigIntAmount,
  ruleId: zId,
  aiReason: z.string().optional(),
  note: z.string().optional(),
});

const mintSchema = z.object({
  secondApproverId: z.string().min(1).optional(),
  proposalId: z.string().min(1).optional(),
  advanceRequestId: z.string().min(1).optional(),
});

// ---- Input shapes --------------------------------------------------------

export interface CreateInput {
  readonly body: unknown;
  readonly auth: AuthContext;
  readonly idempotencyKey: string | null;
}

export interface IdInput {
  readonly contributionId: string;
  readonly auth: AuthContext;
}

export interface BodyInput {
  readonly contributionId: string;
  readonly body: unknown;
  readonly auth: AuthContext;
}

// ---- Helpers -------------------------------------------------------------

const RELATED_PARTY_ROLES: ReadonlySet<string> = new Set(['owner', 'manager']);
/** 有资格担任第二审批人的角色（与关联方角色同口径：社区管理层）。 */
const ADMIN_ROLES: ReadonlySet<string> = new Set(['owner', 'manager']);
const CONTRIBUTIONS_ENDPOINT = 'POST /api/contributions';
const ADVANCE_PATH = 'POST /api/token-advances';

/** Any non-anonymous caller (a member, admin, or internal service). */
function isAuthenticated(ctx: AuthContext): boolean {
  return ctx.actorId !== null || ctx.isAdmin || ctx.isInternal;
}

/** Extract a thrown EngineError's `code` string, else null. */
function engineErrorCode(e: unknown): string | null {
  if (e instanceof Error && 'code' in e) {
    const code = (e as Error & { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

/** Coerce a possibly-non-numeric stored value into a finite non-negative number. */
function toFiniteNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Map stored policy rules (JSON) into the RuleWithId[] the analyzer expects. */
function toRules(rules: unknown): RuleWithId[] {
  if (!Array.isArray(rules)) return [];
  const out: RuleWithId[] = [];
  for (const raw of rules) {
    if (raw === null || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : null;
    const name = typeof r.name === 'string' ? r.name : null;
    if (id === null || name === null) continue;
    out.push({
      id,
      name,
      description: typeof r.description === 'string' ? r.description : '',
      tokenAmount: toFiniteNumber(r.tokenAmount),
      evidenceRequired: r.evidenceRequired === true,
      abuseRisk: typeof r.abuseRisk === 'string' ? r.abuseRisk : '',
      reasoning: typeof r.reasoning === 'string' ? r.reasoning : '',
      ...(typeof r.repeatLimitPerEpoch === 'number'
        ? { repeatLimitPerEpoch: r.repeatLimitPerEpoch }
        : {}),
    });
  }
  return out;
}

/** Build the deterministic mint context read from epoch/balance/policy/member. */
function buildContext(
  policy: PolicyContext,
  epoch: EpochContext | null,
  balance: BalanceContext | null,
  role: string | null,
): DeterministicMintContext {
  const baseMintBudget = epoch?.baseMintBudget ?? 0n;
  const rawRemaining = epoch ? epoch.effectiveRegularBudget - epoch.regularMintedAmount : 0n;
  return {
    baseMintBudget,
    remainingRegularBudget: rawRemaining > 0n ? rawRemaining : 0n,
    memberEarnedThisEpoch: balance?.tokensEarnedCurrentEpoch ?? 0n,
    memberEpochCap: calculateMemberEpochCap(baseMintBudget, policy.memberMintCapRateBps),
    maxAdvanceAmount: epoch?.maxAdvanceAmount ?? 0n,
    advancedMintedThisEpoch: epoch?.advancedMintedAmount ?? 0n,
    hasOutstandingAdvance: (epoch?.advanceDebtFromPreviousEpoch ?? 0n) > 0n,
    isRelatedParty: role !== null && RELATED_PARTY_ROLES.has(role),
    policyVersion: policy.policyVersion,
    epochNumber: epoch?.epochNumber ?? 0,
  };
}

// ---- Handlers ------------------------------------------------------------

/**
 * POST /api/contributions — member-level. Idempotency-Key is required (missing
 * key -> 400 inside withIdempotency; a replay with the same body returns the
 * stored 201 without re-creating). Persists a pending contribution.
 */
export async function handleCreate(
  deps: ContributionsDeps,
  input: CreateInput,
): Promise<ApiResult> {
  if (!isAuthenticated(input.auth)) {
    return fail(403, 'FORBIDDEN', 'Authentication is required to submit a contribution');
  }
  const parsed = parseBody(createSchema, input.body);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  return withIdempotency(
    deps.idempotency,
    {
      endpoint: CONTRIBUTIONS_ENDPOINT,
      key: input.idempotencyKey,
      requestHash: hashRequestBody(input.body),
    },
    async () => {
      try {
        const created = await deps.db.createContribution({
          communityId: data.communityId,
          memberId: data.memberId,
          description: data.description,
          type: data.type ?? null,
          suggestedTokenAmount: data.suggestedTokenAmount,
          evidence: data.evidence ?? [],
          submittedBy: data.submittedBy,
        });
        return ok({ contributionId: created.id, status: created.status }, 201);
      } catch (error: unknown) {
        return mapEngineError(error);
      }
    },
  );
}

/**
 * POST /api/contributions/:id/analyze — admin, strictly read-only (§8.3). Reads
 * the contribution + policy + deterministic context and runs the AI analyzer.
 * Never writes: aiReason is NOT persisted here. Degrades to 200 with a
 * deterministic-only analysis when the AI client is unavailable.
 */
export async function handleAnalyze(
  deps: ContributionsDeps,
  input: IdInput,
): Promise<ApiResult> {
  const contribution = await deps.db.findContribution(input.contributionId);
  if (!contribution) {
    return fail(404, 'NOT_FOUND', `Contribution '${input.contributionId}' not found`);
  }
  if (!(await deps.authorizeAdmin(input.auth, contribution.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization is required');
  }
  const policy = await deps.db.findCurrentPolicy(contribution.communityId);
  if (!policy) {
    return fail(404, 'NOT_FOUND', 'Community token policy not found');
  }

  const [epoch, balance, role] = await Promise.all([
    deps.db.findActiveEpoch(contribution.communityId),
    deps.db.findBalance(contribution.communityId, contribution.memberId),
    deps.db.findMemberRole(contribution.memberId),
  ]);

  const context = buildContext(policy, epoch, balance, role);
  const result: AiResult<ContributionAnalysis> = await analyzeContribution(deps.aiClient, {
    description: contribution.description,
    evidenceUrls: contribution.evidence,
    rules: toRules(policy.rules),
    context,
  });

  return ok({ analysis: result.data, degraded: result.degraded });
}

/**
 * POST /api/contributions/:id/approve — admin. Conditional 'pending' ->
 * 'approved' write persisting approvedTokenAmount/ruleId/aiReason (red-team
 * revision: the approver carries the analysis conclusion, so aiReason is a live
 * column) plus reviewedBy/reviewedAt. Already-approved is an idempotent 200;
 * a rejected contribution is a 409.
 */
export async function handleApprove(
  deps: ContributionsDeps,
  input: BodyInput,
): Promise<ApiResult> {
  const contribution = await deps.db.findContribution(input.contributionId);
  if (!contribution) {
    return fail(404, 'NOT_FOUND', `Contribution '${input.contributionId}' not found`);
  }
  if (!(await deps.authorizeAdmin(input.auth, contribution.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization is required');
  }
  const parsed = parseBody(approveSchema, input.body);
  if (!parsed.ok) return parsed.response;
  const { approvedTokenAmount, ruleId, aiReason } = parsed.data;

  const count = await deps.db.approveIfPending(input.contributionId, {
    approvedTokenAmount,
    ruleId,
    aiReason: aiReason ?? null,
    reviewedBy: input.auth.actorId,
    reviewedAt: deps.now(),
  });
  if (count === 1) {
    return ok({
      contributionId: input.contributionId,
      status: 'approved',
      approvedTokenAmount,
      mintReady: true,
    });
  }

  const current = await deps.db.findContribution(input.contributionId);
  if (current && current.status === 'approved') {
    return ok({
      contributionId: input.contributionId,
      status: 'approved',
      approvedTokenAmount: current.approvedTokenAmount ?? 0n,
      mintReady: true,
    });
  }
  return fail(
    409,
    'INVALID_STATUS',
    `Contribution is '${current?.status ?? 'unknown'}', only a pending contribution can be approved`,
  );
}

/**
 * POST /api/contributions/:id/mint — admin. Delegates to the engine mint.
 * INSUFFICIENT_BUDGET -> 409 with an advancePath hint. ALREADY_MINTED -> replays
 * the existing current-epoch events with idempotent:true (§8.3). Success -> 201.
 */
export async function handleMint(
  deps: ContributionsDeps,
  input: BodyInput,
): Promise<ApiResult> {
  const contribution = await deps.db.findContribution(input.contributionId);
  if (!contribution) {
    return fail(404, 'NOT_FOUND', `Contribution '${input.contributionId}' not found`);
  }
  if (!(await deps.authorizeAdmin(input.auth, contribution.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization is required');
  }
  const parsed = parseBody(mintSchema, input.body);
  if (!parsed.ok) return parsed.response;
  const { secondApproverId, proposalId, advanceRequestId } = parsed.data;

  // Separation of duties (auth.ts §SEPARATION OF DUTIES): a distinct second
  // approver only satisfies dual-admin control when the approving admin is a
  // credential-bound (verified) principal, not a forgeable x-youfen-actor-id
  // header. Otherwise a single shared-token operator could name any distinct
  // secondApproverId and pass the engine's distinct-approver check for a
  // related-party mint (mint-service.ts:478). When no distinct approver is
  // asserted (a plain single-admin mint) the recorded approver stays the
  // authenticated actor unchanged.
  let approverId: string;
  if (secondApproverId !== undefined) {
    try {
      approverId = requireVerifiedActor(input.auth);
    } catch (e: unknown) {
      return mapEngineError(e);
    }
    // 被提名的第二审批人必须真实存在、属于本社区且为管理层角色——
    // 防止用任意字符串/非管理员/他社区成员通过引擎的 distinct 校验。
    // 完整的双凭证验证（第二人亲自登录确认）依赖 NextAuth 接线，见 HANDOFF。
    const second = await deps.db.findMemberContext(secondApproverId);
    if (
      !second ||
      second.communityId !== contribution.communityId ||
      !ADMIN_ROLES.has(second.role)
    ) {
      return fail(
        403,
        'SECOND_APPROVER_NOT_ADMIN',
        'secondApproverId must be an owner/manager member of this community',
      );
    }
  } else {
    approverId = input.auth.actorId ?? '';
  }

  try {
    const outcome = await deps.mint.mintForContribution({
      contributionId: input.contributionId,
      approverId,
      ...(secondApproverId !== undefined ? { secondApproverId } : {}),
      ...(proposalId !== undefined ? { proposalId } : {}),
      ...(advanceRequestId !== undefined ? { advanceRequestId } : {}),
    });
    return ok(
      {
        mintEvents: outcome.mintEvents,
        memberBalanceAfter: outcome.memberBalanceAfter,
        totalSupplyAfter: outcome.totalSupplyAfter,
      },
      201,
    );
  } catch (error: unknown) {
    const code = engineErrorCode(error);
    if (code === 'ALREADY_MINTED') {
      const mintEvents = await deps.db.findCurrentEpochMintEvents(input.contributionId);
      return ok({ mintEvents, idempotent: true });
    }
    if (code === 'INSUFFICIENT_BUDGET') {
      return fail(
        409,
        'INSUFFICIENT_BUDGET',
        error instanceof Error ? error.message : 'Insufficient regular budget',
        {
          advancePath: ADVANCE_PATH,
          hint: 'Regular budget is exhausted; open a token advance request and retry mint with advanceRequestId',
        },
      );
    }
    return mapEngineError(error);
  }
}

/**
 * POST /api/contributions/:id/reject — admin. Conditional 'pending' ->
 * 'rejected'; a repeat on an already-rejected contribution is an idempotent 200,
 * any other terminal state is a 409.
 */
export async function handleReject(
  deps: ContributionsDeps,
  input: IdInput,
): Promise<ApiResult> {
  const contribution = await deps.db.findContribution(input.contributionId);
  if (!contribution) {
    return fail(404, 'NOT_FOUND', `Contribution '${input.contributionId}' not found`);
  }
  if (!(await deps.authorizeAdmin(input.auth, contribution.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization is required');
  }

  const count = await deps.db.rejectIfPending(
    input.contributionId,
    input.auth.actorId,
    deps.now(),
  );
  if (count === 1) {
    return ok({ contributionId: input.contributionId, status: 'rejected' });
  }

  const current = await deps.db.findContribution(input.contributionId);
  if (current && current.status === 'rejected') {
    return ok({ contributionId: input.contributionId, status: 'rejected' });
  }
  return fail(
    409,
    'INVALID_STATUS',
    `Contribution is '${current?.status ?? 'unknown'}', only a pending contribution can be rejected`,
  );
}
