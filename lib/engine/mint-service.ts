// Token mint engine service (W3-1). Two entry points:
//   - mintForContribution: the 13-step single-transaction regular mint, plus the
//     red-team-hardened split path (regular part + next-epoch advance part).
//   - mintInitialAllocation: the seed/genesis distribution entry point.
//
// Every business-condition raw UPDATE / row lock / ledger-seq allocation goes
// through lib/engine/{sql,db-locks,ledger-seq}.ts (single source of truth); this
// file never template-tags raw SQL. Ledger is append-only: mint rows are created
// once, then only publicRecordId is back-filled. The funds tx does zero network
// IO; records.requestSubmission runs strictly after the tx commits.

import type { RecordSource, TokenMintEventData } from '../blockchain/types';
import {
  calculateCumulativeAdvanceRateBps,
  calculateMemberEpochCap,
  calculateOwnershipPercentage,
  resolveAdvanceApproval,
} from './calc';
import { lockActiveEpoch, lockBalance, lockState } from './db-locks';
import { EngineError } from './errors';
import { allocateLedgerSeq } from './ledger-seq';
import { incrementAdvancedMintedGuarded, incrementRegularMintedGuarded } from './sql';
import type {
  BalanceRow,
  BudgetSource,
  EngineDeps,
  EngineTx,
  EpochRow,
  GovernanceStatus,
  MintOutcome,
  MintService,
  MintType,
  StateRow,
} from './types';

const GENESIS_EPOCH_ID = 'genesis';
const GENESIS_EPOCH_NUMBER = 0;
const RELATED_PARTY_ROLES = new Set(['owner', 'manager']);
/** The only proposal type that can authorize a related-party regular mint. */
const RELATED_PARTY_PROPOSAL_TYPE = 'related_party_mint';

interface PolicyRule {
  readonly id: string;
  readonly tokenAmount: number | string | bigint;
}
interface PolicyLite {
  readonly policyVersion: number;
  readonly memberMintCapRateBps: number;
  readonly rules: unknown;
}
interface ContributionLite {
  readonly id: string;
  readonly communityId: string;
  readonly memberId: string;
  readonly description: string;
  readonly ruleId: string | null;
  readonly approvedTokenAmount: bigint | null;
  readonly status: string;
  readonly evidence: string[];
}
interface AdvanceRequestLite {
  readonly id: string;
  readonly status: string;
  readonly contributionIds: string[];
  readonly requestedAmount: bigint;
  readonly approvedAmount: bigint | null;
  readonly relatedParty: boolean;
  readonly proposalId: string | null;
  readonly secondApprovedBy: string | null;
  readonly requestedBy: string;
}

/** Planned snapshot for one mint leg (no DB write yet). */
interface LegPlan {
  readonly amount: bigint;
  readonly budgetSource: BudgetSource;
  readonly governanceStatus: GovernanceStatus;
  readonly governanceActivationEpoch: number | null;
  readonly advanceRequestId: string | null;
  readonly memberBalanceBefore: bigint;
  readonly memberBalanceAfter: bigint;
  readonly totalSupplyBefore: bigint;
  readonly totalSupplyAfter: bigint;
  readonly activeGovernanceBefore: bigint;
  readonly activeGovernanceAfter: bigint;
  readonly ownershipPercentageBefore: number;
  readonly ownershipPercentageAfter: number;
}

/** The full TokenMintEvent create payload (append-only row). */
interface MintRowData {
  readonly communityId: string;
  readonly memberId: string;
  readonly epochId: string;
  readonly epochNumber: number;
  readonly mintType: MintType;
  readonly budgetSource: BudgetSource;
  readonly amount: bigint;
  readonly governanceActivationEpoch: number | null;
  readonly memberBalanceBefore: bigint;
  readonly memberBalanceAfter: bigint;
  readonly totalSupplyBefore: bigint;
  readonly totalSupplyAfter: bigint;
  readonly tokenPolicyVersion: number;
  readonly reason: string;
  readonly approvedBy: string;
  readonly governanceStatus: GovernanceStatus;
  readonly activeGovernanceBefore: bigint;
  readonly activeGovernanceAfter: bigint;
  readonly ownershipPercentageBefore: number;
  readonly ownershipPercentageAfter: number;
  readonly contributionId: string | null;
  readonly ruleId: string | null;
  readonly proposalId: string | null;
  readonly advanceRequestId: string | null;
  readonly secondApprovedBy: string | null;
  readonly relatedParty: boolean;
  readonly evidenceUrls: string[];
  readonly ledgerSeq: number;
  readonly createdAt: Date;
}

/** One created mint row plus the record kind + envelope source it maps to. */
interface PersistedEvent {
  readonly id: string;
  readonly recordType: 'token_mint' | 'advance_mint';
  readonly source: RecordSource;
  readonly amount: bigint;
  readonly budgetSource: BudgetSource;
  readonly governanceStatus: GovernanceStatus;
  publicRecordId: string | null;
}

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

function ruleTokenAmount(rules: unknown, ruleId: string | null): bigint | null {
  if (ruleId === null || !Array.isArray(rules)) return null;
  const rule = (rules as PolicyRule[]).find((r) => r && r.id === ruleId);
  return rule ? BigInt(rule.tokenAmount) : null;
}

/** Lock the member balance, creating a zeroed row first if none exists. */
async function lockOrCreateBalance(
  tx: EngineTx,
  communityId: string,
  memberId: string,
): Promise<BalanceRow> {
  const existing = await lockBalance(tx, communityId, memberId);
  if (existing) return existing;
  await tx.memberTokenBalance.create({
    data: {
      communityId,
      memberId,
      totalBalance: 0n,
      activeGovernanceBalance: 0n,
      pendingGovernanceBalance: 0n,
      tokensEarnedCurrentEpoch: 0n,
      tokensEarnedLifetime: 0n,
      tokensReversedLifetime: 0n,
    },
  });
  const created = await lockBalance(tx, communityId, memberId);
  if (!created) throw new EngineError('NOT_FOUND', 'balance row could not be created');
  return created;
}

/** Plan the mint legs with chained balance/supply snapshots. */
function planLegs(args: {
  balance: BalanceRow;
  state: StateRow;
  regularPart: bigint;
  advancePart: bigint;
  epochNumber: number;
  advanceRequestId: string | null;
}): LegPlan[] {
  const legs: LegPlan[] = [];
  let bal = args.balance.totalBalance;
  let sup = args.state.currentTotalSupply;
  let act = args.balance.activeGovernanceBalance;

  const push = (
    part: bigint,
    budgetSource: BudgetSource,
    governanceStatus: GovernanceStatus,
    gae: number | null,
    advanceRequestId: string | null,
    active: boolean,
  ): void => {
    const mbBefore = bal;
    const tsBefore = sup;
    const agBefore = act;
    bal += part;
    sup += part;
    if (active) act += part;
    legs.push({
      amount: part,
      budgetSource,
      governanceStatus,
      governanceActivationEpoch: gae,
      advanceRequestId,
      memberBalanceBefore: mbBefore,
      memberBalanceAfter: bal,
      totalSupplyBefore: tsBefore,
      totalSupplyAfter: sup,
      activeGovernanceBefore: agBefore,
      activeGovernanceAfter: act,
      ownershipPercentageBefore: calculateOwnershipPercentage(mbBefore, tsBefore),
      ownershipPercentageAfter: calculateOwnershipPercentage(bal, sup),
    });
  };

  if (args.regularPart > 0n) push(args.regularPart, 'current_epoch', 'active', null, null, true);
  if (args.advancePart > 0n) {
    push(args.advancePart, 'next_epoch_advance', 'pending', args.epochNumber + 1, args.advanceRequestId, false);
  }
  return legs;
}

/** Insert one append-only mint row and derive its record source (P2002 -> ALREADY_MINTED). */
async function insertMintEvent(tx: EngineTx, data: MintRowData): Promise<PersistedEvent> {
  let row: { id: string };
  try {
    row = (await tx.tokenMintEvent.create({ data })) as { id: string };
  } catch (err) {
    if (isP2002(err)) throw new EngineError('ALREADY_MINTED');
    throw err;
  }
  const recordType = data.budgetSource === 'current_epoch' ? 'token_mint' : 'advance_mint';
  const mintEvent: TokenMintEventData = {
    id: row.id,
    communityId: data.communityId,
    memberId: data.memberId,
    epochNumber: data.epochNumber,
    mintType: data.mintType,
    budgetSource: data.budgetSource,
    amount: data.amount,
    memberBalanceBefore: data.memberBalanceBefore,
    memberBalanceAfter: data.memberBalanceAfter,
    totalSupplyBefore: data.totalSupplyBefore,
    totalSupplyAfter: data.totalSupplyAfter,
    governanceActivationEpoch: data.governanceActivationEpoch,
    tokenPolicyVersion: data.tokenPolicyVersion,
    createdAt: data.createdAt,
    ledgerSeq: data.ledgerSeq,
  };
  return {
    id: row.id,
    recordType,
    source: { kind: recordType, mintEvent },
    amount: data.amount,
    budgetSource: data.budgetSource,
    governanceStatus: data.governanceStatus,
    publicRecordId: null,
  };
}

/** Read + validate the advance request backing a split (red-team gate). */
async function resolveSplit(
  tx: EngineTx,
  advanceRequestId: string,
  contributionId: string,
): Promise<AdvanceRequestLite> {
  const req = (await tx.tokenAdvanceRequest.findUnique({
    where: { id: advanceRequestId },
  })) as AdvanceRequestLite | null;
  if (!req) throw new EngineError('NOT_FOUND', 'advance request not found');
  const ids = Array.isArray(req.contributionIds) ? req.contributionIds : [];
  if (req.status !== 'approved' || !ids.includes(contributionId)) {
    throw new EngineError('INVALID_STATUS', 'advance request not usable for this contribution');
  }
  return req;
}

/** Re-derive the cumulative advance rate and re-check the approval tier. */
async function verifyAdvanceApproval(
  tx: EngineTx,
  req: AdvanceRequestLite,
  epoch: EpochRow,
  advancePart: bigint,
): Promise<void> {
  const cumulativeBps = calculateCumulativeAdvanceRateBps(
    epoch.advancedMintedAmount,
    advancePart,
    epoch.baseMintBudget,
  );
  const path = resolveAdvanceApproval(cumulativeBps, req.relatedParty, false);
  if (path === 'system_forbidden') throw new EngineError('ADVANCE_RATE_EXCEEDED');
  if (path === 'community_proposal') {
    if (req.proposalId === null) throw new EngineError('PROPOSAL_REQUIRED');
    const proposal = (await tx.proposal.findUnique({ where: { id: req.proposalId } })) as
      | { status: string }
      | null;
    if (!proposal || proposal.status !== 'recorded') throw new EngineError('PROPOSAL_REQUIRED');
  } else if (path === 'dual_admin') {
    if (req.secondApprovedBy === null || req.secondApprovedBy === req.requestedBy) {
      throw new EngineError('SECOND_APPROVER_REQUIRED');
    }
  }
}

/**
 * A related-party regular mint that takes the proposal path must be backed by a
 * PASSED community proposal — not just a non-empty proposalId string, and not
 * merely a `recorded` one. `recorded` is the terminal status for EVERY ended
 * proposal, including ones the community voted down: proposal-service end()
 * settles reject / tie / zero-vote ballots to status='recorded' with
 * winningOptionId='reject', and delegates the related_party_mint execution
 * authority to this downstream engine to re-verify the vote result. So a bare
 * `recorded` check would let a rejected (or below-quorum) proposal authorize the
 * mint, and — with no target binding — let one proposal be replayed for any
 * member's related-party mint. Mirroring the proposal-service settlement gate
 * (quorumMet && winningOptionId==='approve') and the reversal-service target
 * binding, the proposal must additionally: have won with 'approve', have met
 * quorum (voterCount >= minimumVoterCount), and specifically authorize THIS
 * member (specialMintRecipientId === memberId). Anything else fails closed with
 * PROPOSAL_REQUIRED.
 *
 * Finally, the authorization is single-use. A passed related_party_mint proposal
 * approves ONE special mint for its target member — not a standing license. The
 * contribution idempotency gate (step 2) only stops re-minting the SAME
 * contribution, so without a consumption check the same proposalId could be
 * replayed across the member's every future approved contribution, quietly
 * turning one community vote into permanent related-party minting authority. Each
 * mint row records the proposalId that authorized it (append-only), so the
 * presence of ANY prior mint event carrying this proposalId means the
 * authorization is already spent: fail closed with CONFLICT.
 */
async function requireRelatedPartyProposal(
  tx: EngineTx,
  proposalId: string,
  communityId: string,
  memberId: string,
): Promise<void> {
  const proposal = (await tx.proposal.findUnique({ where: { id: proposalId } })) as
    | {
        status: string;
        type: string | null;
        communityId: string;
        winningOptionId: string | null;
        voterCount: number | null;
        minimumVoterCount: number | null;
        specialMintRecipientId: string | null;
      }
    | null;
  const quorumMet =
    typeof proposal?.voterCount === 'number' &&
    typeof proposal?.minimumVoterCount === 'number' &&
    proposal.voterCount >= proposal.minimumVoterCount;
  if (
    !proposal ||
    proposal.status !== 'recorded' ||
    proposal.type !== RELATED_PARTY_PROPOSAL_TYPE ||
    proposal.communityId !== communityId ||
    proposal.winningOptionId !== 'approve' ||
    !quorumMet ||
    proposal.specialMintRecipientId !== memberId
  ) {
    throw new EngineError('PROPOSAL_REQUIRED');
  }
  // Single-use: reject if this passed proposal has already authorized a prior
  // mint (its proposalId is stamped on every mint row it backs).
  const alreadyConsumed = await tx.tokenMintEvent.findFirst({ where: { proposalId } });
  if (alreadyConsumed) {
    throw new EngineError('CONFLICT', 'related-party mint proposal already consumed');
  }
}

function buildOutcome(
  created: readonly PersistedEvent[],
  memberBalanceAfter: bigint,
  totalSupplyAfter: bigint,
): MintOutcome {
  return {
    mintEvents: created.map((ev) => ({
      id: ev.id,
      amount: ev.amount,
      budgetSource: ev.budgetSource,
      governanceStatus: ev.governanceStatus,
      publicRecordId: ev.publicRecordId,
    })),
    memberBalanceAfter,
    totalSupplyAfter,
  };
}

export function createMintService(deps: EngineDeps): MintService {
  const clock = (): Date => deps.now?.() ?? new Date();

  /** buildEnvelope + createPendingRecord + publicRecordId back-fill for one row. */
  async function attachRecord(tx: EngineTx, ev: PersistedEvent, communityId: string): Promise<string> {
    const { envelope, recordHash } = deps.buildEnvelope(ev.source);
    const rec = await deps.records.createPendingRecord(tx, {
      recordType: ev.recordType,
      sourceTable: 'TokenMintEvent',
      sourceId: ev.id,
      communityId,
      envelope,
      recordHash,
    });
    await tx.tokenMintEvent.update({ where: { id: ev.id }, data: { publicRecordId: rec.id } });
    ev.publicRecordId = rec.id;
    return rec.id;
  }

  /** Enqueue chain submission strictly after the tx commits; reconciler is the backstop. */
  async function submitAfterCommit(recordIds: readonly string[]): Promise<void> {
    for (const recordId of recordIds) {
      try {
        await deps.records.requestSubmission(recordId);
      } catch (err) {
        console.error(`requestSubmission failed for record ${recordId}`, err);
      }
    }
  }

  async function mintForContribution(input: {
    contributionId: string;
    approverId: string;
    secondApproverId?: string;
    proposalId?: string;
    advanceRequestId?: string;
  }): Promise<MintOutcome> {
    const now = clock();

    const { outcome, recordIds } = await deps.db.$transaction(async (tx) => {
      // 1) Contribution existence + approval.
      const contribution = (await tx.contribution.findUnique({
        where: { id: input.contributionId },
      })) as ContributionLite | null;
      if (!contribution) throw new EngineError('NOT_FOUND', 'contribution not found');
      if (contribution.status !== 'approved') throw new EngineError('NOT_APPROVED');
      const { communityId, memberId } = contribution;

      // 2) Idempotency: ANY prior mint for this contribution (current_epoch OR
      //    next_epoch_advance) means it was already processed. Filtering on
      //    budgetSource='current_epoch' would miss a pure-advance split (regular
      //    part == 0), letting an epoch-switch replay double-mint the full amount
      //    since the [contributionId, budgetSource] unique key differs.
      const existing = await tx.tokenMintEvent.findFirst({
        where: { contributionId: contribution.id },
      });
      if (existing) throw new EngineError('ALREADY_MINTED');

      // 3) Active epoch lock.
      const epoch = await lockActiveEpoch(tx, communityId);
      if (!epoch) throw new EngineError('EPOCH_NOT_ACTIVE');

      // 4) Policy + state + balance (create-then-lock zero balance if missing).
      const policy = (await tx.communityTokenPolicy.findUnique({
        where: { communityId },
      })) as PolicyLite | null;
      if (!policy) throw new EngineError('NOT_FOUND', 'policy not found');
      const state = await lockState(tx, communityId);
      if (!state) throw new EngineError('NOT_FOUND', 'community token state not found');
      const balance = await lockOrCreateBalance(tx, communityId, memberId);

      // 5) Amount + rule ceiling.
      const amount = contribution.approvedTokenAmount ?? 0n;
      if (amount <= 0n) throw new EngineError('RULE_VIOLATION', 'non-positive approved amount');
      const ruleCeiling = ruleTokenAmount(policy.rules, contribution.ruleId);
      if (ruleCeiling === null || amount > ruleCeiling) {
        throw new EngineError('RULE_VIOLATION', 'amount exceeds rule ceiling');
      }

      // 6) Per-member single-epoch cap.
      const cap = calculateMemberEpochCap(epoch.baseMintBudget, policy.memberMintCapRateBps);
      if (balance.tokensEarnedCurrentEpoch + amount > cap) throw new EngineError('MEMBER_CAP_EXCEEDED');

      // 7) Related-party arbitration (§6.2, conventions). Self-approval is
      //    forbidden. A related party (owner/manager) needs a real governance
      //    path: either a distinct second approver (dual-admin) OR a PASSED
      //    related_party_mint community proposal for THIS community. A bare
      //    proposalId string is NOT sufficient — the proposal is validated to
      //    exist, be recorded, be the right type, match the community, have won
      //    with 'approve', have met quorum, and target THIS member.
      if (input.secondApproverId !== undefined && input.secondApproverId === input.approverId) {
        throw new EngineError('FORBIDDEN', 'self approval');
      }
      const member = (await tx.member.findUnique({ where: { id: memberId } })) as { role: string } | null;
      if (!member) throw new EngineError('NOT_FOUND', 'member not found');
      const relatedParty = RELATED_PARTY_ROLES.has(member.role);
      if (relatedParty) {
        if (input.proposalId !== undefined) {
          await requireRelatedPartyProposal(tx, input.proposalId, communityId, memberId);
        } else if (input.secondApproverId === undefined) {
          throw new EngineError('SECOND_APPROVER_REQUIRED');
        }
      }

      // 8) Budget resolution: full-cover single mint vs hardened split.
      const normalRemaining = epoch.effectiveRegularBudget - epoch.regularMintedAmount;
      let regularPart: bigint;
      let advancePart: bigint;
      let advanceRequest: AdvanceRequestLite | null = null;
      if (amount <= normalRemaining) {
        regularPart = amount;
        advancePart = 0n;
      } else if (input.advanceRequestId === undefined) {
        throw new EngineError('INSUFFICIENT_BUDGET');
      } else {
        advanceRequest = await resolveSplit(tx, input.advanceRequestId, contribution.id);
        regularPart = normalRemaining > 0n ? normalRemaining : 0n;
        advancePart = amount - regularPart;
        // (a) the request's approved/requested amount is the split ceiling.
        const requestCeiling = advanceRequest.approvedAmount ?? advanceRequest.requestedAmount;
        if (advancePart > requestCeiling) throw new EngineError('ADVANCE_CAP_EXCEEDED');
        // (b) re-derived cumulative rate re-checks the approval tier.
        await verifyAdvanceApproval(tx, advanceRequest, epoch, advancePart);
        // (c) no rolling advance while prior-epoch debt is outstanding.
        if (epoch.advanceDebtFromPreviousEpoch > 0n) throw new EngineError('ROLLING_ADVANCE_FORBIDDEN');
      }

      // 9) Plan legs, then create each append-only mint row.
      const legs = planLegs({
        balance,
        state,
        regularPart,
        advancePart,
        epochNumber: epoch.epochNumber,
        advanceRequestId: advanceRequest?.id ?? null,
      });
      const created: PersistedEvent[] = [];
      for (const leg of legs) {
        const ledgerSeq = await allocateLedgerSeq(tx, communityId);
        created.push(
          await insertMintEvent(tx, {
            communityId,
            memberId,
            epochId: epoch.id,
            epochNumber: epoch.epochNumber,
            mintType: 'contribution',
            budgetSource: leg.budgetSource,
            amount: leg.amount,
            governanceActivationEpoch: leg.governanceActivationEpoch,
            memberBalanceBefore: leg.memberBalanceBefore,
            memberBalanceAfter: leg.memberBalanceAfter,
            totalSupplyBefore: leg.totalSupplyBefore,
            totalSupplyAfter: leg.totalSupplyAfter,
            tokenPolicyVersion: policy.policyVersion,
            reason: contribution.description,
            approvedBy: input.approverId,
            governanceStatus: leg.governanceStatus,
            activeGovernanceBefore: leg.activeGovernanceBefore,
            activeGovernanceAfter: leg.activeGovernanceAfter,
            ownershipPercentageBefore: leg.ownershipPercentageBefore,
            ownershipPercentageAfter: leg.ownershipPercentageAfter,
            contributionId: contribution.id,
            ruleId: contribution.ruleId,
            proposalId: input.proposalId ?? null,
            advanceRequestId: leg.advanceRequestId,
            secondApprovedBy: input.secondApproverId ?? null,
            relatedParty,
            evidenceUrls: contribution.evidence,
            ledgerSeq,
            createdAt: now,
          }),
        );
      }

      // 10) Member balance.
      await tx.memberTokenBalance.update({
        where: { communityId_memberId: { communityId, memberId } },
        data: {
          totalBalance: { increment: amount },
          activeGovernanceBalance: { increment: regularPart },
          pendingGovernanceBalance: { increment: advancePart },
          tokensEarnedCurrentEpoch: { increment: regularPart },
          tokensEarnedLifetime: { increment: amount },
          lastMintAt: now,
        },
      });

      // 11) Community supply.
      await tx.communityTokenState.update({
        where: { communityId },
        data: { currentTotalSupply: { increment: amount } },
      });

      // 12) Metered guards (concurrency defense) — 0 rows rolls the tx back.
      if ((await incrementRegularMintedGuarded(tx, epoch.id, regularPart)) === 0) {
        throw new EngineError('INSUFFICIENT_BUDGET');
      }
      if (advancePart > 0n && (await incrementAdvancedMintedGuarded(tx, epoch.id, advancePart)) === 0) {
        throw new EngineError('ADVANCE_CAP_EXCEEDED');
      }

      // 13) Consume the advance request exactly once (split only).
      if (advanceRequest && advancePart > 0n) {
        await tx.tokenAdvanceRequest.update({
          where: { id: advanceRequest.id },
          data: { status: 'executed', approvedAmount: advancePart, executedAt: now },
        });
      }

      // 14) A PublicRecord per mint row; back-fill publicRecordId.
      const recordIds: string[] = [];
      for (const ev of created) recordIds.push(await attachRecord(tx, ev, communityId));

      const last = legs[legs.length - 1];
      return { recordIds, outcome: buildOutcome(created, last.memberBalanceAfter, last.totalSupplyAfter) };
    });

    await submitAfterCommit(recordIds);
    return outcome;
  }

  async function mintInitialAllocation(input: {
    communityId: string;
    allocations: ReadonlyArray<{ memberId: string; amount: bigint }>;
    reason: string;
    approvedBy: string;
  }): Promise<MintOutcome> {
    const now = clock();
    const { communityId } = input;

    const { outcome, recordIds } = await deps.db.$transaction(async (tx) => {
      // Idempotent seed: reject if the community was already seeded.
      const seeded = await tx.tokenMintEvent.findFirst({
        where: { communityId, mintType: 'initial_allocation' },
      });
      if (seeded) throw new EngineError('ALREADY_MINTED');

      const state = await lockState(tx, communityId);
      if (!state) throw new EngineError('NOT_FOUND', 'community token state not found');
      const policy = (await tx.communityTokenPolicy.findUnique({
        where: { communityId },
      })) as PolicyLite | null;
      if (!policy) throw new EngineError('NOT_FOUND', 'policy not found');

      const created: PersistedEvent[] = [];
      let supply = state.currentTotalSupply;
      let lastMemberBalanceAfter = 0n;

      for (const alloc of input.allocations) {
        if (alloc.amount <= 0n) throw new EngineError('VALIDATION_ERROR', 'non-positive allocation');
        const balance = await lockOrCreateBalance(tx, communityId, alloc.memberId);
        const ledgerSeq = await allocateLedgerSeq(tx, communityId);
        const memberBalanceBefore = balance.totalBalance;
        const memberBalanceAfter = balance.totalBalance + alloc.amount;
        const totalSupplyBefore = supply;
        const totalSupplyAfter = supply + alloc.amount;
        supply = totalSupplyAfter;
        lastMemberBalanceAfter = memberBalanceAfter;

        created.push(
          await insertMintEvent(tx, {
            communityId,
            memberId: alloc.memberId,
            epochId: GENESIS_EPOCH_ID,
            epochNumber: GENESIS_EPOCH_NUMBER,
            mintType: 'initial_allocation',
            budgetSource: 'current_epoch',
            amount: alloc.amount,
            governanceActivationEpoch: null,
            memberBalanceBefore,
            memberBalanceAfter,
            totalSupplyBefore,
            totalSupplyAfter,
            tokenPolicyVersion: policy.policyVersion,
            reason: input.reason,
            approvedBy: input.approvedBy,
            governanceStatus: 'active',
            activeGovernanceBefore: balance.activeGovernanceBalance,
            activeGovernanceAfter: balance.activeGovernanceBalance + alloc.amount,
            ownershipPercentageBefore: calculateOwnershipPercentage(memberBalanceBefore, totalSupplyBefore),
            ownershipPercentageAfter: calculateOwnershipPercentage(memberBalanceAfter, totalSupplyAfter),
            contributionId: null,
            ruleId: null,
            proposalId: null,
            advanceRequestId: null,
            secondApprovedBy: null,
            relatedParty: false,
            evidenceUrls: [],
            ledgerSeq,
            createdAt: now,
          }),
        );

        await tx.memberTokenBalance.update({
          where: { communityId_memberId: { communityId, memberId: alloc.memberId } },
          data: {
            totalBalance: { increment: alloc.amount },
            activeGovernanceBalance: { increment: alloc.amount },
            tokensEarnedLifetime: { increment: alloc.amount },
            lastMintAt: now,
          },
        });
      }

      await tx.communityTokenState.update({
        where: { communityId },
        data: { currentTotalSupply: { increment: supply - state.currentTotalSupply } },
      });

      const recordIds: string[] = [];
      for (const ev of created) recordIds.push(await attachRecord(tx, ev, communityId));
      return { recordIds, outcome: buildOutcome(created, lastMemberBalanceAfter, supply) };
    });

    await submitAfterCommit(recordIds);
    return outcome;
  }

  return { mintForContribution, mintInitialAllocation };
}
