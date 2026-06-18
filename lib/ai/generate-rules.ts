// generateTokenRules (ARCHITECTURE §9.2 / PRD §23.1). Produces a 5-7 rule
// draft, each tokenAmount in [10, 300]. Every candidate is validated with Zod;
// invalid entries are discarded. Output is advisory only — it is never written
// to the ledger here.

import { z } from 'zod';
import { callClaude, parseJsonLoose, type ClaudeClient } from './call-claude';
import type { AiResult, GeneratedTokenRule } from './types';

export interface GenerateRulesInput {
  readonly communityType: string;
  readonly communityGoal: string;
  readonly description?: string;
}

const MIN_TOKEN_AMOUNT = 10;
const MAX_TOKEN_AMOUNT = 300;

const ruleSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  tokenAmount: z.number().int().min(MIN_TOKEN_AMOUNT).max(MAX_TOKEN_AMOUNT),
  repeatLimitPerEpoch: z.number().int().positive().optional(),
  evidenceRequired: z.boolean(),
  abuseRisk: z.string().min(1),
  reasoning: z.string().min(1),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildPrompt(input: GenerateRulesInput): string {
  const extra = input.description ? `\n补充说明：${input.description}` : '';
  return [
    '你是社区所有权 Token 规则设计助手，只产出草案，不做任何写库或审批决策。',
    `社区类型：${input.communityType}`,
    `社区目标：${input.communityGoal}${extra}`,
    '请生成 5-7 条贡献规则，每条 tokenAmount 为 10-300 之间的整数',
    '（参考：完成社区介绍 10、帮助其他成员 50、担任 Mentor 300）。',
    '只返回 JSON 数组，每个元素形如：',
    '{ "name", "description", "tokenAmount", "repeatLimitPerEpoch"(可选),',
    '  "evidenceRequired"(boolean), "abuseRisk", "reasoning" }',
  ].join('\n');
}

/** Pull the raw rule array out of either a bare array or a { rules: [...] } wrapper. */
function toArray(parsed: unknown): readonly unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isRecord(parsed) && Array.isArray(parsed.rules)) {
    return parsed.rules;
  }
  return [];
}

function extractRules(parsed: unknown): readonly GeneratedTokenRule[] {
  const valid: GeneratedTokenRule[] = [];
  for (const candidate of toArray(parsed)) {
    const result = ruleSchema.safeParse(candidate);
    if (result.success) {
      valid.push(result.data);
    }
  }
  return valid;
}

/**
 * Generate a draft rule set. Any LLM failure, unparseable output, or a set with
 * no valid rules degrades to `data: null`. Never writes to the database.
 */
export async function generateTokenRules(
  client: ClaudeClient,
  input: GenerateRulesInput,
): Promise<AiResult<GeneratedTokenRule[]>> {
  const call = await callClaude(client, buildPrompt(input), { maxTokens: 2_048, timeoutMs: 30_000 });
  if (!call.ok) {
    return { ok: false, degraded: true, code: 'AI_UNAVAILABLE', message: call.message, data: null };
  }
  const rules = extractRules(parseJsonLoose(call.text));
  if (rules.length === 0) {
    return {
      ok: false,
      degraded: true,
      code: 'AI_UNAVAILABLE',
      message: 'no valid rules returned by the model',
      data: null,
    };
  }
  return { ok: true, data: [...rules], degraded: false };
}
