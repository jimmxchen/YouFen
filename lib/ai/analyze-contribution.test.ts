import { describe, expect, it } from 'vitest';
import type { ClaudeClient } from './call-claude';
import { analyzeContribution } from './analyze-contribution';
import type { DeterministicMintContext, RuleWithId } from './types';

function fakeClient(text: string): ClaudeClient {
  return { complete: async () => text };
}

function throwingClient(): ClaudeClient {
  return {
    complete: async () => {
      throw new Error('down');
    },
  };
}

const helpRule: RuleWithId = {
  id: 'rule-help',
  name: 'Help other members',
  description: 'Assist another member',
  tokenAmount: 50,
  evidenceRequired: true,
  abuseRisk: 'low',
  reasoning: 'core',
};

const infraRule: RuleWithId = {
  id: 'rule-infra',
  name: 'Critical infrastructure',
  description: 'Build key infrastructure',
  tokenAmount: 200,
  evidenceRequired: true,
  abuseRisk: 'medium',
  reasoning: 'high value',
};

function ctx(overrides: Partial<DeterministicMintContext> = {}): DeterministicMintContext {
  return {
    baseMintBudget: 10_000n,
    remainingRegularBudget: 5_000n,
    memberEarnedThisEpoch: 100n,
    memberEpochCap: 1_000n,
    maxAdvanceAmount: 2_500n,
    advancedMintedThisEpoch: 0n,
    hasOutstandingAdvance: false,
    isRelatedParty: false,
    policyVersion: 1,
    epochNumber: 3,
    ...overrides,
  };
}

function llmJson(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

const baseInput = {
  description: 'Helped a teammate debug their build',
  evidenceUrls: ['https://example.com/a'],
  rules: [helpRule, infraRule],
};

describe('analyzeContribution', () => {
  it('marks the budget sufficient and standard approval when nothing is advanced', async () => {
    const client = fakeClient(
      llmJson({
        matchedRuleName: 'Help other members',
        suggestedTokenAmount: 50,
        contributionValue: 'meaningful peer support',
        isDuplicate: false,
        riskWarnings: [],
      }),
    );
    const result = await analyzeContribution(client, { ...baseInput, context: ctx() });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const a = result.data;
      expect(a.matchedRuleId).toBe('rule-help');
      expect(a.suggestedTokenAmount).toBe(50);
      expect(a.regularBudgetSufficient).toBe(true);
      expect(a.requiresAdvance).toBe(false);
      expect(a.requiredApproval).toBe('standard_rule');
      expect(a.advanceRateBps).toBe(0);
      expect(a.cumulativeAdvanceRateBps).toBe(0);
    }
  });

  it('clamps a suggested amount above the matched rule cap (adversarial)', async () => {
    const client = fakeClient(
      llmJson({
        matchedRuleName: 'Help other members',
        suggestedTokenAmount: 999,
        contributionValue: 'x',
        isDuplicate: false,
        riskWarnings: [],
      }),
    );
    const result = await analyzeContribution(client, { ...baseInput, context: ctx() });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.suggestedTokenAmount).toBe(50);
    }
  });

  it('forces community_proposal when cumulative advance exceeds 10% despite a benign LLM (adversarial)', async () => {
    // amount 200, remaining 0 -> shortfall 200; already advanced 1000; base 10000
    // cumulative = (1000 + 200) / 10000 = 1200 bps > 1000 -> community_proposal
    const client = fakeClient(
      llmJson({
        matchedRuleName: 'Critical infrastructure',
        suggestedTokenAmount: 200,
        contributionValue: 'built the core pipeline',
        isDuplicate: false,
        riskWarnings: [],
      }),
    );
    const result = await analyzeContribution(client, {
      ...baseInput,
      context: ctx({ remainingRegularBudget: 0n, advancedMintedThisEpoch: 1_000n }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.cumulativeAdvanceRateBps).toBe(1200);
      expect(result.data.requiresAdvance).toBe(true);
      expect(result.data.requiredApproval).toBe('community_proposal');
    }
  });

  it('routes related-party contributions to community_proposal regardless of rate', async () => {
    const client = fakeClient(
      llmJson({ matchedRuleName: 'Help other members', suggestedTokenAmount: 50 }),
    );
    const result = await analyzeContribution(client, {
      ...baseInput,
      context: ctx({ isRelatedParty: true }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.relatedPartyRisk).toBe(true);
      expect(result.data.requiredApproval).toBe('community_proposal');
    }
  });

  it('returns system_forbidden and a warning when cumulative advance exceeds 25%', async () => {
    // amount 200, remaining 0 -> shortfall 200; already 2500; base 10000 -> 2700 bps > 2500
    const client = fakeClient(
      llmJson({ matchedRuleName: 'Critical infrastructure', suggestedTokenAmount: 200 }),
    );
    const result = await analyzeContribution(client, {
      ...baseInput,
      context: ctx({ remainingRegularBudget: 0n, advancedMintedThisEpoch: 2_500n }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiredApproval).toBe('system_forbidden');
      expect(result.data.riskWarnings.length).toBeGreaterThan(0);
    }
  });

  it('warns about rolling advance when an outstanding advance exists and this needs one', async () => {
    const client = fakeClient(
      llmJson({ matchedRuleName: 'Critical infrastructure', suggestedTokenAmount: 200 }),
    );
    const result = await analyzeContribution(client, {
      ...baseInput,
      context: ctx({ remainingRegularBudget: 100n, hasOutstandingAdvance: true }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.requiresAdvance).toBe(true);
      expect(result.data.riskWarnings.some((w) => /advance/i.test(w))).toBe(true);
    }
  });

  it('computes the marginal advanceRateBps from the shortfall', async () => {
    // amount 200, remaining 100 -> shortfall 100; base 10000 -> 100 bps
    const client = fakeClient(
      llmJson({ matchedRuleName: 'Critical infrastructure', suggestedTokenAmount: 200 }),
    );
    const result = await analyzeContribution(client, {
      ...baseInput,
      context: ctx({ remainingRegularBudget: 100n }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.advanceRateBps).toBe(100);
      expect(result.data.requiredApproval).toBe('dual_admin');
    }
  });

  it('flags exceeding the member epoch cap', async () => {
    const client = fakeClient(
      llmJson({ matchedRuleName: 'Critical infrastructure', suggestedTokenAmount: 200 }),
    );
    const result = await analyzeContribution(client, {
      ...baseInput,
      context: ctx({ memberEarnedThisEpoch: 900n, memberEpochCap: 1_000n }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.exceedsMemberEpochCap).toBe(true);
    }
  });

  it('degrades but still returns a deterministic analysis when the LLM fails', async () => {
    const result = await analyzeContribution(throwingClient(), { ...baseInput, context: ctx() });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.degraded).toBe(true);
      expect(result.data).not.toBeNull();
      expect(result.data?.matchedRuleId).toBeNull();
      expect(result.data?.suggestedTokenAmount).toBe(0);
      expect(result.data?.requiredApproval).toBe('standard_rule');
    }
  });

  it('degrades to a deterministic analysis on invalid JSON', async () => {
    const result = await analyzeContribution(fakeClient('not json'), {
      ...baseInput,
      context: ctx(),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.data).not.toBeNull();
    }
  });
});
