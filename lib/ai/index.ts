// Public surface of the AI service layer (ARCHITECTURE §9). Three advisory
// capabilities plus the Claude wrapper — no ledger-write function is re-exported
// or imported anywhere in this module.

export type {
  AiResult,
  ContributionAnalysis,
  DeterministicMintContext,
  DistributionShare,
  DistributionSlice,
  EpochHealthInput,
  EpochHealthMetrics,
  EpochHealthReport,
  GeneratedTokenRule,
  RequiredApproval,
  RuleWithId,
} from './types';

export {
  callClaude,
  createAnthropicClient,
  parseJsonLoose,
  resolveModelId,
  type AnthropicClientConfig,
  type ClaudeCallResult,
  type ClaudeClient,
  type ClaudeCompleteOptions,
  type CallClaudeOptions,
} from './call-claude';

export { generateTokenRules, type GenerateRulesInput } from './generate-rules';
export {
  analyzeContribution,
  type AnalyzeContributionInput,
} from './analyze-contribution';
export { generateHealthReport } from './health-report';
