import { describe, expect, it } from 'vitest';

import type { ClaudeClient } from '../../ai';
import type { EpochHealthInput } from '../../ai';
import type { AuthContext } from '../core';
import type { RateLimiter } from '../public-records/rate-limit';

import {
  handleHealthReport,
  handleTokenRules,
  type EpochHealthData,
  type EpochHealthReader,
  type HealthReportDeps,
  type TokenRulesBody,
  type TokenRulesDeps,
} from './handlers';

// ---- Fakes (test-offline rule: no real Anthropic/DB/network) ----

function fakeClient(text: string): ClaudeClient {
  return { complete: async () => text };
}

function unavailableClient(): ClaudeClient {
  return {
    complete: async () => {
      throw new Error('network down');
    },
  };
}

const allowLimiter: RateLimiter = { allow: () => true };
const denyLimiter: RateLimiter = { allow: () => false };

const adminCtx: AuthContext = { actorId: 'admin_1', isAdmin: true, isInternal: false };
const memberCtx: AuthContext = { actorId: 'user_9', isAdmin: false, isInternal: false };

const allowAdmin = (): boolean => true;
const denyAdmin = (): boolean => false;

function rulesBody(overrides: Partial<TokenRulesBody> = {}): TokenRulesBody {
  return {
    communityId: 'c_1',
    communityType: 'hackathon',
    communityGoal: 'ship projects',
    ...overrides,
  };
}

function tokenRulesDeps(overrides: Partial<TokenRulesDeps> = {}): TokenRulesDeps {
  return {
    client: fakeClient(
      JSON.stringify([
        {
          name: 'Help other members',
          description: 'Assist another member with their work',
          tokenAmount: 50,
          evidenceRequired: true,
          abuseRisk: 'low',
          reasoning: 'peer support is core to the community',
        },
        {
          name: 'Mentor',
          description: 'Act as a mentor for the epoch',
          tokenAmount: 300,
          evidenceRequired: false,
          abuseRisk: 'medium',
          reasoning: 'high leverage contribution',
        },
      ]),
    ),
    authorize: allowAdmin,
    rateLimiter: allowLimiter,
    ...overrides,
  };
}

const healthInput: EpochHealthInput = {
  communityName: 'Test DAO',
  epochNumber: 3,
  openingSupply: 100_000n,
  regularMintedAmount: 5_000n,
  advancedMintedAmount: 0n,
  advanceDebt: 250n,
  inflationRateBps: 500,
  distribution: [
    { label: 'contribution', amount: 4_000n },
    { label: 'special_reward', amount: 1_000n },
  ],
  topThreeConcentrationBps: 3_000,
  previousTopThreeConcentrationBps: null,
};

function reader(data: EpochHealthData | null): EpochHealthReader {
  return { load: async () => data };
}

function healthData(overrides: Partial<EpochHealthData> = {}): EpochHealthData {
  return { communityId: 'c_1', status: 'closed', input: healthInput, ...overrides };
}

function healthReportDeps(overrides: Partial<HealthReportDeps> = {}): HealthReportDeps {
  return {
    client: fakeClient(JSON.stringify({ reportText: 'Narrative report body' })),
    authorize: allowAdmin,
    rateLimiter: allowLimiter,
    reader: reader(healthData()),
    ...overrides,
  };
}

// ---- POST /api/ai/token-rules ----

describe('handleTokenRules', () => {
  it('403 when the caller is not an admin', async () => {
    const res = await handleTokenRules(tokenRulesDeps({ authorize: denyAdmin }), {
      body: rulesBody(),
      ctx: memberCtx,
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('429 when the actor is over the rate limit', async () => {
    const res = await handleTokenRules(tokenRulesDeps({ rateLimiter: denyLimiter }), {
      body: rulesBody(),
      ctx: adminCtx,
    });
    expect(res.status).toBe(429);
    expect(res.body.error?.code).toBe('RATE_LIMITED');
  });

  it('200 with validated rules and degraded=false; response notes the policy flow', async () => {
    const res = await handleTokenRules(tokenRulesDeps(), { body: rulesBody(), ctx: adminCtx });
    expect(res.status).toBe(200);
    const data = res.body.data as { rules: unknown[]; degraded: boolean; message: string };
    expect(data.degraded).toBe(false);
    expect(data.rules).toHaveLength(2);
    expect(typeof data.message).toBe('string');
    expect(data.message.length).toBeGreaterThan(0);
  });

  it('200 degraded=true with empty rules when the model is unavailable', async () => {
    const res = await handleTokenRules(tokenRulesDeps({ client: unavailableClient() }), {
      body: rulesBody(),
      ctx: adminCtx,
    });
    expect(res.status).toBe(200);
    const data = res.body.data as { rules: unknown[]; degraded: boolean };
    expect(data.degraded).toBe(true);
    expect(data.rules).toEqual([]);
  });

  it('does not consult the rate limiter before authorization', async () => {
    let consulted = false;
    const spyLimiter: RateLimiter = {
      allow: () => {
        consulted = true;
        return true;
      },
    };
    await handleTokenRules(
      tokenRulesDeps({ authorize: denyAdmin, rateLimiter: spyLimiter }),
      { body: rulesBody(), ctx: memberCtx },
    );
    expect(consulted).toBe(false);
  });
});

// ---- GET /api/token-epochs/:id/health-report ----

describe('handleHealthReport', () => {
  it('404 when the epoch does not exist', async () => {
    const res = await handleHealthReport(healthReportDeps({ reader: reader(null) }), {
      epochId: 'ghost',
      ctx: adminCtx,
    });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('403 when the caller is not an admin', async () => {
    const res = await handleHealthReport(healthReportDeps({ authorize: denyAdmin }), {
      epochId: 'e_1',
      ctx: memberCtx,
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('409 when the epoch is not closed', async () => {
    const res = await handleHealthReport(
      healthReportDeps({ reader: reader(healthData({ status: 'active' })) }),
      { epochId: 'e_1', ctx: adminCtx },
    );
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_STATUS');
  });

  it('429 when the actor is over the rate limit', async () => {
    const res = await handleHealthReport(healthReportDeps({ rateLimiter: denyLimiter }), {
      epochId: 'e_1',
      ctx: adminCtx,
    });
    expect(res.status).toBe(429);
    expect(res.body.error?.code).toBe('RATE_LIMITED');
  });

  it('200 with the LLM narrative and metrics when the model responds', async () => {
    const res = await handleHealthReport(healthReportDeps(), { epochId: 'e_1', ctx: adminCtx });
    expect(res.status).toBe(200);
    const data = res.body.data as {
      reportText: string;
      metrics: { advanceDebt: string };
      degraded: boolean;
    };
    expect(data.degraded).toBe(false);
    expect(data.reportText).toBe('Narrative report body');
    // bigint advanceDebt is serialized to a decimal string by jsonSafe.
    expect(data.metrics.advanceDebt).toBe('250');
  });

  it('200 degraded=true with deterministic metrics when the model is unavailable', async () => {
    const res = await handleHealthReport(
      healthReportDeps({ client: unavailableClient() }),
      { epochId: 'e_1', ctx: adminCtx },
    );
    expect(res.status).toBe(200);
    const data = res.body.data as {
      reportText: string;
      metrics: { advanceDebt: string };
      degraded: boolean;
    };
    expect(data.degraded).toBe(true);
    expect(data.reportText.length).toBeGreaterThan(0);
    expect(data.metrics.advanceDebt).toBe('250');
  });

  it('does not consult the rate limiter for a non-closed epoch', async () => {
    let consulted = false;
    const spyLimiter: RateLimiter = {
      allow: () => {
        consulted = true;
        return true;
      },
    };
    await handleHealthReport(
      healthReportDeps({
        rateLimiter: spyLimiter,
        reader: reader(healthData({ status: 'active' })),
      }),
      { epochId: 'e_1', ctx: adminCtx },
    );
    expect(consulted).toBe(false);
  });
});
