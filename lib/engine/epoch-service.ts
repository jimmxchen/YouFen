// Epoch-switch engine service (W3-3). closeEpoch runs the whole rollover inside
// a single interactive transaction: lock + status guard, unused-budget void,
// debt carry-over (conservation core), pending-policy activation, next-epoch
// budget derivation, governance flip (balance layer + event layer), per-epoch
// meter reset, next-epoch bootstrap, DB-only budget/debt records, and the
// on-chain EpochSummary pending record. requestSubmission is fired strictly
// AFTER the transaction commits (no network IO inside the tx).
//
// Business-condition raw UPDATEs go only through sql.ts / db-locks.ts; this
// file never template-tags SQL directly. Ledger has no append here (epoch
// summaries carry no ledgerSeq).

import {
  calculateBaseMintBudget,
  calculateCarriedOverDebt,
  calculateEffectiveRegularBudget,
  calculateMaxAdvanceAmount,
} from './calc';
import { lockEpochById } from './db-locks';
import { createDbOnlyRecord } from './db-only-records';
import { EngineError } from './errors';
import { activatePendingGovernance } from './sql';
import type {
  EngineDeps,
  EngineTx,
  EpochRow,
  EpochService,
  PolicyActivationPort,
  PolicyRow,
  StateRow,
} from './types';
import type { TokenEpochData } from '../blockchain/types';

const MS_PER_DAY = 86_400_000;

export type EpochServiceDeps = EngineDeps & {
  readonly policyActivation: PolicyActivationPort;
};

/** Prisma P2002 (unique violation) discriminator. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/** Effective policy parameters used to derive an epoch's budget. */
interface EffectivePolicy {
  readonly inflationRateBps: number;
  readonly maxAdvanceRateBps: number;
}

function readEffectivePolicy(policy: PolicyRow): EffectivePolicy {
  return {
    inflationRateBps: policy.monthlyInflationRateBps,
    maxAdvanceRateBps: policy.maxAdvanceRateBps,
  };
}

/** Budget triple derived from opening supply + carried debt + policy params. */
interface DerivedBudget {
  readonly baseMintBudget: bigint;
  readonly effectiveRegularBudget: bigint;
  readonly maxAdvanceAmount: bigint;
}

function deriveBudget(
  openingSupply: bigint,
  advanceDebt: bigint,
  eff: EffectivePolicy,
): DerivedBudget {
  const base = calculateBaseMintBudget(openingSupply, eff.inflationRateBps);
  return {
    baseMintBudget: base,
    effectiveRegularBudget: calculateEffectiveRegularBudget(base, advanceDebt),
    maxAdvanceAmount: calculateMaxAdvanceAmount(base, eff.maxAdvanceRateBps),
  };
}

/** Map the closing epoch row to the on-chain EpochSummary source shape. */
function toEpochData(
  epoch: EpochRow,
  closedAt: Date,
  createdAt: Date,
): TokenEpochData {
  return {
    id: epoch.id,
    communityId: epoch.communityId,
    epochNumber: epoch.epochNumber,
    openingSupply: epoch.openingSupply,
    baseMintBudget: epoch.baseMintBudget,
    regularMintedAmount: epoch.regularMintedAmount,
    advancedMintedAmount: epoch.advancedMintedAmount,
    advanceDebtFromPreviousEpoch: epoch.advanceDebtFromPreviousEpoch,
    closedAt,
    createdAt,
  };
}

async function requirePolicy(tx: EngineTx, communityId: string): Promise<PolicyRow> {
  const policy = (await tx.communityTokenPolicy.findUnique({
    where: { communityId },
  })) as PolicyRow | null;
  if (!policy) {
    throw new EngineError('NOT_FOUND', `no policy for community ${communityId}`);
  }
  return policy;
}

async function requireState(tx: EngineTx, communityId: string): Promise<StateRow> {
  const state = (await tx.communityTokenState.findUnique({
    where: { communityId },
  })) as StateRow | null;
  if (!state) {
    throw new EngineError('NOT_FOUND', `no token state for community ${communityId}`);
  }
  return state;
}

/** Build the concrete EpochService from its dependency bundle. */
export function createEpochService(deps: EpochServiceDeps): EpochService {
  const clock = (): Date => deps.now?.() ?? new Date();

  async function closeEpoch(
    epochId: string,
  ): Promise<
    | { communityId: string; nextEpochId: string; chainRecordIds: string[] }
    | { noop: true }
  > {
    const outcome = await deps.db.$transaction(async (tx) => {
      const now = clock();

      // 1) Lock + in-code status guard (no status-bearing SQL variant).
      const current = await lockEpochById(tx, epochId);
      if (!current) {
        throw new EngineError('NOT_FOUND', `epoch ${epochId} not found`);
      }
      if (current.status === 'closed') {
        return { noop: true as const };
      }
      if (current.status !== 'active') {
        throw new EngineError('INVALID_STATUS', `epoch ${epochId} is ${current.status}`);
      }

      const { communityId } = current;

      // 2) Unused regular budget is voided (recorded on the closing epoch, never
      //    rolled into the next epoch's budget).
      const unusedRegularBudget = current.effectiveRegularBudget - current.regularMintedAmount;

      // 3) Mark the closing epoch 'closing' with its unused budget + closedAt.
      await tx.tokenEpoch.update({
        where: { id: current.id },
        data: { status: 'closing', unusedRegularBudget, closedAt: now },
      });

      // Read the full closing row once for its immutable createdAt (summary).
      const currentFull = (await tx.tokenEpoch.findUnique({
        where: { id: current.id },
      })) as { createdAt?: Date } | null;
      const createdAt = currentFull?.createdAt ?? now;

      // 4) Baseline policy + state read; next opening supply = current supply.
      let policy = await requirePolicy(tx, communityId);
      const state = await requireState(tx, communityId);
      const nextOpeningSupply = state.currentTotalSupply;

      // 5) Debt carry-over (conservation core): new advances this epoch plus the
      //    portion of the prior debt this epoch's base could not service.
      const nextEpochNumber = current.epochNumber + 1;
      const advanceDebt =
        current.advancedMintedAmount +
        calculateCarriedOverDebt(current.baseMintBudget, current.advanceDebtFromPreviousEpoch);

      // 6) Activate any pending policy version; re-read the row for its params
      //    only when something actually flipped.
      const activated = await deps.policyActivation.activatePendingVersion(
        tx,
        communityId,
        nextEpochNumber,
      );
      if (activated !== null) {
        policy = await requirePolicy(tx, communityId);
      }
      const eff = readEffectivePolicy(policy);

      // 7) Derive next-epoch budget triple from the effective params.
      const budget = deriveBudget(nextOpeningSupply, advanceDebt, eff);

      // 8) Governance activation. Balance layer: roll pending -> active per row.
      //    Event layer: flip only mint events whose activationEpoch matches the
      //    epoch now opening (red-team: the two layers coincide on the normal
      //    path; adversarial tests assert the event-layer filter).
      await activatePendingGovernance(tx, communityId);
      await tx.tokenMintEvent.updateMany({
        where: {
          communityId,
          governanceStatus: 'pending',
          governanceActivationEpoch: nextEpochNumber,
        },
        data: { governanceStatus: 'active' },
      });

      // 9) Reset every member's per-epoch meter. tokensEarnedCurrentEpoch backs
      //    the mint-service per-member "single epoch" cap check — leaving it
      //    unreset would turn the per-epoch cap into a permanent lifetime cap
      //    and progressively lock every member out of minting.
      await tx.memberTokenBalance.updateMany({
        where: { communityId },
        data: {
          tokensEarnedCurrentEpoch: 0n,
        },
      });

      // 10) Create the next epoch (P2002 -> CONFLICT).
      const startTime = current.endTime ?? now;
      const endTime = new Date(startTime.getTime() + policy.epochDurationDays * MS_PER_DAY);
      let nextEpoch: { id: string };
      try {
        nextEpoch = (await tx.tokenEpoch.create({
          data: {
            communityId,
            epochNumber: nextEpochNumber,
            status: 'active',
            startTime,
            endTime,
            openingSupply: nextOpeningSupply,
            inflationRateBps: eff.inflationRateBps,
            baseMintBudget: budget.baseMintBudget,
            advanceDebtFromPreviousEpoch: advanceDebt,
            effectiveRegularBudget: budget.effectiveRegularBudget,
            maxAdvanceAmount: budget.maxAdvanceAmount,
            regularMintedAmount: 0n,
            advancedMintedAmount: 0n,
            unusedRegularBudget: 0n,
          },
        })) as { id: string };
      } catch (err: unknown) {
        if (isUniqueViolation(err)) {
          throw new EngineError('CONFLICT', `epoch ${nextEpochNumber} already exists`);
        }
        throw err;
      }

      // 11) DB-only records: budget-created (always) + debt-repayment (if debt).
      await createDbOnlyRecord(tx, {
        communityId,
        recordType: 'epoch_budget_created',
        sourceTable: 'TokenEpoch',
        sourceId: nextEpoch.id,
        payload: {
          epochNumber: nextEpochNumber,
          openingSupply: nextOpeningSupply.toString(),
          baseMintBudget: budget.baseMintBudget.toString(),
          effectiveRegularBudget: budget.effectiveRegularBudget.toString(),
          maxAdvanceAmount: budget.maxAdvanceAmount.toString(),
          inflationRateBps: eff.inflationRateBps,
        },
      });
      if (advanceDebt > 0n) {
        await createDbOnlyRecord(tx, {
          communityId,
          recordType: 'advance_debt_repayment',
          sourceTable: 'TokenEpoch',
          sourceId: nextEpoch.id,
          payload: {
            epochNumber: nextEpochNumber,
            debt: advanceDebt.toString(),
          },
        });
      }

      // 12) On-chain EpochSummary pending record for the closing epoch.
      const { envelope, recordHash } = deps.buildEnvelope({
        kind: 'epoch_summary',
        epoch: toEpochData(current, now, createdAt),
      });
      const summary = await deps.records.createPendingRecord(tx, {
        recordType: 'epoch_summary',
        sourceTable: 'TokenEpoch',
        sourceId: current.id,
        communityId,
        envelope,
        recordHash,
      });

      // 13) Finalize the closing epoch: 'closed' + summary record backfill.
      await tx.tokenEpoch.update({
        where: { id: current.id },
        data: { status: 'closed', publicRecordId: summary.id },
      });

      return {
        communityId,
        nextEpochId: nextEpoch.id,
        chainRecordIds: [summary.id, ...(activated?.chainRecordIds ?? [])],
      };
    });

    if ('noop' in outcome) {
      return outcome;
    }

    // Enqueue chain submissions strictly after the transaction commits.
    for (const recordId of outcome.chainRecordIds) {
      await deps.records.requestSubmission(recordId);
    }
    return outcome;
  }

  async function createNextEpoch(
    communityId: string,
  ): Promise<{ epochId: string; created: boolean }> {
    // Idempotent bootstrap: an existing active epoch short-circuits.
    const active = (await deps.db.tokenEpoch.findFirst({
      where: { communityId, status: 'active' },
    })) as { id: string } | null;
    if (active) {
      return { epochId: active.id, created: false };
    }

    return deps.db.$transaction(async (tx) => {
      const now = clock();
      const existing = (await tx.tokenEpoch.findMany({
        where: { communityId },
      })) as Array<{ epochNumber: number }>;
      const maxNumber = existing.reduce(
        (max, e) => (e.epochNumber > max ? e.epochNumber : max),
        0,
      );
      const epochNumber = maxNumber + 1;

      const policy = await requirePolicy(tx, communityId);
      const state = await requireState(tx, communityId);
      const openingSupply = state.currentTotalSupply;
      const eff = readEffectivePolicy(policy);
      const budget = deriveBudget(openingSupply, 0n, eff);

      const startTime = now;
      const endTime = new Date(startTime.getTime() + policy.epochDurationDays * MS_PER_DAY);

      try {
        const created = (await tx.tokenEpoch.create({
          data: {
            communityId,
            epochNumber,
            status: 'active',
            startTime,
            endTime,
            openingSupply,
            inflationRateBps: eff.inflationRateBps,
            baseMintBudget: budget.baseMintBudget,
            advanceDebtFromPreviousEpoch: 0n,
            effectiveRegularBudget: budget.effectiveRegularBudget,
            maxAdvanceAmount: budget.maxAdvanceAmount,
            regularMintedAmount: 0n,
            advancedMintedAmount: 0n,
            unusedRegularBudget: 0n,
          },
        })) as { id: string };
        return { epochId: created.id, created: true };
      } catch (err: unknown) {
        if (isUniqueViolation(err)) {
          const existingRow = (await tx.tokenEpoch.findFirst({
            where: { communityId, epochNumber },
          })) as { id: string } | null;
          if (existingRow) {
            return { epochId: existingRow.id, created: false };
          }
        }
        throw err;
      }
    });
  }

  return { closeEpoch, createNextEpoch };
}
