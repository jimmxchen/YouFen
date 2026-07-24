// AdventureX demo seed (PRD §29). Run against a REAL database with:
//
//   DATABASE_URL=postgresql://... RECORD_HASH_PEPPER=... pnpm tsx scripts/seed-demo.ts
//   # optional: append --reset to wipe the demo community first
//
// Contract (red-team revised):
//   - No DATABASE_URL  -> print a message containing 'DATABASE_URL' and exit 1.
//   - Idempotent: if a community with slug 'adventurex' already exists, the seed
//     skips (use --reset to force a clean re-seed).
//   - --reset uses raw SQL DELETE keyed by communityId to clear the demo
//     community. The ledger immutability guard forbids deleting append-only
//     tables through Prisma, so reset goes through raw SQL. This is acceptable
//     ONLY for a throwaway demo database — never run --reset against production.
//   - Initial allocation, Epoch 1 creation, contribution mints, Carol's §29.3
//     advance split, and the two proposals all go through the engine runtime so
//     every invariant (ledgerSeq/state/PublicRecord) is enforced by the engine.
//   - Without REDIS_URL the runtime enqueue is a no-op (W4-1 contract): DB-only
//     records finalize, chain-eligible records stay 'pending' for the reconciler.
//
// End-to-end persistence is validated manually (see task notes); the pure plan
// (scripts/seed-demo-data.ts) is unit-tested offline.

import { pathToFileURL } from 'node:url';

import { getPrisma } from '../lib/db/client';
import { getEngineRuntime, type EngineRuntime } from '../lib/engine/runtime';

import {
  buildSeedPlan,
  checkDatabaseUrl,
  SEED_ADMIN_ID,
  SEED_SLUG,
  type SeedPlan,
} from './seed-demo-data';

/** Minimal Prisma surface this script relies on (kept loose on purpose). */
interface SeedPrisma {
  community: {
    findUnique(args: { where: { slug: string } }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  member: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
  memberTokenBalance: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  communityTokenPolicy: { create(args: { data: Record<string, unknown> }): Promise<{ id: string }> };
  tokenPolicyVersion: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  communityTokenState: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  contribution: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

// Managers used as distinct approvers so no engine self-approval fires.
const APPROVER_ID = 'ben';
const SECOND_APPROVER_ID = 'dana';

function log(message: string): void {
  // Dev CLI diagnostic. Matches scripts/deploy-contract.ts console usage.
  // eslint-disable-next-line no-console
  console.log(message);
}

function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.error(message);
}

/** Tables cleared on --reset, in FK-safe order, all keyed by communityId. */
const RESET_TABLES_BY_COMMUNITY: readonly string[] = [
  'Vote',
  'ProposalMemberSnapshot',
  'TokenMintEvent',
  'TokenReversalEvent',
  'TokenAdvanceRequest',
  'Contribution',
  'TokenEpoch',
  'TokenPolicyVersion',
  'Proposal',
  'MemberTokenBalance',
  'CommunityTokenState',
  'CommunityTokenPolicy',
  'Member',
  'PublicRecord',
];

/**
 * Raw-SQL wipe of the demo community. Vote / ProposalMemberSnapshot key on
 * proposalId, so they are cleared via a subquery over the community's proposals;
 * TokenPolicyVersion keys on policyId, cleared via a subquery over the policy.
 * Demo database only.
 */
async function resetCommunity(prisma: SeedPrisma, communityId: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    'DELETE FROM "Vote" WHERE "proposalId" IN (SELECT "id" FROM "Proposal" WHERE "communityId" = $1)',
    communityId,
  );
  await prisma.$executeRawUnsafe(
    'DELETE FROM "ProposalMemberSnapshot" WHERE "proposalId" IN (SELECT "id" FROM "Proposal" WHERE "communityId" = $1)',
    communityId,
  );
  await prisma.$executeRawUnsafe(
    'DELETE FROM "TokenPolicyVersion" WHERE "policyId" IN (SELECT "id" FROM "CommunityTokenPolicy" WHERE "communityId" = $1)',
    communityId,
  );
  for (const table of RESET_TABLES_BY_COMMUNITY) {
    if (table === 'Vote' || table === 'ProposalMemberSnapshot' || table === 'TokenPolicyVersion') {
      continue;
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "communityId" = $1`, communityId);
  }
  await prisma.$executeRawUnsafe('DELETE FROM "Community" WHERE "id" = $1', communityId);
}

/** Create the community + policy + members + balances + genesis state rows. */
async function seedBaseRows(prisma: SeedPrisma, plan: SeedPlan): Promise<string> {
  const community = await prisma.community.create({
    data: {
      slug: plan.community.slug,
      name: plan.community.name,
      description: plan.community.description,
      ownerId: 'aria',
      isPublic: true,
    },
  });
  const communityId = community.id;

  const policy = await prisma.communityTokenPolicy.create({
    data: {
      communityId,
      tokenName: plan.policy.tokenName,
      tokenSymbol: plan.policy.tokenSymbol,
      initialSupply: plan.policy.initialSupply,
      currentTotalSupply: 0n,
      epochDurationDays: plan.policy.epochDurationDays,
      monthlyInflationRateBps: plan.policy.monthlyInflationRateBps,
      maxAdvanceRateBps: plan.policy.maxAdvanceRateBps,
      memberMintCapRateBps: plan.policy.memberMintCapRateBps,
      policyVersion: plan.policy.policyVersion,
      effectiveEpoch: 1,
      rules: plan.rules as unknown as object,
    },
  });

  await prisma.tokenPolicyVersion.create({
    data: {
      policyId: policy.id,
      version: plan.policyVersion.version,
      effectiveEpoch: plan.policyVersion.effectiveEpoch,
      monthlyInflationRateBps: plan.policyVersion.monthlyInflationRateBps,
      maxAdvanceRateBps: plan.policyVersion.maxAdvanceRateBps,
      memberMintCapRateBps: plan.policyVersion.memberMintCapRateBps,
      rules: plan.policyVersion.rules as unknown as object,
    },
  });

  await prisma.communityTokenState.create({
    data: {
      communityId,
      currentTotalSupply: plan.state.currentTotalSupply,
      ledgerSeq: plan.state.ledgerSeq,
    },
  });

  for (const member of plan.members) {
    await prisma.member.create({
      data: {
        id: member.id,
        communityId,
        displayName: member.displayName,
        role: member.role,
      },
    });
    await prisma.memberTokenBalance.create({
      data: { communityId, memberId: member.id },
    });
  }

  for (const c of plan.contributions) {
    await prisma.contribution.create({
      data: {
        id: c.id,
        communityId,
        memberId: c.memberId,
        description: c.description,
        ruleId: c.ruleId,
        suggestedTokenAmount: c.suggestedTokenAmount,
        approvedTokenAmount: c.approvedTokenAmount,
        status: c.status,
        submittedBy: c.memberId,
        reviewedBy: c.status === 'pending' ? null : SEED_ADMIN_ID,
      },
    });
  }

  return communityId;
}

/** Drive the engine runtime for allocation, epoch, mints, advance, proposals. */
async function seedViaEngine(
  runtime: EngineRuntime,
  plan: SeedPlan,
  communityId: string,
): Promise<void> {
  // 1) Initial allocation — engine enforces Σ = initialSupply, ledgerSeq, records.
  await runtime.mint.mintInitialAllocation({
    communityId,
    allocations: plan.initialAllocations.map((a) => ({ memberId: a.memberId, amount: a.amount })),
    reason: 'initial allocation',
    approvedBy: SEED_ADMIN_ID,
  });
  log(`Initial allocation minted (Σ = ${plan.policy.initialSupply} ${plan.policy.tokenSymbol}).`);

  // 2) Open Epoch 1 — budgets derived by the engine from openingSupply.
  await runtime.epoch.createNextEpoch(communityId);
  log(
    `Epoch 1 active: base ${plan.epoch1.baseMintBudget} / maxAdvance ` +
      `${plan.epoch1.maxAdvanceAmount} / memberCap ${plan.epoch1.memberEpochCap}.`,
  );

  // 3) Mint the plain approved contributions (Liam onboarding + a help reward).
  const plainMinted = plan.contributions.filter(
    (c) => c.minted && c.id !== plan.carolAdvance.contributionId,
  );
  for (const c of plainMinted) {
    await runtime.mint.mintForContribution({
      contributionId: c.id,
      approverId: APPROVER_ID,
      secondApproverId: SECOND_APPROVER_ID,
    });
    log(`Minted contribution ${c.id} (${c.approvedTokenAmount} ${plan.policy.tokenSymbol}).`);
  }

  // 4) Carol §29.3: dual-admin approved advance, then a 100/400 split mint.
  const advance = await runtime.advance.createRequest({
    communityId,
    memberId: plan.carolAdvance.memberId,
    amount: plan.carolAdvance.advancePortion,
    requestedBy: plan.carolAdvance.memberId,
    reason: 'infra advance (§29.3)',
  });
  await runtime.advance.secondApprove(advance.requestId, SECOND_APPROVER_ID);
  await runtime.mint.mintForContribution({
    contributionId: plan.carolAdvance.contributionId,
    approverId: APPROVER_ID,
    secondApproverId: SECOND_APPROVER_ID,
    advanceRequestId: advance.requestId,
  });
  log(
    `Carol mint split ${plan.carolAdvance.normalPortion} current + ` +
      `${plan.carolAdvance.advancePortion} advance (${plan.carolAdvance.advanceRateBps} bps).`,
  );

  // 5) Proposals: one active community_decision (snapshot + 3 votes), one draft.
  for (const p of plan.proposals) {
    const created = await runtime.proposal.create({
      communityId,
      title: p.title,
      type: p.type,
      createdBy: SEED_ADMIN_ID,
      options: p.options.map((o) => ({ id: o.id, label: o.label })),
      ...(p.policyChangePayload !== undefined
        ? { metadata: { policyChangePayload: p.policyChangePayload } }
        : {}),
    });
    if (p.status === 'active') {
      await runtime.proposal.activate(created.proposalId);
      for (const vote of p.votes) {
        await runtime.proposal.castVote({
          proposalId: created.proposalId,
          memberId: vote.memberId,
          optionId: vote.optionId,
        });
      }
    }
    log(`Proposal ${p.id} seeded (${p.type}, ${p.status}).`);
  }
}

/** Orchestrate a full seed run over an already-guarded environment. */
export async function runSeed(reset: boolean): Promise<void> {
  const prisma = getPrisma() as unknown as SeedPrisma;
  const runtime = await getEngineRuntime();
  const plan = buildSeedPlan();

  const existing = await prisma.community.findUnique({ where: { slug: SEED_SLUG } });
  if (existing !== null) {
    if (!reset) {
      log(`Community '${SEED_SLUG}' already exists (id ${existing.id}); skipping. Use --reset to re-seed.`);
      return;
    }
    log(`--reset: wiping existing '${SEED_SLUG}' community (id ${existing.id}).`);
    await resetCommunity(prisma, existing.id);
  }

  const communityId = await seedBaseRows(prisma, plan);
  await seedViaEngine(runtime, plan, communityId);

  if (process.env.REDIS_URL === undefined || process.env.REDIS_URL.length === 0) {
    log('REDIS_URL not set: chain-eligible PublicRecords stay pending (reconciler is the fallback).');
  }
  log(`Done. AdventureX demo seeded (community id ${communityId}).`);
}

/** Entry point: guard the environment, then run the seed. */
export async function main(argv: readonly string[]): Promise<number> {
  const guard = checkDatabaseUrl(process.env);
  if (!guard.ok) {
    warn(guard.message ?? 'DATABASE_URL is required.');
    return 1;
  }
  const reset = argv.includes('--reset');
  await runSeed(reset);
  return 0;
}

// Import-safe: only run when executed directly (pnpm tsx scripts/seed-demo.ts),
// so the offline unit tests can import the pure helpers without side effects.
const invokedPath = process.argv[1];
const isMain =
  invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href;

if (isMain) {
  // 显式 exit：Prisma 连接池等开句柄会让事件循环挂住不退（实测），
  // 一次性脚本用 process.exit 收尾是正确语义。
  main(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((error: unknown) => {
      warn(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
