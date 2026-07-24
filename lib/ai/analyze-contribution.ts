// analyzeContribution (ARCHITECTURE §9.3). Deterministic data precedes the LLM:
// budget sufficiency, member-cap, advance rate, and the required-approval path
// are all computed in code and OVERRIDE any LLM claim. The LLM only contributes
// rule matching, a suggested amount (clamped to the rule cap), a value blurb,
// a duplicate flag, and free-text risk warnings.

import { z } from 'zod';
import {
  calculateCumulativeAdvanceRateBps,
  resolveAdvanceApproval,
} from '../engine/calc';
import { callClaude, parseJsonLoose, type ClaudeClient } from './call-claude';
import type {
  AiResult,
  ContributionAnalysis,
  DeterministicMintContext,
  RuleWithId,
} from './types';

export interface AnalyzeContributionInput {
  readonly description: string;
  readonly evidenceUrls: readonly string[];
  readonly rules: readonly RuleWithId[];
  readonly context: DeterministicMintContext;
}

/** The only fields the model is trusted to supply. */
interface LlmFields {
  readonly matchedRuleName: string | null;
  readonly suggestedTokenAmount: number | null;
  readonly contributionValue: string;
  readonly isDuplicate: boolean;
  readonly riskWarnings: readonly string[];
}

const EMPTY_LLM: LlmFields = {
  matchedRuleName: null,
  suggestedTokenAmount: null,
  contributionValue: '',
  isDuplicate: false,
  riskWarnings: [],
};

const llmSchema = z.object({
  matchedRuleName: z.string().nullish(),
  suggestedTokenAmount: z.number().nullish(),
  contributionValue: z.string().nullish(),
  isDuplicate: z.boolean().nullish(),
  riskWarnings: z.array(z.string()).nullish(),
});

function buildPrompt(input: AnalyzeContributionInput): string {
  const ruleLines = input.rules.map((r) => `- ${r.name}: ${r.tokenAmount}`).join('\n');
  return [
    '你是社区贡献评估助手，只做规则匹配与说理，不做任何审批决策。',
    `贡献描述：${input.description}`,
    `证明材料数量：${input.evidenceUrls.length}`,
    '可用规则（名称 → Token）：',
    ruleLines,
    '只返回 JSON：{ "matchedRuleName", "suggestedTokenAmount"(不得超过所匹配规则),',
    '  "contributionValue", "isDuplicate", "riskWarnings"(string[]) }',
  ].join('\n');
}

function parseLlm(parsed: unknown): LlmFields | null {
  const result = llmSchema.safeParse(parsed);
  if (!result.success) {
    return null;
  }
  const d = result.data;
  return {
    matchedRuleName: d.matchedRuleName ?? null,
    suggestedTokenAmount: d.suggestedTokenAmount ?? null,
    contributionValue: d.contributionValue ?? '',
    isDuplicate: d.isDuplicate ?? false,
    riskWarnings: d.riskWarnings ?? [],
  };
}

function matchRule(rules: readonly RuleWithId[], name: string | null): RuleWithId | null {
  if (name === null) {
    return null;
  }
  const target = name.trim().toLowerCase();
  return rules.find((r) => r.name.trim().toLowerCase() === target) ?? null;
}

/** Non-negative bigint from a possibly-fractional number. */
function toAmount(value: number): bigint {
  const floored = Math.max(0, Math.trunc(value));
  return BigInt(floored);
}

function deterministicWarnings(
  ctx: DeterministicMintContext,
  requiresAdvance: boolean,
  exceedsCap: boolean,
  approval: ContributionAnalysis['requiredApproval'],
): readonly string[] {
  const warnings: string[] = [];
  if (requiresAdvance && ctx.hasOutstandingAdvance) {
    warnings.push('存在未偿还预支，禁止连续预支（rolling advance forbidden）');
  }
  if (approval === 'system_forbidden') {
    warnings.push('累计预支超过基础预算 25%，系统禁止本次增发');
  }
  if (exceedsCap) {
    warnings.push('超过成员单期上限（exceeds member epoch cap）');
  }
  if (ctx.isRelatedParty) {
    warnings.push('接收人与审批人存在关联方关系，需经社区 Proposal');
  }
  return warnings;
}

function dedupe(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((v) => v.trim().length > 0))];
}

/** Build the analysis; deterministic fields always win over the LLM. */
function computeAnalysis(
  input: AnalyzeContributionInput,
  matchedRule: RuleWithId | null,
  llm: LlmFields,
): ContributionAnalysis {
  const ctx = input.context;
  const ruleCap = matchedRule ? matchedRule.tokenAmount : 0;
  const llmSuggested = llm.suggestedTokenAmount ?? ruleCap;
  const amountNum = Math.min(llmSuggested, ruleCap);
  const amount = toAmount(amountNum);

  const shortfall =
    amount > ctx.remainingRegularBudget ? amount - ctx.remainingRegularBudget : 0n;
  const cumulativeAdvanceRateBps = calculateCumulativeAdvanceRateBps(
    ctx.advancedMintedThisEpoch,
    shortfall,
    ctx.baseMintBudget,
  );
  const advanceRateBps = calculateCumulativeAdvanceRateBps(0n, shortfall, ctx.baseMintBudget);
  const requiredApproval = resolveAdvanceApproval(cumulativeAdvanceRateBps, ctx.isRelatedParty, false);
  const requiresAdvance = shortfall > 0n;
  const exceedsMemberEpochCap = ctx.memberEarnedThisEpoch + amount > ctx.memberEpochCap;

  const riskWarnings = dedupe([
    ...llm.riskWarnings,
    ...deterministicWarnings(ctx, requiresAdvance, exceedsMemberEpochCap, requiredApproval),
  ]);

  return {
    matchedRuleId: matchedRule?.id ?? null,
    matchedRuleName: matchedRule?.name ?? null,
    suggestedTokenAmount: Number(amount),
    contributionValue: llm.contributionValue,
    isDuplicate: llm.isDuplicate,
    exceedsMemberEpochCap,
    regularBudgetSufficient: shortfall === 0n,
    requiresAdvance,
    advanceRateBps,
    relatedPartyRisk: ctx.isRelatedParty,
    requiredApproval,
    riskWarnings,
    cumulativeAdvanceRateBps,
  };
}

/**
 * Analyze a pending contribution. On any LLM failure or unparseable output the
 * result degrades but still carries a pure deterministic analysis (no matched
 * rule, zero amount) so the caller never loses the code-computed facts.
 */
export async function analyzeContribution(
  client: ClaudeClient,
  input: AnalyzeContributionInput,
): Promise<AiResult<ContributionAnalysis>> {
  const call = await callClaude(client, buildPrompt(input), { maxTokens: 1_024, timeoutMs: 30_000 });
  if (!call.ok) {
    return {
      ok: false,
      degraded: true,
      code: 'AI_UNAVAILABLE',
      message: call.message,
      data: computeAnalysis(input, null, EMPTY_LLM),
    };
  }
  const llm = parseLlm(parseJsonLoose(call.text));
  if (llm === null) {
    return {
      ok: false,
      degraded: true,
      code: 'AI_UNAVAILABLE',
      message: 'invalid JSON from model',
      data: computeAnalysis(input, null, EMPTY_LLM),
    };
  }
  const matchedRule = matchRule(input.rules, llm.matchedRuleName);
  return { ok: true, data: computeAnalysis(input, matchedRule, llm), degraded: false };
}
