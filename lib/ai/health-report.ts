// generateHealthReport (ARCHITECTURE §9.4 / PRD §23.3). Every ratio is computed
// in code from ledger figures (bigint -> bps); the LLM only organizes the
// narrative. On any LLM failure the result degrades but metrics are unchanged
// and reportText falls back to a deterministic template.

import { callClaude, parseJsonLoose, type ClaudeClient } from './call-claude';
import type {
  AiResult,
  DistributionShare,
  EpochHealthInput,
  EpochHealthMetrics,
  EpochHealthReport,
} from './types';

const BPS_DENOMINATOR = 10_000n;

/** amount / base in bps (floored). base == 0 -> 0. */
function bpsOf(amount: bigint, base: bigint): number {
  if (base <= 0n) {
    return 0;
  }
  return Number((amount * BPS_DENOMINATOR) / base);
}

function sumDistribution(input: EpochHealthInput): bigint {
  return input.distribution.reduce((total, slice) => total + slice.amount, 0n);
}

function computeMetrics(input: EpochHealthInput): EpochHealthMetrics {
  const total = sumDistribution(input);
  const distribution: readonly DistributionShare[] = input.distribution.map((slice) => ({
    label: slice.label,
    percentageBps: bpsOf(slice.amount, total),
  }));
  return {
    baseInflationRateBps: input.inflationRateBps,
    regularInflationBps: bpsOf(input.regularMintedAmount, input.openingSupply),
    advancedInflationBps: bpsOf(input.advancedMintedAmount, input.openingSupply),
    totalSupplyGrowthBps: bpsOf(
      input.regularMintedAmount + input.advancedMintedAmount,
      input.openingSupply,
    ),
    advanceDebt: input.advanceDebt,
    distribution,
    topThreeConcentrationBps: input.topThreeConcentrationBps,
    previousTopThreeConcentrationBps: input.previousTopThreeConcentrationBps,
    usedFutureBudget: input.advancedMintedAmount > 0n,
  };
}

/** bps -> "X.Y%" (e.g. 510 -> "5.1%"). */
function pct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

/** PRD §23.3 deterministic report template — always available, LLM-free. */
function renderDeterministicReport(
  input: EpochHealthInput,
  metrics: EpochHealthMetrics,
): string {
  const distLine = metrics.distribution
    .map((s) => `${s.label} ${pct(s.percentageBps)}`)
    .join(' / ');
  const priorConcentration =
    metrics.previousTopThreeConcentrationBps === null
      ? ''
      : `（上期 ${pct(metrics.previousTopThreeConcentrationBps)}）`;
  const riskLine = metrics.usedFutureBudget
    ? '风险：本期使用了未来预算，建议下一期优先控制特殊奖励数量。'
    : '风险：本期未使用未来预算，供应增长处于规则范围内。';
  return [
    `${input.communityName} Token Health Report（Epoch ${input.epochNumber}）`,
    '',
    `本期基础通胀率：${pct(metrics.baseInflationRateBps)}`,
    `正常增发：${pct(metrics.regularInflationBps)}`,
    `预支增发：${pct(metrics.advancedInflationBps)}`,
    `本期总供应增长：${pct(metrics.totalSupplyGrowthBps)}`,
    `未来预算债务：${metrics.advanceDebt.toString()} Token`,
    '',
    `Token 分布：${distLine}`,
    `集中度：前 3 名成员 ${pct(metrics.topThreeConcentrationBps)}${priorConcentration}`,
    '',
    riskLine,
  ].join('\n');
}

function buildPrompt(input: EpochHealthInput, metrics: EpochHealthMetrics): string {
  const distLine = metrics.distribution
    .map((s) => `${s.label} ${pct(s.percentageBps)}`)
    .join(' / ');
  return [
    '你是社区通胀健康报告撰写助手。以下比率均为确定性账本数值，禁止改写。',
    `社区：${input.communityName}，Epoch：${input.epochNumber}`,
    `基础通胀率 ${pct(metrics.baseInflationRateBps)}，正常增发 ${pct(metrics.regularInflationBps)}，`,
    `预支增发 ${pct(metrics.advancedInflationBps)}，总供应增长 ${pct(metrics.totalSupplyGrowthBps)}。`,
    `未来预算债务 ${metrics.advanceDebt.toString()} Token。`,
    `Token 分布：${distLine}。`,
    `前 3 名集中度 ${pct(metrics.topThreeConcentrationBps)}。`,
    '请组织成 PRD §23.3 版式的叙述性报告。',
    '只返回 JSON：{ "reportText": string }',
  ].join('\n');
}

function extractReportText(parsed: unknown): string | null {
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'reportText' in parsed &&
    typeof (parsed as { reportText: unknown }).reportText === 'string'
  ) {
    const text = (parsed as { reportText: string }).reportText.trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

/**
 * Generate an epoch health report. Metrics are always deterministic; the LLM
 * narrative is used only when it returns a valid non-empty reportText, else the
 * result degrades to the deterministic template (metrics still attached).
 */
export async function generateHealthReport(
  client: ClaudeClient,
  input: EpochHealthInput,
): Promise<AiResult<EpochHealthReport>> {
  const metrics = computeMetrics(input);
  const deterministicText = renderDeterministicReport(input, metrics);

  const call = await callClaude(client, buildPrompt(input, metrics), {
    maxTokens: 1_500,
    timeoutMs: 30_000,
  });
  if (!call.ok) {
    return {
      ok: false,
      degraded: true,
      code: 'AI_UNAVAILABLE',
      message: call.message,
      data: { metrics, reportText: deterministicText },
    };
  }

  const reportText = extractReportText(parseJsonLoose(call.text));
  if (reportText === null) {
    return {
      ok: false,
      degraded: true,
      code: 'AI_UNAVAILABLE',
      message: 'invalid or empty report from model',
      data: { metrics, reportText: deterministicText },
    };
  }
  return { ok: true, data: { metrics, reportText }, degraded: false };
}
