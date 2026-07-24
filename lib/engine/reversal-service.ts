// W3-4: reversal-service. Append-only token reversal for the six legal reasons,
// with balance/governance/supply rollback and superseded linkage. Every mutation
// happens inside a single interactive transaction; the on-chain submission
// request is fired strictly after commit. Business-condition writes go through
// db-locks.ts / ledger-seq.ts (the raw-SQL single source of truth); this service
// never template-tags raw SQL.

import {
  lockBalance,
  lockMintEvent,
  lockState,
} from './db-locks';
import { EngineError } from './errors';
import { allocateLedgerSeq } from './ledger-seq';
import {
  REVERSAL_REASONS,
  type EngineDeps,
  type EngineTx,
  type Hex32,
  type ReversalReason,
  type ReversalService,
} from './types';
import type { RecordSource, TokenReversalEventData } from '../blockchain/types';

/** Prisma-shaped unique-violation detector (idempotency race on create). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/** Narrow the loose delegate result to the mint fields this service reads
 *  beyond the locked MintEventRow (relatedParty is not part of MintEventRow). */
interface MintExtras {
  readonly relatedParty?: boolean;
}

interface ProposalGate {
  readonly type?: string | null;
  readonly status?: string | null;
  readonly communityId?: string | null;
  readonly winningOptionId?: string | null;
  readonly voterCount?: number | null;
  readonly minimumVoterCount?: number | null;
  readonly policyChangePayload?: unknown;
}

/** Extract the reversal target mint id from a proposal's policyChangePayload
 *  JSON, tolerating null/non-object payloads without throwing. */
function readTargetMintEventId(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  const target = (payload as { targetMintEventId?: unknown }).targetMintEventId;
  return typeof target === 'string' ? target : undefined;
}

interface ReversalRow {
  readonly id: string;
  readonly originalMintEventId: string;
  readonly publicRecordId?: string | null;
}

export function createReversalService(deps: EngineDeps): ReversalService {
  const { db, records, buildEnvelope } = deps;

  async function reverseMint(input: {
    originalMintEventId: string;
    amount?: bigint;
    reason: ReversalReason;
    approvedBy: string;
    proposalId?: string;
  }): Promise<{ reversalEventId: string; publicRecordId: string }> {
    // (1) Reason validation up front — cheap, no transaction needed.
    if (!(REVERSAL_REASONS as readonly string[]).includes(input.reason)) {
      throw new EngineError('INVALID_REASON', `unknown reversal reason ${input.reason}`);
    }

    const result = await db.$transaction(async (tx: EngineTx) => {
      // (2) Lock the mint event (source of truth) plus state + balance rows.
      // Lock order MUST mirror mint-service (epoch -> state -> balance): state
      // is acquired strictly BEFORE balance so a concurrent contribution mint
      // and reversal on the same community+member can never form a lock cycle.
      // Inverting these two (balance before state) races mint's state-then-
      // balance path into a Postgres deadlock (40P01). The mintEvent row is the
      // reversal's own source-of-truth anchor and is not contended by mint.
      const mint = await lockMintEvent(tx, input.originalMintEventId);
      if (!mint) {
        throw new EngineError('NOT_FOUND', 'mint event not found');
      }
      const state = await lockState(tx, mint.communityId);
      if (!state) {
        throw new EngineError('NOT_FOUND', 'community token state not found');
      }
      const balance = await lockBalance(tx, mint.communityId, mint.memberId);
      if (!balance) {
        throw new EngineError('NOT_FOUND', 'member balance not found');
      }

      // relatedParty is not carried on MintEventRow; read it from the full row.
      const fullMint = (await tx.tokenMintEvent.findUnique({
        where: { id: input.originalMintEventId },
      })) as MintExtras | null;
      const relatedParty = fullMint?.relatedParty === true;

      // (3) Governance gate: community_proposal reason or a related-party mint
      // demands a *passed* token_reversal proposal that specifically authorized
      // reversing THIS mint. A recorded status alone is not enough — a rejected
      // or below-quorum proposal also ends up 'recorded', so we mirror the
      // proposal-service settlement gate (quorumMet && winningOptionId ===
      // 'approve') and additionally bind the proposal to this community and this
      // exact mint event. Without these checks any recorded token_reversal
      // proposal could be replayed to reverse an arbitrary mint (PRD §551).
      if (input.reason === 'community_proposal' || relatedParty) {
        if (!input.proposalId) {
          throw new EngineError('PROPOSAL_REQUIRED', 'reversal requires a proposal');
        }
        const proposal = (await tx.proposal.findUnique({
          where: { id: input.proposalId },
        })) as ProposalGate | null;
        const quorumMet =
          typeof proposal?.voterCount === 'number' &&
          typeof proposal?.minimumVoterCount === 'number' &&
          proposal.voterCount >= proposal.minimumVoterCount;
        const targetMintEventId = readTargetMintEventId(proposal?.policyChangePayload);
        if (
          !proposal ||
          proposal.type !== 'token_reversal' ||
          proposal.status !== 'recorded' ||
          proposal.communityId !== mint.communityId ||
          proposal.winningOptionId !== 'approve' ||
          !quorumMet ||
          targetMintEventId !== input.originalMintEventId
        ) {
          throw new EngineError(
            'PROPOSAL_REQUIRED',
            'reversal requires a passed token_reversal proposal that approved reversing this mint',
          );
        }
      }

      // (4) Idempotency: one reversal per original mint event.
      const existing = (await tx.tokenReversalEvent.findFirst({
        where: { originalMintEventId: input.originalMintEventId },
      })) as { id: string } | null;
      if (existing) {
        throw new EngineError('ALREADY_REVERSED', 'mint already reversed');
      }

      // (5) Amount resolution + bounds: 0 < amount <= original amount.
      const amount = input.amount ?? mint.amount;
      if (amount <= 0n || amount > mint.amount) {
        throw new EngineError('VALIDATION_ERROR', 'reversal amount out of range');
      }

      // (6) Governance-portion rollback split by the original mint's status.
      const isActive = mint.governanceStatus === 'active';
      const activeDeduct = isActive ? amount : 0n;
      const pendingDeduct = isActive ? 0n : amount;

      const totalBalanceAfter = balance.totalBalance - amount;
      const activeGovernanceBalanceAfter =
        balance.activeGovernanceBalance - activeDeduct;
      const pendingGovernanceBalanceAfter =
        balance.pendingGovernanceBalance - pendingDeduct;
      const totalSupplyAfter = state.currentTotalSupply - amount;
      if (
        totalBalanceAfter < 0n ||
        activeGovernanceBalanceAfter < 0n ||
        pendingGovernanceBalanceAfter < 0n ||
        totalSupplyAfter < 0n
      ) {
        throw new EngineError('CONFLICT', 'reversal would drive a balance negative');
      }

      // (7) Allocate the community-scoped monotonic ledger sequence.
      const ledgerSeq = await allocateLedgerSeq(tx, mint.communityId);

      // Append the reversal event (P2002 on the @unique originalMintEventId maps
      // to ALREADY_REVERSED, matching the pre-check).
      const now = deps.now?.() ?? new Date();
      let rev: { id: string };
      try {
        rev = (await tx.tokenReversalEvent.create({
          data: {
            communityId: mint.communityId,
            memberId: mint.memberId,
            originalMintEventId: input.originalMintEventId,
            amount,
            reason: input.reason,
            totalBalanceAfter,
            activeGovernanceBalanceAfter,
            pendingGovernanceBalanceAfter,
            totalSupplyAfter,
            approvedBy: input.approvedBy,
            proposalId: input.proposalId ?? null,
            ledgerSeq,
            createdAt: now,
          },
        })) as { id: string };
      } catch (err: unknown) {
        if (isUniqueViolation(err)) {
          throw new EngineError('ALREADY_REVERSED', 'mint already reversed');
        }
        throw err;
      }

      // (8) Roll balances + supply back (append-only ledger; balances mutate).
      await tx.memberTokenBalance.update({
        where: { id: balance.id },
        data: {
          totalBalance: { decrement: amount },
          activeGovernanceBalance: { decrement: activeDeduct },
          pendingGovernanceBalance: { decrement: pendingDeduct },
          tokensReversedLifetime: { increment: amount },
        },
      });
      await tx.communityTokenState.update({
        where: { communityId: mint.communityId },
        data: { currentTotalSupply: { decrement: amount } },
      });

      // (9) Reverse-lookup the original record hash, build the envelope, create
      // the pending PublicRecord, and backfill the reversal's publicRecordId.
      if (!mint.publicRecordId) {
        throw new EngineError('CONFLICT', '原记录缺失');
      }
      const originalRecord = (await tx.publicRecord.findUnique({
        where: { id: mint.publicRecordId },
      })) as { recordHash?: string } | null;
      if (!originalRecord || !originalRecord.recordHash) {
        throw new EngineError('CONFLICT', '原记录缺失');
      }
      const originalRecordHash = originalRecord.recordHash as Hex32;

      const reversalEvent: TokenReversalEventData = {
        id: rev.id,
        communityId: mint.communityId,
        memberId: mint.memberId,
        originalMintEventId: input.originalMintEventId,
        amount,
        totalBalanceAfter,
        totalSupplyAfter,
        createdAt: now,
        ledgerSeq,
      };
      const source: RecordSource = {
        kind: 'token_reversal',
        reversalEvent,
        originalRecordHash,
      };
      const built = buildEnvelope(source);
      const pending = await records.createPendingRecord(tx, {
        recordType: 'token_reversal',
        sourceTable: 'TokenReversalEvent',
        sourceId: rev.id,
        communityId: mint.communityId,
        envelope: built.envelope,
        recordHash: built.recordHash,
      });
      await tx.tokenReversalEvent.update({
        where: { id: rev.id },
        data: { publicRecordId: pending.id },
      });

      return { reversalEventId: rev.id, publicRecordId: pending.id };
    });

    // Submission request strictly after the transaction commits.
    await records.requestSubmission(result.publicRecordId);
    return result;
  }

  async function finalizeSupersede(reversalEventId: string): Promise<boolean> {
    const rev = (await db.tokenReversalEvent.findUnique({
      where: { id: reversalEventId },
    })) as ReversalRow | null;
    if (!rev) {
      throw new EngineError('NOT_FOUND', 'reversal event not found');
    }
    if (!rev.publicRecordId) {
      return false;
    }
    const reversalRecord = await records.getById(rev.publicRecordId);
    if (!reversalRecord || reversalRecord.status !== 'verified') {
      return false;
    }
    const mint = (await db.tokenMintEvent.findUnique({
      where: { id: rev.originalMintEventId },
    })) as { publicRecordId?: string | null } | null;
    if (!mint || !mint.publicRecordId) {
      return false;
    }
    await records.markSuperseded(mint.publicRecordId, rev.publicRecordId);
    return true;
  }

  return { reverseMint, finalizeSupersede };
}
