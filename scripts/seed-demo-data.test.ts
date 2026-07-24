// Offline unit tests for the AdventureX demo seed plan (PRD §29). These never
// touch a DB, Redis, chain, or Anthropic API: they assert only over the pure
// data produced by buildSeedPlan() and the env-guard helper. The real-DB seed
// run is a documented manual step (see scripts/seed-demo.ts header + task notes).

import { describe, expect, it } from 'vitest';

import {
  buildSeedPlan,
  checkDatabaseUrl,
  SEED_SLUG,
  type SeedContribution,
} from './seed-demo-data';

describe('buildSeedPlan — AdventureX demo (PRD §29)', () => {
  it('names the AdventureX community with the adventurex slug', () => {
    const plan = buildSeedPlan();
    expect(plan.community.slug).toBe('adventurex');
    expect(plan.community.slug).toBe(SEED_SLUG);
    expect(plan.community.name).toBe('AdventureX');
  });

  it('sets the AXO token policy per §29.1', () => {
    const { policy } = buildSeedPlan();
    expect(policy.tokenName).toBe('AdventureX Ownership Token');
    expect(policy.tokenSymbol).toBe('AXO');
    expect(policy.initialSupply).toBe(100000n);
    expect(policy.epochDurationDays).toBe(30);
    expect(policy.monthlyInflationRateBps).toBe(500);
    expect(policy.maxAdvanceRateBps).toBe(2500);
    expect(policy.memberMintCapRateBps).toBe(1000);
    expect(policy.policyVersion).toBe(1);
  });

  it('carries a v1 TokenPolicyVersion aligned with the live policy', () => {
    const plan = buildSeedPlan();
    expect(plan.policyVersion.version).toBe(1);
    expect(plan.policyVersion.monthlyInflationRateBps).toBe(500);
    expect(plan.policyVersion.maxAdvanceRateBps).toBe(2500);
    expect(plan.policyVersion.memberMintCapRateBps).toBe(1000);
    expect(plan.policyVersion.rules).toEqual(plan.rules);
  });

  it('defines exactly 5 generated rules including the two anchor rules', () => {
    const { rules } = buildSeedPlan();
    expect(rules).toHaveLength(5);
    const help = rules.find((r) => r.name === '帮助其他成员');
    const infra = rules.find((r) => r.name === '完成关键基础设施');
    expect(help?.tokenAmount).toBe(50);
    expect(infra?.tokenAmount).toBe(300);
    // Every rule carries a stable id so mint-service can resolve ruleId ceilings.
    for (const rule of rules) {
      expect(rule.id.length).toBeGreaterThan(0);
    }
  });

  it('has 25 members with unique ids and exactly one owner', () => {
    const { members } = buildSeedPlan();
    expect(members).toHaveLength(25);
    const ids = new Set(members.map((m) => m.id));
    expect(ids.size).toBe(25);
    const owners = members.filter((m) => m.role === 'owner');
    expect(owners).toHaveLength(1);
    // Liam and Carol are ordinary members (Carol must not be a related party
    // so her §29.3 advance stays on the dual-admin path, not community_proposal).
    const liam = members.find((m) => m.id === 'liam');
    const carol = members.find((m) => m.id === 'carol');
    expect(liam?.role).toBe('member');
    expect(carol?.role).toBe('member');
  });

  it('initial allocation sums to exactly the 100000 initial supply', () => {
    const { initialAllocations } = buildSeedPlan();
    const total = initialAllocations.reduce((acc, a) => acc + a.amount, 0n);
    expect(total).toBe(100000n);
    // One allocation per member.
    expect(initialAllocations).toHaveLength(25);
  });

  it('grants Liam 10000 AXO (10% relative ownership at genesis, §29.2)', () => {
    const { initialAllocations } = buildSeedPlan();
    const liam = initialAllocations.find((a) => a.memberId === 'liam');
    expect(liam?.amount).toBe(10000n);
  });

  it('derives Epoch 1 budgets from the engine formulas (§29.1)', () => {
    const { epoch1 } = buildSeedPlan();
    expect(epoch1.openingSupply).toBe(100000n);
    expect(epoch1.inflationRateBps).toBe(500);
    expect(epoch1.baseMintBudget).toBe(5000n);
    expect(epoch1.effectiveRegularBudget).toBe(5000n);
    expect(epoch1.maxAdvanceAmount).toBe(1250n);
    expect(epoch1.memberEpochCap).toBe(500n);
    expect(epoch1.status).toBe('active');
  });

  it('splits Carol’s 500 AXO reward into 100 current + 400 advance (§29.3)', () => {
    const { carolAdvance } = buildSeedPlan();
    expect(carolAdvance.suggestedAmount).toBe(500n);
    expect(carolAdvance.normalRemaining).toBe(100n);
    expect(carolAdvance.normalPortion).toBe(100n);
    expect(carolAdvance.advancePortion).toBe(400n);
    expect(carolAdvance.normalPortion + carolAdvance.advancePortion).toBe(500n);
    // 400 / 5000 base = 800 bps = 8% -> dual-admin, no community proposal.
    expect(carolAdvance.advanceRateBps).toBe(800);
    expect(carolAdvance.contributionId).toBe('carol-infra-001');
  });

  it('gives every minted contribution a ruleId whose ceiling covers its amount (mint-service step 5)', () => {
    // mint-service.ts step 5 rejects a mint when ruleTokenAmount(rules, ruleId)
    // is null or below the approved amount (RULE_VIOLATION). The seed drives the
    // real engine, so every minted contribution — including Carol's §29.3 split —
    // must resolve to a non-null rule whose tokenAmount >= approvedTokenAmount, or
    // seedViaEngine breaks mid-run.
    const { contributions, rules } = buildSeedPlan();
    const ceilingOf = (ruleId: string | null): bigint | null => {
      if (ruleId === null) return null;
      const rule = rules.find((r) => r.id === ruleId);
      return rule ? BigInt(rule.tokenAmount) : null;
    };
    const minted = contributions.filter((c) => c.minted);
    expect(minted.length).toBeGreaterThan(0);
    for (const c of minted) {
      expect(c.ruleId).not.toBeNull();
      const ceiling = ceilingOf(c.ruleId);
      expect(ceiling).not.toBeNull();
      expect(c.approvedTokenAmount).not.toBeNull();
      expect(ceiling as bigint).toBeGreaterThanOrEqual(c.approvedTokenAmount as bigint);
    }
    // Carol's infra contribution is the §29.3 regression anchor: 500 AXO reward.
    const carol = contributions.find((c) => c.id === 'carol-infra-001');
    expect(carol?.ruleId).not.toBeNull();
    expect(ceilingOf(carol?.ruleId ?? null)).toBeGreaterThanOrEqual(500n);
  });

  it('has 8 contributions with the §29 status breakdown', () => {
    const { contributions } = buildSeedPlan();
    expect(contributions).toHaveLength(8);
    const by = (pred: (c: SeedContribution) => boolean): number =>
      contributions.filter(pred).length;
    expect(by((c) => c.status === 'approved' && c.minted)).toBe(3);
    expect(by((c) => c.status === 'approved' && !c.minted)).toBe(2);
    expect(by((c) => c.status === 'pending')).toBe(2);
    expect(by((c) => c.status === 'rejected')).toBe(1);
    // Liam's +500 onboarding contribution is present and approved+minted.
    const liamC = contributions.find((c) => c.id === 'liam-injective-001');
    expect(liamC?.memberId).toBe('liam');
    expect(liamC?.approvedTokenAmount).toBe(500n);
    expect(liamC?.status).toBe('approved');
    expect(liamC?.minted).toBe(true);
    expect(liamC?.description).toContain('Injective');
  });

  it('has 2 proposals: 1 active community_decision (snapshotted, 3 votes) + 1 draft policy change', () => {
    const { proposals } = buildSeedPlan();
    expect(proposals).toHaveLength(2);
    const active = proposals.find((p) => p.type === 'community_decision');
    const draft = proposals.find((p) => p.type === 'token_policy_change');
    expect(active?.status).toBe('active');
    expect(active?.snapshotted).toBe(true);
    expect(active?.votes).toHaveLength(3);
    expect(draft?.status).toBe('draft');
    // Proposal options convention: approve first, reject second.
    expect(active?.options[0]?.id).toBe('approve');
    expect(active?.options[1]?.id).toBe('reject');
  });

  it('is a pure function: two calls deep-equal (idempotent, no IO)', () => {
    const a = buildSeedPlan();
    const b = buildSeedPlan();
    expect(a).toEqual(b);
    // Distinct object identities (fresh immutable data each call).
    expect(a).not.toBe(b);
  });
});

describe('checkDatabaseUrl — entry guard', () => {
  it('fails with a DATABASE_URL message when the var is missing', () => {
    const result = checkDatabaseUrl({});
    expect(result.ok).toBe(false);
    expect(result.message).toContain('DATABASE_URL');
  });

  it('fails when DATABASE_URL is present but empty', () => {
    const result = checkDatabaseUrl({ DATABASE_URL: '' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('DATABASE_URL');
  });

  it('passes when DATABASE_URL is a non-empty string', () => {
    const result = checkDatabaseUrl({ DATABASE_URL: 'postgresql://user:pw@localhost:5432/db' });
    expect(result.ok).toBe(true);
    expect(result.message).toBeUndefined();
  });
});
