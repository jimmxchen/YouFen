// Real-dependency resolvers for the two AI endpoints (W5-7). Each wires a Claude
// client (createAnthropicClient in production, a degraded stub when no API key is
// configured), the shared per-actor rate limiter (createRateLimiter, imported
// read-only from the public-records group), the default admin policy, and — for
// the health report — a Prisma-backed epoch snapshot reader. Route adapters call
// resolveTokenRulesDeps() / resolveHealthReportDeps(); tests inject fakes via
// setDepsForTesting.
//
// AI is advisory and this layer never imports any ledger write function
// (architecture rule: the AI module writes nothing). The health reader is a pure
// read: it only queries snapshot tables to build the deterministic input.

import {
  createAnthropicClient,
  resolveModelId,
  type ClaudeClient,
  type DistributionSlice,
  type EpochHealthInput,
} from '../../ai';
import { getPrisma } from '../../db/client';
import { defaultAuthorizeAdmin } from '../core';
import { createRateLimiter, type RateLimiter } from '../public-records/rate-limit';

import type {
  EpochHealthData,
  EpochHealthReader,
  HealthReportDeps,
  TokenRulesDeps,
} from './handlers';

// Per-actor AI budget (ARCHITECTURE §9.5): 20 requests / hour / actor.
const AI_RATE_LIMIT = 20;
const ONE_HOUR_MS = 3_600_000;
const BPS_DENOMINATOR = 10_000n;

/**
 * Degraded client used when ANTHROPIC_API_KEY is absent: every call rejects, so
 * the non-throwing AI layer collapses to a `degraded` result and the endpoints
 * still answer 200 with deterministic-only data. Keeps the Web process usable
 * without an API key configured.
 */
const AI_UNAVAILABLE_CLIENT: ClaudeClient = {
  complete: () =>
    Promise.reject(new Error('AI unavailable: ANTHROPIC_API_KEY is not configured')),
};

/** Real Anthropic client when a key is present, else the degraded stub. */
function resolveClaudeClient(): ClaudeClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    return AI_UNAVAILABLE_CLIENT;
  }
  return createAnthropicClient({ apiKey, modelId: resolveModelId() });
}

// Process-level singleton so every AI request shares one sliding window.
let aiRateLimiter: RateLimiter | null = null;

/** Lazily-constructed shared per-actor limiter for the AI endpoints. */
function getAiRateLimiter(): RateLimiter {
  if (aiRateLimiter === null) {
    aiRateLimiter = createRateLimiter({ limit: AI_RATE_LIMIT, windowMs: ONE_HOUR_MS });
  }
  return aiRateLimiter;
}

/** amount / base in bps (floored); base <= 0 -> 0. Mirrors lib/ai/health-report. */
function bpsOf(amount: bigint, base: bigint): number {
  if (base <= 0n) {
    return 0;
  }
  return Number((amount * BPS_DENOMINATOR) / base);
}

// Minimal structural view of the Prisma delegates the reader touches, so this
// file needs no generated-type import and stays offline-testable.
interface EpochRow {
  readonly communityId: string;
  readonly epochNumber: number;
  readonly status: string;
  readonly openingSupply: bigint;
  readonly inflationRateBps: number;
  readonly regularMintedAmount: bigint;
  readonly advancedMintedAmount: bigint;
  readonly advanceDebtFromPreviousEpoch: bigint;
}
interface BalanceRow {
  readonly activeGovernanceBalance: bigint;
}
interface MintGroupRow {
  readonly mintType: string;
  readonly _sum: { readonly amount: bigint | null };
}
interface HealthPrisma {
  tokenEpoch: {
    findUnique(args: unknown): Promise<EpochRow | null>;
  };
  community: {
    findUnique(args: unknown): Promise<{ name: string } | null>;
  };
  communityTokenState: {
    findUnique(args: unknown): Promise<{ currentTotalSupply: bigint } | null>;
  };
  memberTokenBalance: {
    findMany(args: unknown): Promise<readonly BalanceRow[]>;
  };
  tokenMintEvent: {
    groupBy(args: unknown): Promise<readonly MintGroupRow[]>;
  };
}

/**
 * Assemble the deterministic {@link EpochHealthInput} from snapshot tables. Top-3
 * concentration is Σ(top-3 activeGovernanceBalance) / currentTotalSupply in bps.
 * The previous epoch's concentration is not reconstructable (balances are current
 * state, not per-epoch snapshots), so it is reported as null.
 */
function buildEpochHealthInput(
  epoch: EpochRow,
  communityName: string,
  currentTotalSupply: bigint,
  topBalances: readonly BalanceRow[],
  grouped: readonly MintGroupRow[],
): EpochHealthInput {
  const topThreeSum = topBalances.reduce((acc, b) => acc + b.activeGovernanceBalance, 0n);
  const distribution: readonly DistributionSlice[] = grouped.map((g) => ({
    label: g.mintType,
    amount: g._sum.amount ?? 0n,
  }));
  return {
    communityName,
    epochNumber: epoch.epochNumber,
    openingSupply: epoch.openingSupply,
    regularMintedAmount: epoch.regularMintedAmount,
    advancedMintedAmount: epoch.advancedMintedAmount,
    advanceDebt: epoch.advanceDebtFromPreviousEpoch,
    inflationRateBps: epoch.inflationRateBps,
    distribution,
    topThreeConcentrationBps: bpsOf(topThreeSum, currentTotalSupply),
    previousTopThreeConcentrationBps: null,
  };
}

/** Prisma-backed reader: one epoch lookup, then parallel snapshot reads. */
function createPrismaEpochHealthReader(): EpochHealthReader {
  return {
    async load(epochId: string): Promise<EpochHealthData | null> {
      const prisma = getPrisma() as unknown as HealthPrisma;
      const epoch = await prisma.tokenEpoch.findUnique({ where: { id: epochId } });
      if (epoch === null) {
        return null;
      }

      const [community, state, topBalances, grouped] = await Promise.all([
        prisma.community.findUnique({ where: { id: epoch.communityId } }),
        prisma.communityTokenState.findUnique({
          where: { communityId: epoch.communityId },
        }),
        prisma.memberTokenBalance.findMany({
          where: { communityId: epoch.communityId },
          orderBy: { activeGovernanceBalance: 'desc' },
          take: 3,
        }),
        prisma.tokenMintEvent.groupBy({
          by: ['mintType'],
          where: { epochId },
          _sum: { amount: true },
        }),
      ]);

      const input = buildEpochHealthInput(
        epoch,
        community?.name ?? epoch.communityId,
        state?.currentTotalSupply ?? 0n,
        topBalances,
        grouped,
      );
      return { communityId: epoch.communityId, status: epoch.status, input };
    },
  };
}

// ---- Test seams + resolvers ----

let tokenRulesOverride: TokenRulesDeps | null = null;
let healthReportOverride: HealthReportDeps | null = null;

/** Test seam: inject fake deps for either endpoint (or clear both with null). */
export function setDepsForTesting(
  deps: {
    readonly tokenRules?: TokenRulesDeps | null;
    readonly healthReport?: HealthReportDeps | null;
  } | null,
): void {
  if (deps === null) {
    tokenRulesOverride = null;
    healthReportOverride = null;
    return;
  }
  if (deps.tokenRules !== undefined) {
    tokenRulesOverride = deps.tokenRules;
  }
  if (deps.healthReport !== undefined) {
    healthReportOverride = deps.healthReport;
  }
}

/** Resolve real deps for POST /api/ai/token-rules. */
export function resolveTokenRulesDeps(): TokenRulesDeps {
  if (tokenRulesOverride !== null) {
    return tokenRulesOverride;
  }
  return {
    client: resolveClaudeClient(),
    authorize: defaultAuthorizeAdmin,
    rateLimiter: getAiRateLimiter(),
  };
}

/** Resolve real deps for GET /api/token-epochs/:id/health-report. */
export function resolveHealthReportDeps(): HealthReportDeps {
  if (healthReportOverride !== null) {
    return healthReportOverride;
  }
  return {
    client: resolveClaudeClient(),
    authorize: defaultAuthorizeAdmin,
    rateLimiter: getAiRateLimiter(),
    reader: createPrismaEpochHealthReader(),
  };
}
