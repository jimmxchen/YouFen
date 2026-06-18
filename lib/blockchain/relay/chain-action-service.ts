// ChainAction service (docs/BLOCKCHAIN-DESIGN-v0.7.md §7). Creates a chain-bound
// action from a ready SignatureRequest and drives it through the state machine
// via CONDITIONAL updates (`WHERE id + status = from`) so a lost race between two
// cron ticks is an idempotent no-op. Confirmed balances are never written here —
// only the indexer, on a `verified` event, does that.

import type { PrismaClient } from '@prisma/client';

import { assertTransition, type ChainActionStatus } from './action-state-machine';
import type { ActionKind } from '../signatures/signature-request-service';

/** The ABI call the submitter will broadcast: a function name + its arg tuple. */
export interface ChainCall {
  readonly fn: string;
  readonly args: unknown[];
}

export interface CreateChainActionInput {
  readonly communityId: string;
  readonly kind: ActionKind;
  readonly signatureRequestId?: string | null;
  readonly callData: ChainCall;
  readonly recordHash?: string | null;
  readonly contributionId?: string | null;
  readonly proposalId?: string | null;
  readonly memberIdHash?: string | null;
  readonly amount?: string | null; // decimal string
  readonly idempotencyKey?: string | null;
  readonly initialStatus?: ChainActionStatus;
}

export interface CreateActionResult {
  readonly id: string;
  readonly created: boolean;
}

/** Create a ChainAction; idempotent on recordHash / idempotencyKey (both unique). */
export async function createChainAction(
  prisma: PrismaClient,
  input: CreateChainActionInput,
): Promise<CreateActionResult> {
  if (input.recordHash != null) {
    const dup = await prisma.chainAction.findUnique({ where: { recordHash: input.recordHash } });
    if (dup !== null) return { id: dup.id, created: false };
  }
  if (input.idempotencyKey != null) {
    const dup = await prisma.chainAction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup !== null) return { id: dup.id, created: false };
  }

  const row = await prisma.chainAction.create({
    data: {
      communityId: input.communityId,
      kind: input.kind,
      status: input.initialStatus ?? 'awaiting_signatures',
      signatureRequestId: input.signatureRequestId ?? null,
      callData: input.callData as never,
      recordHash: input.recordHash ?? null,
      contributionId: input.contributionId ?? null,
      proposalId: input.proposalId ?? null,
      memberIdHash: input.memberIdHash ?? null,
      amount: input.amount ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });
  return { id: row.id, created: true };
}

/**
 * Conditional state transition. Returns true iff exactly one row moved; a 0-row
 * result means another worker already advanced it (idempotent no-op). Illegal
 * transitions throw before touching the DB.
 */
export async function transitionAction(
  prisma: PrismaClient,
  id: string,
  from: ChainActionStatus,
  to: ChainActionStatus,
  extra?: { lastError?: string | null },
): Promise<boolean> {
  assertTransition(from, to);
  const res = await prisma.chainAction.updateMany({
    where: { id, status: from },
    data: { status: to, ...(extra?.lastError !== undefined ? { lastError: extra.lastError } : {}) },
  });
  return res.count === 1;
}

/** Move a ready SignatureRequest's action to ready_to_submit once signatures are collected. */
export async function markReadyToSubmit(prisma: PrismaClient, id: string): Promise<boolean> {
  return transitionAction(prisma, id, 'awaiting_signatures', 'ready_to_submit');
}
