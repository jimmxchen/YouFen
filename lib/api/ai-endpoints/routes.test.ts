import { afterEach, describe, expect, it } from 'vitest';

import type { ClaudeClient, EpochHealthInput } from '../../ai';
import type { RateLimiter } from '../public-records/rate-limit';

import { POST as postTokenRules } from '../../../app/api/ai/token-rules/route';
import { GET as getHealthReport } from '../../../app/api/token-epochs/[id]/health-report/route';
import { setDepsForTesting } from './deps';
import type {
  EpochHealthData,
  EpochHealthReader,
  HealthReportDeps,
  TokenRulesDeps,
} from './handlers';

const allowLimiter: RateLimiter = { allow: () => true };

function fakeClient(text: string): ClaudeClient {
  return { complete: async () => text };
}

const tokenRulesDeps: TokenRulesDeps = {
  client: fakeClient(
    JSON.stringify([
      {
        name: 'Help other members',
        description: 'Assist another member',
        tokenAmount: 50,
        evidenceRequired: true,
        abuseRisk: 'low',
        reasoning: 'peer support',
      },
    ]),
  ),
  authorize: () => true,
  rateLimiter: allowLimiter,
};

const healthInput: EpochHealthInput = {
  communityName: 'Test DAO',
  epochNumber: 3,
  openingSupply: 100_000n,
  regularMintedAmount: 5_000n,
  advancedMintedAmount: 0n,
  advanceDebt: 250n,
  inflationRateBps: 500,
  distribution: [{ label: 'contribution', amount: 5_000n }],
  topThreeConcentrationBps: 3_000,
  previousTopThreeConcentrationBps: null,
};

function reader(data: EpochHealthData | null): EpochHealthReader {
  return { load: async () => data };
}

function healthReportDeps(data: EpochHealthData | null): HealthReportDeps {
  return {
    client: fakeClient(JSON.stringify({ reportText: 'Narrative' })),
    authorize: () => true,
    rateLimiter: allowLimiter,
    reader: reader(data),
  };
}

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

function postJson(body: string): Request {
  return new Request('http://t/api/ai/token-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

afterEach(() => {
  setDepsForTesting(null);
});

describe('POST /api/ai/token-rules route', () => {
  it('400 VALIDATION_ERROR when the body is not valid JSON', async () => {
    setDepsForTesting({ tokenRules: tokenRulesDeps });
    const res = await postTokenRules(postJson('not json at all'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('400 VALIDATION_ERROR when a required field is missing', async () => {
    setDepsForTesting({ tokenRules: tokenRulesDeps });
    const res = await postTokenRules(
      postJson(JSON.stringify({ communityId: 'c_1', communityType: 'hackathon' })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('200 draft pass-through with injected deps', async () => {
    setDepsForTesting({ tokenRules: tokenRulesDeps });
    const res = await postTokenRules(
      postJson(
        JSON.stringify({
          communityId: 'c_1',
          communityType: 'hackathon',
          communityGoal: 'ship projects',
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.rules).toHaveLength(1);
    expect(body.data.degraded).toBe(false);
    expect(typeof body.data.message).toBe('string');
  });
});

describe('GET /api/token-epochs/[id]/health-report route', () => {
  it('200 pass-through with the awaited params id', async () => {
    const data: EpochHealthData = { communityId: 'c_1', status: 'closed', input: healthInput };
    setDepsForTesting({ healthReport: healthReportDeps(data) });
    const res = await getHealthReport(new Request('http://t/x'), ctx('e_1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.reportText).toBe('Narrative');
    // bigint advanceDebt serialized to string.
    expect(body.data.metrics.advanceDebt).toBe('250');
  });

  it('409 INVALID_STATUS when the epoch is not closed', async () => {
    const data: EpochHealthData = { communityId: 'c_1', status: 'active', input: healthInput };
    setDepsForTesting({ healthReport: healthReportDeps(data) });
    const res = await getHealthReport(new Request('http://t/x'), ctx('e_1'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_STATUS');
  });

  it('404 NOT_FOUND when the epoch is missing', async () => {
    setDepsForTesting({ healthReport: healthReportDeps(null) });
    const res = await getHealthReport(new Request('http://t/x'), ctx('ghost'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
