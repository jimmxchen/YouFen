// Pure, IO-free demo-seed data for the AdventureX community (PRD §29). The main
// script (scripts/seed-demo.ts) consumes buildSeedPlan() and drives the engine
// runtime to persist it; keeping the plan pure makes the numbers unit-testable
// offline and keeps the guard rails (Σ = initialSupply, epoch formulas, Carol's
// 100/400 split) a single source of truth.
//
// Every amount/supply/balance is bigint; every ratio is integer bps. Derived
// epoch budgets are computed with the frozen engine calc functions so the seed
// asserts against the same math the runtime enforces.

import {
  calculateBaseMintBudget,
  calculateCumulativeAdvanceRateBps,
  calculateEffectiveRegularBudget,
  calculateMaxAdvanceAmount,
  calculateMemberEpochCap,
} from '../lib/engine/calc';
import type { GovernanceStatus } from '../lib/engine/types';

/** The demo community slug — idempotency key for the seed script. */
export const SEED_SLUG = 'adventurex';

/** The synthetic approver id used for engine-driven seed mints/approvals. */
export const SEED_ADMIN_ID = 'seed-admin';

// ---- Structural view types (DB-shape-independent, all bigint amounts) ----

export type MemberRole = 'owner' | 'manager' | 'member';

export interface SeedRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tokenAmount: number;
  readonly evidenceRequired: boolean;
  readonly abuseRisk: string;
  readonly reasoning: string;
}

export interface SeedMember {
  readonly id: string;
  readonly displayName: string;
  readonly role: MemberRole;
}

export interface SeedAllocation {
  readonly memberId: string;
  readonly amount: bigint;
}

export interface SeedPolicy {
  readonly tokenName: string;
  readonly tokenSymbol: string;
  readonly initialSupply: bigint;
  readonly epochDurationDays: number;
  readonly monthlyInflationRateBps: number;
  readonly maxAdvanceRateBps: number;
  readonly memberMintCapRateBps: number;
  readonly policyVersion: number;
}

export interface SeedPolicyVersion {
  readonly version: number;
  readonly effectiveEpoch: number;
  readonly monthlyInflationRateBps: number;
  readonly maxAdvanceRateBps: number;
  readonly memberMintCapRateBps: number;
  readonly rules: readonly SeedRule[];
}

export interface SeedTokenState {
  readonly currentTotalSupply: bigint;
  readonly ledgerSeq: bigint;
}

export interface SeedEpoch {
  readonly epochNumber: number;
  readonly status: string;
  readonly openingSupply: bigint;
  readonly inflationRateBps: number;
  readonly baseMintBudget: bigint;
  readonly effectiveRegularBudget: bigint;
  readonly maxAdvanceAmount: bigint;
  readonly memberEpochCap: bigint;
}

export type ContributionStatus = 'pending' | 'approved' | 'rejected';

export interface SeedContribution {
  readonly id: string;
  readonly memberId: string;
  readonly description: string;
  readonly ruleId: string | null;
  readonly suggestedTokenAmount: bigint;
  readonly approvedTokenAmount: bigint | null;
  readonly status: ContributionStatus;
  /** True when this approved contribution is minted during seeding. */
  readonly minted: boolean;
}

export interface SeedCarolAdvance {
  readonly contributionId: string;
  readonly memberId: string;
  readonly suggestedAmount: bigint;
  /** Regular budget still available before Carol's mint (§29.3: 100). */
  readonly normalRemaining: bigint;
  /** Portion minted from the current epoch's regular budget. */
  readonly normalPortion: bigint;
  /** Portion minted from next-epoch advance budget. */
  readonly advancePortion: bigint;
  /** Cumulative advance rate in bps for the split (§29.3: 800 = 8%). */
  readonly advanceRateBps: number;
  /** Governance status of the two resulting mint events. */
  readonly currentGovernanceStatus: GovernanceStatus;
  readonly advanceGovernanceStatus: GovernanceStatus;
}

export interface SeedProposalOption {
  readonly id: string;
  readonly label: string;
}

export interface SeedProposalVote {
  readonly memberId: string;
  readonly optionId: string;
}

export type SeedProposalType = 'community_decision' | 'token_policy_change';

export interface SeedProposal {
  readonly id: string;
  readonly title: string;
  readonly type: SeedProposalType;
  readonly status: string;
  readonly snapshotted: boolean;
  /** token_policy_change 议题必填：引擎要求完整费率载荷（bps 整数）。 */
  readonly policyChangePayload?: {
    readonly monthlyInflationRateBps: number;
    readonly maxAdvanceRateBps: number;
    readonly memberMintCapRateBps: number;
  };
  readonly options: readonly SeedProposalOption[];
  readonly votes: readonly SeedProposalVote[];
}

export interface SeedCommunity {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

export interface SeedPlan {
  readonly community: SeedCommunity;
  readonly policy: SeedPolicy;
  readonly policyVersion: SeedPolicyVersion;
  readonly state: SeedTokenState;
  readonly rules: readonly SeedRule[];
  readonly members: readonly SeedMember[];
  readonly initialAllocations: readonly SeedAllocation[];
  readonly epoch1: SeedEpoch;
  readonly contributions: readonly SeedContribution[];
  readonly carolAdvance: SeedCarolAdvance;
  readonly proposals: readonly SeedProposal[];
}

// ---- Env guard (pure) ----

export interface EnvCheckResult {
  readonly ok: boolean;
  readonly message?: string;
}

/**
 * Entry guard for the seed script: a non-empty DATABASE_URL is required because
 * the seed connects to a real database. Pure so it is unit-testable offline; the
 * script maps a failing result to a non-zero exit code.
 */
export function checkDatabaseUrl(
  env: Readonly<Record<string, string | undefined>>,
): EnvCheckResult {
  const value = env.DATABASE_URL;
  if (value === undefined || value.length === 0) {
    return {
      ok: false,
      message:
        'DATABASE_URL is not set. The demo seed connects to a real database; ' +
        'export DATABASE_URL (and RECORD_HASH_PEPPER) before running scripts/seed-demo.ts.',
    };
  }
  return { ok: true };
}

// ---- Rule set (5 GeneratedTokenRule, §23.1 shape) ----

function buildRules(): readonly SeedRule[] {
  return [
    {
      id: 'rule-help-member',
      name: '帮助其他成员',
      description: '为其他成员提供实质性帮助并留下可核验记录',
      tokenAmount: 50,
      evidenceRequired: true,
      abuseRisk: 'low',
      reasoning: '低门槛互助，奖励额度小以抑制刷量',
    },
    {
      id: 'rule-core-infra',
      name: '完成关键基础设施',
      description: '完成对社区运行至关重要的基础设施建设',
      tokenAmount: 300,
      evidenceRequired: true,
      abuseRisk: 'medium',
      reasoning: '影响面大、审核成本高，奖励额度较高',
    },
    {
      id: 'rule-onboard-deploy',
      name: '帮助新成员完成部署',
      description: '指导新成员完成关键测试网/主网部署',
      tokenAmount: 500,
      evidenceRequired: true,
      abuseRisk: 'medium',
      reasoning: '高价值知识转移，直接扩大贡献者基数',
    },
    {
      id: 'rule-docs',
      name: '完善文档',
      description: '撰写或显著改进面向社区的技术文档',
      tokenAmount: 80,
      evidenceRequired: true,
      abuseRisk: 'low',
      reasoning: '文档沉淀长期价值，额度适中',
    },
    {
      id: 'rule-event',
      name: '组织社区活动',
      description: '策划并执行一次线上或线下社区活动',
      tokenAmount: 150,
      evidenceRequired: true,
      abuseRisk: 'low',
      reasoning: '活跃社区、扩大影响，额度中等',
    },
  ];
}

// ---- Members (25) + initial allocation (Σ = 100000, Liam = 10000) ----

interface NamedMemberSpec {
  readonly id: string;
  readonly displayName: string;
  readonly role: MemberRole;
  readonly amount: bigint;
}

// Five named members carry bespoke allocations; the remaining 20 each receive an
// even 2700 AXO. 15000 + 8000 + 8000 + 10000 + 5000 + 20*2700 = 46000 + 54000 =
// 100000, matching initialSupply exactly.
const NAMED_MEMBERS: readonly NamedMemberSpec[] = [
  { id: 'aria', displayName: 'Aria', role: 'owner', amount: 15000n },
  { id: 'ben', displayName: 'Ben', role: 'manager', amount: 8000n },
  { id: 'dana', displayName: 'Dana', role: 'manager', amount: 8000n },
  { id: 'liam', displayName: 'Liam', role: 'member', amount: 10000n },
  { id: 'carol', displayName: 'Carol', role: 'member', amount: 5000n },
];

const GENERIC_MEMBER_COUNT = 20;
const GENERIC_MEMBER_AMOUNT = 2700n;

function buildMemberSpecs(): readonly NamedMemberSpec[] {
  const generic: NamedMemberSpec[] = [];
  for (let i = 0; i < GENERIC_MEMBER_COUNT; i += 1) {
    const n = i + 6; // members 06..25
    const label = String(n).padStart(2, '0');
    generic.push({
      id: `member-${label}`,
      displayName: `Member ${label}`,
      role: 'member',
      amount: GENERIC_MEMBER_AMOUNT,
    });
  }
  return [...NAMED_MEMBERS, ...generic];
}

// ---- Contributions (8) ----

function buildContributions(): readonly SeedContribution[] {
  return [
    // 3 approved + minted (Liam onboarding, Carol infra via advance, one help).
    {
      id: 'liam-injective-001',
      memberId: 'liam',
      description: '帮助新成员完成 Injective Testnet 部署',
      ruleId: 'rule-onboard-deploy',
      suggestedTokenAmount: 500n,
      approvedTokenAmount: 500n,
      status: 'approved',
      minted: true,
    },
    {
      id: 'carol-infra-001',
      memberId: 'carol',
      description: '完成重大社区基础设施贡献',
      // §29.3 approves the full 500 AXO, so this must reference a rule whose
      // tokenAmount ceiling is >= 500 — otherwise mint-service step 5 rejects the
      // split with RULE_VIOLATION ('amount exceeds rule ceiling'). rule-onboard-deploy
      // (500) is the only rule that covers a 500 reward; rule-core-infra caps at 300.
      ruleId: 'rule-onboard-deploy',
      suggestedTokenAmount: 500n,
      approvedTokenAmount: 500n,
      status: 'approved',
      minted: true,
    },
    {
      id: 'member-08-help-001',
      memberId: 'member-08',
      description: '帮助其他成员排查部署问题',
      ruleId: 'rule-help-member',
      suggestedTokenAmount: 50n,
      approvedTokenAmount: 50n,
      status: 'approved',
      minted: true,
    },
    // 2 approved, not yet minted.
    {
      id: 'member-09-docs-001',
      memberId: 'member-09',
      description: '完善合约交互文档',
      ruleId: 'rule-docs',
      suggestedTokenAmount: 80n,
      approvedTokenAmount: 80n,
      status: 'approved',
      minted: false,
    },
    {
      id: 'member-10-event-001',
      memberId: 'member-10',
      description: '组织一次线下 Hackathon',
      ruleId: 'rule-event',
      suggestedTokenAmount: 150n,
      approvedTokenAmount: 150n,
      status: 'approved',
      minted: false,
    },
    // 2 pending.
    {
      id: 'member-11-help-001',
      memberId: 'member-11',
      description: '协助新成员配置开发环境',
      ruleId: 'rule-help-member',
      suggestedTokenAmount: 50n,
      approvedTokenAmount: null,
      status: 'pending',
      minted: false,
    },
    {
      id: 'member-12-infra-001',
      memberId: 'member-12',
      description: '搭建社区监控面板',
      ruleId: 'rule-core-infra',
      suggestedTokenAmount: 300n,
      approvedTokenAmount: null,
      status: 'pending',
      minted: false,
    },
    // 1 rejected.
    {
      id: 'member-13-spam-001',
      memberId: 'member-13',
      description: '重复提交无实质内容的贡献',
      ruleId: 'rule-help-member',
      suggestedTokenAmount: 50n,
      approvedTokenAmount: null,
      status: 'rejected',
      minted: false,
    },
  ];
}

// ---- Proposals (2) ----

function buildProposals(): readonly SeedProposal[] {
  return [
    {
      id: 'proposal-community-001',
      title: '是否将社区金库 5% 用于赞助开源基础设施',
      type: 'community_decision',
      status: 'active',
      snapshotted: true,
      options: [
        { id: 'approve', label: '赞成' },
        { id: 'reject', label: '反对' },
      ],
      votes: [
        { memberId: 'aria', optionId: 'approve' },
        { memberId: 'liam', optionId: 'approve' },
        { memberId: 'ben', optionId: 'reject' },
      ],
    },
    {
      id: 'proposal-policy-001',
      title: '将月度通胀率从 5% 下调至 4%',
      type: 'token_policy_change',
      status: 'draft',
      snapshotted: false,
      // 引擎要求政策议题携带完整费率载荷：通胀 5%→4%，其余维持 PRD §29.1 演示值
      policyChangePayload: {
        monthlyInflationRateBps: 400,
        maxAdvanceRateBps: 2500,
        memberMintCapRateBps: 1000,
      },
      options: [
        { id: 'approve', label: '赞成' },
        { id: 'reject', label: '反对' },
      ],
      votes: [],
    },
  ];
}

// ---- Carol's §29.3 advance split (derived, not hand-typed) ----

const CAROL_SUGGESTED = 500n;
const EPOCH1_NORMAL_MINTED_BEFORE_CAROL = 4900n;

function buildCarolAdvance(
  baseMintBudget: bigint,
  effectiveRegularBudget: bigint,
): SeedCarolAdvance {
  const normalRemaining = effectiveRegularBudget - EPOCH1_NORMAL_MINTED_BEFORE_CAROL;
  const normalPortion = normalRemaining < CAROL_SUGGESTED ? normalRemaining : CAROL_SUGGESTED;
  const advancePortion = CAROL_SUGGESTED - normalPortion;
  const advanceRateBps = calculateCumulativeAdvanceRateBps(0n, advancePortion, baseMintBudget);
  return {
    contributionId: 'carol-infra-001',
    memberId: 'carol',
    suggestedAmount: CAROL_SUGGESTED,
    normalRemaining,
    normalPortion,
    advancePortion,
    advanceRateBps,
    currentGovernanceStatus: 'active',
    advanceGovernanceStatus: 'pending',
  };
}

/**
 * Build the full AdventureX demo seed plan (PRD §29). Pure and deterministic:
 * two calls deep-equal. All derived budgets flow through the engine calc
 * functions so the seed and the runtime agree by construction.
 */
export function buildSeedPlan(): SeedPlan {
  const rules = buildRules();
  const memberSpecs = buildMemberSpecs();

  const policy: SeedPolicy = {
    tokenName: 'AdventureX Ownership Token',
    tokenSymbol: 'AXO',
    initialSupply: 100000n,
    epochDurationDays: 30,
    monthlyInflationRateBps: 500,
    maxAdvanceRateBps: 2500,
    memberMintCapRateBps: 1000,
    policyVersion: 1,
  };

  const openingSupply = policy.initialSupply;
  const baseMintBudget = calculateBaseMintBudget(openingSupply, policy.monthlyInflationRateBps);
  const effectiveRegularBudget = calculateEffectiveRegularBudget(baseMintBudget, 0n);
  const maxAdvanceAmount = calculateMaxAdvanceAmount(baseMintBudget, policy.maxAdvanceRateBps);
  const memberEpochCap = calculateMemberEpochCap(baseMintBudget, policy.memberMintCapRateBps);

  const epoch1: SeedEpoch = {
    epochNumber: 1,
    status: 'active',
    openingSupply,
    inflationRateBps: policy.monthlyInflationRateBps,
    baseMintBudget,
    effectiveRegularBudget,
    maxAdvanceAmount,
    memberEpochCap,
  };

  return {
    community: {
      slug: SEED_SLUG,
      name: 'AdventureX',
      description: 'AdventureX 开源基础设施社区（Demo 种子数据，PRD §29）',
    },
    policy,
    policyVersion: {
      version: 1,
      effectiveEpoch: 1,
      monthlyInflationRateBps: policy.monthlyInflationRateBps,
      maxAdvanceRateBps: policy.maxAdvanceRateBps,
      memberMintCapRateBps: policy.memberMintCapRateBps,
      rules,
    },
    // Genesis DB row the script writes BEFORE the engine runs: supply starts at
    // zero and the engine's mintInitialAllocation raises it to initialSupply,
    // allocating ledgerSeq as it goes. Persisting a pre-filled supply here would
    // double-count once the engine mints, so it stays 0.
    state: {
      currentTotalSupply: 0n,
      ledgerSeq: 0n,
    },
    rules,
    members: memberSpecs.map((m) => ({ id: m.id, displayName: m.displayName, role: m.role })),
    initialAllocations: memberSpecs.map((m) => ({ memberId: m.id, amount: m.amount })),
    epoch1,
    contributions: buildContributions(),
    carolAdvance: buildCarolAdvance(baseMintBudget, effectiveRegularBudget),
    proposals: buildProposals(),
  };
}
