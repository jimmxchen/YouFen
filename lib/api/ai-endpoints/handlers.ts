// Pure handlers for the two advisory AI endpoints (ARCHITECTURE §9.2 / §9.4,
// PRD §23.1 / §23.3):
//   POST /api/ai/token-rules              — draft contribution rules (never persisted)
//   GET  /api/token-epochs/:id/health-report — epoch inflation health report
//
// Both are (deps, input) => Promise<ApiResult> pure functions with every
// collaborator injected, so they are fully unit-testable with structural fakes
// and touch neither the ledger write path nor any network. The AI service layer
// (lib/ai) is contractually non-throwing and returns an advisory `degraded`
// envelope; these handlers surface that as an HTTP 200 with a `degraded` flag —
// a missing/failed model never fails the request, it degrades it.

import { z } from 'zod';

import {
  generateHealthReport,
  generateTokenRules,
  type ClaudeClient,
  type EpochHealthInput,
  type GeneratedTokenRule,
} from '../../ai';
import {
  fail,
  ok,
  mapEngineError,
  zId,
  type ApiResult,
  type AuthContext,
  type AuthorizeAdminFn,
} from '../core';
import type { RateLimiter } from '../public-records/rate-limit';

// The generated rules are drafts only; they are surfaced to an admin who must run
// them through the deterministic policy-change flow before anything is written.
const DRAFT_MESSAGE =
  '以下规则为 AI 草案，未写入账本；需经 policy 变更流程审批后方可落库。';

/** POST body: community context the rule generator needs. */
export const tokenRulesBodySchema = z.object({
  communityId: zId,
  communityType: z.string().min(1),
  communityGoal: z.string().min(1),
  description: z.string().min(1).optional(),
});

export type TokenRulesBody = z.infer<typeof tokenRulesBodySchema>;

export interface TokenRulesDeps {
  readonly client: ClaudeClient;
  readonly authorize: AuthorizeAdminFn;
  readonly rateLimiter: RateLimiter;
}

/** Deterministic epoch snapshot plus the fields the handler gates on. */
export interface EpochHealthData {
  readonly communityId: string;
  readonly status: string;
  readonly input: EpochHealthInput;
}

/** Read port: assembles the deterministic epoch health input from the DB. */
export interface EpochHealthReader {
  load(epochId: string): Promise<EpochHealthData | null>;
}

export interface HealthReportDeps {
  readonly client: ClaudeClient;
  readonly authorize: AuthorizeAdminFn;
  readonly rateLimiter: RateLimiter;
  readonly reader: EpochHealthReader;
}

/** Per-actor rate-limit key. Internal callers without an actor share one bucket. */
function rateKey(ctx: AuthContext): string {
  return ctx.actorId ?? 'internal';
}

/**
 * POST /api/ai/token-rules — admin-only. Authorize, then rate-limit per actor,
 * then ask the model for a draft rule set. The result is always 200: an
 * unavailable model degrades to an empty rule list with `degraded: true`. Nothing
 * is ever written to the ledger here.
 */
export async function handleTokenRules(
  deps: TokenRulesDeps,
  input: { body: TokenRulesBody; ctx: AuthContext },
): Promise<ApiResult> {
  try {
    const allowed = await deps.authorize(input.ctx, input.body.communityId);
    if (!allowed) {
      return fail(403, 'FORBIDDEN', 'Admin authorization required');
    }

    if (!deps.rateLimiter.allow(rateKey(input.ctx))) {
      return fail(429, 'RATE_LIMITED', 'Too many AI requests; try again later');
    }

    const result = await generateTokenRules(deps.client, {
      communityType: input.body.communityType,
      communityGoal: input.body.communityGoal,
      description: input.body.description,
    });

    const rules: readonly GeneratedTokenRule[] = result.data ?? [];
    return ok({ rules, degraded: result.degraded, message: DRAFT_MESSAGE });
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}

/**
 * GET /api/token-epochs/:id/health-report — admin-only. The epoch must be closed
 * (else 409). Load the deterministic snapshot, authorize against its community,
 * rate-limit, then compose the report. Metrics are always code-computed; the LLM
 * only shapes the narrative, and its absence degrades the response to a
 * deterministic template (still 200, `degraded: true`).
 */
export async function handleHealthReport(
  deps: HealthReportDeps,
  input: { epochId: string; ctx: AuthContext },
): Promise<ApiResult> {
  try {
    const data = await deps.reader.load(input.epochId);
    if (data === null) {
      return fail(404, 'NOT_FOUND', `Token epoch '${input.epochId}' not found`);
    }

    const allowed = await deps.authorize(input.ctx, data.communityId);
    if (!allowed) {
      return fail(403, 'FORBIDDEN', 'Admin authorization required');
    }

    if (data.status !== 'closed') {
      return fail(
        409,
        'INVALID_STATUS',
        `Epoch is '${data.status}', expected 'closed' before a health report`,
      );
    }

    if (!deps.rateLimiter.allow(rateKey(input.ctx))) {
      return fail(429, 'RATE_LIMITED', 'Too many AI requests; try again later');
    }

    const result = await generateHealthReport(deps.client, data.input);
    // generateHealthReport always attaches metrics + a deterministic report, even
    // on the degraded arm, so data is non-null here; guard for type-safety only.
    if (result.data === null) {
      return fail(503, 'AI_UNAVAILABLE', 'Health report is temporarily unavailable');
    }
    return ok({
      reportText: result.data.reportText,
      metrics: result.data.metrics,
      degraded: result.degraded,
    });
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}
