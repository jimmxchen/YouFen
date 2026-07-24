// Real dependency resolver for the contributions endpoint group (W5-1). Wires
// the pure handlers to production collaborators: the engine MintService + policy
// reads from the shared runtime, a Prisma-backed ContributionsDb + idempotency
// store, the default community-admin policy, and a lazily-built Claude client
// (createAnthropicClient when ANTHROPIC_API_KEY is set, else a degraded stub that
// makes analyzeContribution fall back to a deterministic-only analysis).
//
// Mirrors the resolve<group>Deps() / setDepsForTesting() seam every W5 group
// exposes (conventions §API-endpoint-group). This module reads no raw SQL: all
// writes go through Prisma delegate methods (create / updateMany) or the engine.

import { createAnthropicClient, resolveModelId, type ClaudeClient } from '../../ai';
import { getPrisma } from '../../db/client';
import { getEngineRuntime } from '../../engine/runtime';
import type { PolicyService } from '../../engine/types';
import { resolveAuthFromHeaders, type AuthContext, type AuthEnv, type HeaderReader } from '../core/auth';
import { defaultAuthorizeAdmin } from '../core/auth';
import {
  createPrismaIdempotencyStore,
  type PrismaIdempotencyDb,
} from '../core/idempotency';

import type {
  ApprovePatch,
  BalanceContext,
  ContributionRow,
  ContributionsDb,
  ContributionsDeps,
  CreateContributionData,
  EpochContext,
  MintEventSummary,
  PolicyContext,
} from './handlers';

// ---- Structural Prisma shape (avoids a hard @prisma/client type dependency) --

interface RawContribution {
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
  readonly evidence: string[];
  readonly submittedBy: string;
}

interface RawEpoch {
  readonly epochNumber: number;
  readonly baseMintBudget: bigint;
  readonly effectiveRegularBudget: bigint;
  readonly regularMintedAmount: bigint;
  readonly advancedMintedAmount: bigint;
  readonly maxAdvanceAmount: bigint;
  readonly advanceDebtFromPreviousEpoch: bigint;
}

interface RawMintEvent {
  readonly id: string;
  readonly amount: bigint;
  readonly budgetSource: string;
  readonly governanceStatus: string;
  readonly publicRecordId: string | null;
}

interface PrismaLike {
  readonly contribution: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string; status: string }>;
    findUnique(args: { where: { id: string } }): Promise<RawContribution | null>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  readonly tokenMintEvent: {
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
      orderBy?: Record<string, string>;
    }): Promise<RawMintEvent[]>;
  };
  readonly member: {
    findUnique(args: {
      where: { id: string };
    }): Promise<{ communityId: string; role: string } | null>;
  };
  readonly tokenEpoch: {
    findFirst(args: { where: Record<string, unknown> }): Promise<RawEpoch | null>;
  };
  readonly memberTokenBalance: {
    findUnique(args: {
      where: { communityId_memberId: { communityId: string; memberId: string } };
    }): Promise<{ tokensEarnedCurrentEpoch: bigint } | null>;
  };
}

// ---- ContributionsDb adapter --------------------------------------------

function toContributionRow(raw: RawContribution): ContributionRow {
  return {
    id: raw.id,
    communityId: raw.communityId,
    memberId: raw.memberId,
    description: raw.description,
    type: raw.type,
    ruleId: raw.ruleId,
    suggestedTokenAmount: raw.suggestedTokenAmount,
    approvedTokenAmount: raw.approvedTokenAmount,
    status: raw.status,
    aiReason: raw.aiReason,
    evidence: raw.evidence,
    submittedBy: raw.submittedBy,
  };
}

/** Build the Prisma-backed data access surface (policy reads via the engine). */
export function createContributionsDb(
  prisma: PrismaLike,
  policy: Pick<PolicyService, 'getCurrentPolicy'>,
): ContributionsDb {
  return {
    createContribution: (data: CreateContributionData) =>
      prisma.contribution.create({
        data: {
          communityId: data.communityId,
          memberId: data.memberId,
          description: data.description,
          type: data.type,
          suggestedTokenAmount: data.suggestedTokenAmount,
          evidence: [...data.evidence],
          submittedBy: data.submittedBy,
          status: 'pending',
        },
      }),

    findContribution: async (id: string) => {
      const raw = await prisma.contribution.findUnique({ where: { id } });
      return raw ? toContributionRow(raw) : null;
    },

    approveIfPending: async (id: string, patch: ApprovePatch) => {
      const { count } = await prisma.contribution.updateMany({
        where: { id, status: 'pending' },
        data: {
          status: 'approved',
          approvedTokenAmount: patch.approvedTokenAmount,
          ruleId: patch.ruleId,
          aiReason: patch.aiReason,
          reviewedBy: patch.reviewedBy,
          reviewedAt: patch.reviewedAt,
        },
      });
      return count;
    },

    rejectIfPending: async (id: string, reviewedBy: string | null, reviewedAt: Date) => {
      const { count } = await prisma.contribution.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'rejected', reviewedBy, reviewedAt },
      });
      return count;
    },

    findCurrentEpochMintEvents: (contributionId: string): Promise<readonly MintEventSummary[]> =>
      prisma.tokenMintEvent.findMany({
        where: { contributionId, budgetSource: 'current_epoch' },
        select: {
          id: true,
          amount: true,
          budgetSource: true,
          governanceStatus: true,
          publicRecordId: true,
        },
        orderBy: { ledgerSeq: 'asc' },
      }),

    findMemberRole: async (memberId: string) => {
      const member = await prisma.member.findUnique({ where: { id: memberId } });
      return member ? member.role : null;
    },

    findMemberContext: async (memberId: string) => {
      const member = await prisma.member.findUnique({ where: { id: memberId } });
      return member ? { communityId: member.communityId, role: member.role } : null;
    },

    findActiveEpoch: async (communityId: string): Promise<EpochContext | null> => {
      const epoch = await prisma.tokenEpoch.findFirst({
        where: { communityId, status: 'active' },
      });
      return epoch;
    },

    findBalance: async (communityId: string, memberId: string): Promise<BalanceContext | null> => {
      const balance = await prisma.memberTokenBalance.findUnique({
        where: { communityId_memberId: { communityId, memberId } },
      });
      return balance ? { tokensEarnedCurrentEpoch: balance.tokensEarnedCurrentEpoch } : null;
    },

    findCurrentPolicy: async (communityId: string): Promise<PolicyContext | null> => {
      const row = await policy.getCurrentPolicy(communityId);
      if (!row) return null;
      return {
        policyVersion: row.policyVersion,
        memberMintCapRateBps: row.memberMintCapRateBps,
        rules: row.rules,
      };
    },
  };
}

// ---- AI client -----------------------------------------------------------

/** Real Claude client when a key is configured; a degrading stub otherwise. */
function resolveAiClient(): ClaudeClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey !== undefined && apiKey.length > 0) {
    return createAnthropicClient({ apiKey, modelId: resolveModelId() });
  }
  return {
    complete: () =>
      Promise.reject(new Error('ANTHROPIC_API_KEY not configured; AI analysis is degraded')),
  };
}

// ---- Auth env ------------------------------------------------------------

function envOrNull(name: string): string | null {
  const value = process.env[name];
  return value !== undefined && value.length > 0 ? value : null;
}

/** The internal-auth env read at the route edge. */
export function resolveAuthEnv(): AuthEnv {
  return {
    internalApiToken: envOrNull('INTERNAL_API_TOKEN'),
    cronSecret: envOrNull('CRON_SECRET'),
  };
}

/** Convenience: resolve the AuthContext for a request's headers. */
export function resolveAuth(headers: HeaderReader): AuthContext {
  return resolveAuthFromHeaders(headers, resolveAuthEnv());
}

// ---- Resolver + test seam ------------------------------------------------

let testDeps: ContributionsDeps | null = null;

/** Test seam: inject contributions deps, or pass null to clear. */
export function setDepsForTesting(deps: ContributionsDeps | null): void {
  testDeps = deps;
}

/** Resolve the contributions deps, preferring test-injected ones. */
export async function resolveContributionsDeps(): Promise<ContributionsDeps> {
  if (testDeps !== null) {
    return testDeps;
  }
  const runtime = await getEngineRuntime();
  const prisma = getPrisma() as unknown as PrismaLike;
  return {
    db: createContributionsDb(prisma, runtime.policy),
    mint: runtime.mint,
    idempotency: createPrismaIdempotencyStore(
      getPrisma() as unknown as PrismaIdempotencyDb,
    ),
    authorizeAdmin: defaultAuthorizeAdmin,
    aiClient: resolveAiClient(),
    now: () => new Date(),
  };
}
