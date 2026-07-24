// Advance-request service (§6.2/§6.4): a six-state approval machine plus the
// single-transaction advance-mint execution path. All business-condition raw
// SQL goes through sql.ts / db-locks.ts / ledger-seq.ts; this file never
// template-tags SQL. relatedParty is DERIVED from the target member's role
// (owner|manager) per the unified rule — never passed in (AdvanceRequestInput,
// the frozen contract, carries no relatedParty field), never cross-inferred.

import type { RecordSource } from '../blockchain/types';
import {
  calculateCumulativeAdvanceRateBps,
  calculateOwnershipPercentage,
  resolveAdvanceApproval,
} from './calc';
import { createDbOnlyRecord } from './db-only-records';
import { lockActiveEpoch, lockBalance, lockEpochById, lockState } from './db-locks';
import { EngineError } from './errors';
import { allocateLedgerSeq } from './ledger-seq';
import { incrementAdvancedMintedGuarded } from './sql';
import type {
  AdvanceRequestInput,
  AdvanceRequestSummary,
  AdvanceService,
  EngineDeps,
  EngineTx,
  MintOutcome,
} from './types';

// ---- Local row projections (the fake + real client both satisfy these) ----

interface AdvanceRow {
  readonly id: string;
  readonly communityId: string;
  readonly epochId: string;
  readonly memberId: string;
  readonly requestedAmount: bigint;
  readonly approvedAmount: bigint | null;
  readonly reason: string;
  readonly status: string;
  readonly relatedParty: boolean;
  readonly requestedBy: string;
  readonly secondApprovedBy: string | null;
  readonly proposalId: string | null;
  readonly publicRecordId: string | null;
}

interface MemberRow { readonly role: string }
interface PolicyLite { readonly maxAdvanceRateBps: number; readonly policyVersion: number }
interface ProposalLite { readonly status: string }
interface MintRow {
  readonly id: string;
  readonly amount: bigint;
  readonly governanceStatus: string;
  readonly publicRecordId: string | null;
  readonly memberBalanceAfter: bigint;
  readonly totalSupplyAfter: bigint;
}

const RELATED_PARTY_ROLES: ReadonlySet<string> = new Set(['owner', 'manager']);
const ADVANCE_RATE_CLAMP_BPS = 2500;
const PROPOSAL_THRESHOLD_BPS = 1000;

/** Reconstruct a MintOutcome from an already-persisted advance mint event. */
function mintOutcomeFrom(mint: MintRow): MintOutcome {
  return {
    mintEvents: [
      {
        id: mint.id,
        amount: mint.amount,
        budgetSource: 'next_epoch_advance',
        governanceStatus: mint.governanceStatus === 'active' ? 'active' : 'pending',
        publicRecordId: mint.publicRecordId,
      },
    ],
    memberBalanceAfter: mint.memberBalanceAfter,
    totalSupplyAfter: mint.totalSupplyAfter,
  };
}

/**
 * Build the AdvanceService bound to `deps`. Frozen signature:
 * `createAdvanceService(deps: EngineDeps): AdvanceService`.
 */
export function createAdvanceService(deps: EngineDeps): AdvanceService {
  const { db } = deps;
  const now = (): Date => (deps.now ? deps.now() : new Date());

  async function loadRequest(tx: EngineTx, id: string): Promise<AdvanceRow> {
    const row = (await tx.tokenAdvanceRequest.findUnique({ where: { id } })) as AdvanceRow | null;
    if (!row) throw new EngineError('NOT_FOUND', `advance request ${id} not found`);
    return row;
  }

  const summary = (row: { id: string }, status: string): AdvanceRequestSummary => ({
    requestId: row.id,
    status,
  });

  async function createRequest(input: AdvanceRequestInput): Promise<AdvanceRequestSummary> {
    return db.$transaction(async (tx) => {
      const epoch = await lockActiveEpoch(tx, input.communityId);
      if (!epoch) throw new EngineError('EPOCH_NOT_ACTIVE', 'no active epoch');
      if (epoch.advanceDebtFromPreviousEpoch > 0n) {
        throw new EngineError('ROLLING_ADVANCE_FORBIDDEN', 'outstanding advance debt');
      }
      const member = (await tx.member.findUnique({ where: { id: input.memberId } })) as MemberRow | null;
      if (!member) throw new EngineError('NOT_FOUND', `member ${input.memberId} not found`);

      const relatedParty = RELATED_PARTY_ROLES.has(member.role);
      const cumulativeBps = calculateCumulativeAdvanceRateBps(
        epoch.advancedMintedAmount,
        input.amount,
        epoch.baseMintBudget,
      );
      const path = resolveAdvanceApproval(cumulativeBps, relatedParty, input.isSpecialNoContribution ?? false);

      let status: string;
      if (path === 'system_forbidden') {
        throw new EngineError('ADVANCE_RATE_EXCEEDED', 'advance rate exceeds hard cap');
      } else if (path === 'standard_rule') {
        throw new EngineError('CONFLICT', 'zero advance should use the normal mint path');
      } else if (path === 'dual_admin') {
        status = 'pending_second_approval';
      } else {
        status = 'pending_proposal';
      }

      const created = (await tx.tokenAdvanceRequest.create({
        data: {
          communityId: input.communityId,
          epochId: epoch.id,
          memberId: input.memberId,
          requestedAmount: input.amount,
          approvedAmount: null,
          advanceRateBps: Math.min(cumulativeBps, ADVANCE_RATE_CLAMP_BPS),
          reason: input.reason ?? '',
          contributionIds: input.contributionIds ?? [],
          status,
          relatedParty,
          requestedBy: input.requestedBy,
          secondApprovedBy: null,
          proposalId: null,
          createdAt: now(),
        },
      })) as { id: string };
      return summary(created, status);
    });
  }

  async function secondApprove(id: string, approverId: string): Promise<AdvanceRequestSummary> {
    return db.$transaction(async (tx) => {
      const req = await loadRequest(tx, id);
      if (req.status === 'approved') {
        if (req.secondApprovedBy === approverId) return summary(req, 'approved');
        throw new EngineError('INVALID_STATUS', 'already approved by another admin');
      }
      if (req.status !== 'pending_second_approval') {
        throw new EngineError('INVALID_STATUS', `cannot second-approve from ${req.status}`);
      }
      if (approverId === req.requestedBy) throw new EngineError('FORBIDDEN', 'self-approval is forbidden');
      await tx.tokenAdvanceRequest.update({
        where: { id },
        data: { status: 'approved', secondApprovedBy: approverId, approvedAt: now() },
      });
      return summary(req, 'approved');
    });
  }

  async function attachProposal(id: string, proposalId: string): Promise<AdvanceRequestSummary> {
    return db.$transaction(async (tx) => {
      const req = await loadRequest(tx, id);
      if (req.proposalId === proposalId) return summary(req, req.status); // idempotent same-id
      if (req.status !== 'pending_proposal') {
        throw new EngineError('INVALID_STATUS', `cannot attach proposal from ${req.status}`);
      }
      if (req.proposalId !== null) throw new EngineError('CONFLICT', 'a different proposal is already attached');
      await tx.tokenAdvanceRequest.update({ where: { id }, data: { proposalId } });
      return summary(req, 'pending_proposal');
    });
  }

  async function reject(id: string, _actorId: string): Promise<AdvanceRequestSummary> {
    return db.$transaction(async (tx) => {
      const req = await loadRequest(tx, id);
      if (req.status === 'rejected') return summary(req, 'rejected'); // terminal no-op
      if (req.status !== 'pending_second_approval' && req.status !== 'pending_proposal') {
        throw new EngineError('INVALID_STATUS', `cannot reject from ${req.status}`);
      }
      await tx.tokenAdvanceRequest.update({ where: { id }, data: { status: 'rejected' } });
      return summary(req, 'rejected');
    });
  }

  async function execute(input: {
    requestId: string;
    memberId?: string;
    evidenceUrls?: string[];
  }): Promise<MintOutcome> {
    const { outcome, advanceRecordId } = await db.$transaction(async (tx) => {
      const req = await loadRequest(tx, input.requestId);

      // Idempotent replay: an executed request re-yields its recorded mint.
      if (req.status === 'executed') {
        const existing = (await tx.tokenMintEvent.findFirst({
          where: { advanceRequestId: req.id },
        })) as MintRow | null;
        if (!existing) throw new EngineError('CONFLICT', 'executed request has no mint event');
        return { outcome: mintOutcomeFrom(existing), advanceRecordId: null };
      }
      if (req.status !== 'approved') throw new EngineError('INVALID_STATUS', `cannot execute from ${req.status}`);

      const epoch = await lockEpochById(tx, req.epochId);
      if (!epoch || epoch.status !== 'active') throw new EngineError('EPOCH_NOT_ACTIVE', 'epoch is not active');

      // Concurrency guard (§6.4 double-execute): the pre-lock findUnique above ran
      // on a statement snapshot that cannot see a rival transaction's not-yet-
      // committed mint. Now that we hold the epoch row lock (FOR UPDATE) — the same
      // lock every execute of this request serializes on — re-check for an already-
      // persisted mint keyed by advanceRequestId. If a rival committed first, replay
      // its mint instead of minting a second time. The unconditional status flip is
      // not a CAS, so this existence check is the authoritative double-mint guard.
      const priorMint = (await tx.tokenMintEvent.findFirst({
        where: { advanceRequestId: req.id },
      })) as MintRow | null;
      if (priorMint) {
        return { outcome: mintOutcomeFrom(priorMint), advanceRecordId: null };
      }

      const amount = req.approvedAmount ?? req.requestedAmount;
      if (epoch.effectiveRegularBudget - epoch.regularMintedAmount >= amount) {
        throw new EngineError('CONFLICT', 'REGULAR_BUDGET_SUFFICIENT');
      }
      if (epoch.advanceDebtFromPreviousEpoch > 0n) {
        throw new EngineError('ROLLING_ADVANCE_FORBIDDEN', 'outstanding advance debt');
      }

      const policy = (await tx.communityTokenPolicy.findUnique({
        where: { communityId: req.communityId },
      })) as PolicyLite | null;
      if (!policy) throw new EngineError('NOT_FOUND', 'no token policy for community');

      const cumulativeBps = calculateCumulativeAdvanceRateBps(
        epoch.advancedMintedAmount,
        amount,
        epoch.baseMintBudget,
      );
      // §6.2 system hard cap: cumulative advance beyond 2500 bps is categorically
      // forbidden and must never be weakened by a laxer policy.maxAdvanceRateBps
      // (assertBps admits 0..10000). Checked before the policy cap so the stricter
      // of the two always governs. createRequest's 2500 gate cannot cover growth in
      // advancedMintedAmount between creation and execution, so it is re-asserted here.
      if (cumulativeBps > ADVANCE_RATE_CLAMP_BPS) {
        throw new EngineError('ADVANCE_RATE_EXCEEDED', 'cumulative advance exceeds system hard cap');
      }
      if (cumulativeBps > policy.maxAdvanceRateBps) {
        throw new EngineError('ADVANCE_RATE_EXCEEDED', 'cumulative advance exceeds policy cap');
      }

      // Approval recheck (§6.2): proposal governance vs dual-admin. A proposalId is
      // only ever attached to a request that took the pending_proposal route
      // (attachProposal requires that status), so its presence — not the recomputed
      // bps alone — authoritatively marks the governance path. Routing on it (rather
      // than on bps/relatedParty) correctly authorizes special-no-contribution mints,
      // which take the proposal route at any bps: keying off bps would misroute a
      // low-bps special mint to the dual-admin branch and dead-lock it on a second
      // approver its proposal flow never produced.
      if (req.proposalId !== null) {
        const proposal = (await tx.proposal.findUnique({
          where: { id: req.proposalId },
        })) as ProposalLite | null;
        if (!proposal || proposal.status !== 'recorded') {
          throw new EngineError('PROPOSAL_REQUIRED', 'proposal is not recorded');
        }
      } else if (cumulativeBps > PROPOSAL_THRESHOLD_BPS || req.relatedParty) {
        throw new EngineError('PROPOSAL_REQUIRED', 'community proposal required');
      } else if (req.secondApprovedBy === null || req.secondApprovedBy === req.requestedBy) {
        throw new EngineError('SECOND_APPROVER_REQUIRED', 'a distinct second approver is required');
      }

      // Cross-service lock order MUST mirror mint-service and reversal-service
      // (epoch -> state -> balance): the epoch row is already held (lockEpochById
      // above), so CommunityTokenState is acquired strictly BEFORE
      // MemberTokenBalance. A concurrent token_reversal (mintEvent -> state ->
      // balance) or contribution mint (epoch -> state -> balance) on the same
      // community+member would otherwise form a lock cycle — Postgres aborts one
      // side after ~1s with 40P01. Inverting these two (balance before state) is
      // exactly the deadlock the reversal-service invariant guards against.
      const state = await lockState(tx, req.communityId);
      if (!state) throw new EngineError('NOT_FOUND', 'no token state for community');

      // Balance snapshot (create a zero row if the member has none yet).
      let balance = await lockBalance(tx, req.communityId, req.memberId);
      if (!balance) {
        await tx.memberTokenBalance.create({
          data: {
            communityId: req.communityId,
            memberId: req.memberId,
            totalBalance: 0n,
            activeGovernanceBalance: 0n,
            pendingGovernanceBalance: 0n,
          },
        });
        balance = await lockBalance(tx, req.communityId, req.memberId);
      }
      if (!balance) throw new EngineError('NOT_FOUND', 'member balance row unavailable');

      const balanceBefore = balance.totalBalance;
      const balanceAfter = balanceBefore + amount;
      const supplyBefore = state.currentTotalSupply;
      const supplyAfter = supplyBefore + amount;
      const activeGovernance = balance.activeGovernanceBalance;
      const ledgerSeq = await allocateLedgerSeq(tx, req.communityId);
      const governanceActivationEpoch = epoch.epochNumber + 1;
      const createdAt = now();

      const mint = (await tx.tokenMintEvent.create({
        data: {
          communityId: req.communityId,
          memberId: req.memberId,
          epochId: epoch.id,
          epochNumber: epoch.epochNumber,
          mintType: 'special_reward',
          budgetSource: 'next_epoch_advance',
          amount,
          governanceActivationEpoch,
          governanceStatus: 'pending',
          memberBalanceBefore: balanceBefore,
          memberBalanceAfter: balanceAfter,
          totalSupplyBefore: supplyBefore,
          totalSupplyAfter: supplyAfter,
          activeGovernanceBefore: activeGovernance,
          activeGovernanceAfter: activeGovernance,
          ownershipPercentageBefore: calculateOwnershipPercentage(balanceBefore, supplyBefore),
          ownershipPercentageAfter: calculateOwnershipPercentage(balanceAfter, supplyAfter),
          tokenPolicyVersion: policy.policyVersion,
          reason: req.reason,
          approvedBy: req.requestedBy,
          secondApprovedBy: req.secondApprovedBy,
          relatedParty: req.relatedParty,
          proposalId: req.proposalId,
          advanceRequestId: req.id,
          evidenceUrls: input.evidenceUrls ?? [],
          ledgerSeq,
          createdAt,
        },
      })) as { id: string };

      // Balance: total += amount, pending += amount; active + earned untouched.
      await tx.memberTokenBalance.update({
        where: { communityId_memberId: { communityId: req.communityId, memberId: req.memberId } },
        data: { totalBalance: { increment: amount }, pendingGovernanceBalance: { increment: amount } },
      });
      await tx.communityTokenState.update({
        where: { communityId: req.communityId },
        data: { currentTotalSupply: { increment: amount } },
      });
      const applied = await incrementAdvancedMintedGuarded(tx, epoch.id, amount);
      if (applied === 0) throw new EngineError('ADVANCE_CAP_EXCEEDED', 'epoch advance cap exceeded');
      await tx.tokenAdvanceRequest.update({
        where: { id: req.id },
        data: { status: 'executed', approvedAmount: amount, executedAt: createdAt },
      });

      // On-chain-eligible advance_mint record + publicRecordId backfill.
      const source: RecordSource = {
        kind: 'advance_mint',
        mintEvent: {
          id: mint.id,
          communityId: req.communityId,
          memberId: req.memberId,
          epochNumber: epoch.epochNumber,
          mintType: 'special_reward',
          budgetSource: 'next_epoch_advance',
          amount,
          memberBalanceBefore: balanceBefore,
          memberBalanceAfter: balanceAfter,
          totalSupplyBefore: supplyBefore,
          totalSupplyAfter: supplyAfter,
          governanceActivationEpoch,
          tokenPolicyVersion: policy.policyVersion,
          createdAt,
          ledgerSeq,
        },
      };
      const built = deps.buildEnvelope(source);
      const advanceRecord = await deps.records.createPendingRecord(tx, {
        recordType: 'advance_mint',
        sourceTable: 'TokenMintEvent',
        sourceId: mint.id,
        communityId: req.communityId,
        envelope: built.envelope,
        recordHash: built.recordHash,
      });
      await tx.tokenMintEvent.update({ where: { id: mint.id }, data: { publicRecordId: advanceRecord.id } });

      // DB-only budget_advance record + req.publicRecordId backfill (never enqueued).
      const dbOnly = await createDbOnlyRecord(tx, {
        communityId: req.communityId,
        recordType: 'budget_advance',
        sourceTable: 'TokenAdvanceRequest',
        sourceId: req.id,
        payload: {
          amount: amount.toString(),
          cumulativeAdvanceRateBps: cumulativeBps,
          epochNumber: epoch.epochNumber,
        },
      });
      await tx.tokenAdvanceRequest.update({ where: { id: req.id }, data: { publicRecordId: dbOnly.id } });

      const outcomeValue: MintOutcome = {
        mintEvents: [
          {
            id: mint.id,
            amount,
            budgetSource: 'next_epoch_advance',
            governanceStatus: 'pending',
            publicRecordId: advanceRecord.id,
          },
        ],
        memberBalanceAfter: balanceAfter,
        totalSupplyAfter: supplyAfter,
      };
      return { outcome: outcomeValue, advanceRecordId: advanceRecord.id };
    });

    // Post-commit: only the on-chain advance_mint record is enqueued.
    if (advanceRecordId !== null) await deps.records.requestSubmission(advanceRecordId);
    return outcome;
  }

  return { createRequest, secondApprove, attachProposal, reject, execute };
}
