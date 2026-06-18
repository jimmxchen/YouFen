// Relay submitter + confirmer (docs/BLOCKCHAIN-DESIGN-v0.7.md §6/§7, Phase-A
// Vercel-Cron deployment). Pull-based, no persistent worker:
//
//   submitReady()   — claim ready_to_submit actions, encode calldata, broadcast,
//                     persist the tx (assignedNonce), advance to `submitted`.
//   confirmPending() — check receipts for submitted/confirming actions; a
//                     REVERTED tx (status 0) -> `reverted` (no event will ever
//                     arrive); a SUCCESS tx -> `confirming` and the indexer folds
//                     the event and finalizes the action to `verified`.
//
// The relayer key signs the tx (gas), but the tx AUTHORISES nothing — authority
// is the approver/member EIP-712 signatures inside the calldata. A leaked relayer
// key can only waste gas or censor, never mint or vote.

import type { PrismaClient } from '@prisma/client';

import { governanceInterface } from '../indexer/event-decoder';

import type { ChainCall } from './chain-action-service';
import { transitionAction } from './chain-action-service';

/** Minimal chain sender surface (decouples from ethers Wallet/Provider). */
export interface TxSender {
  /** Broadcast calldata to the contract; returns the tx hash + the nonce used. */
  send(calldata: string): Promise<{ txHash: string; nonce: number }>;
  /** Receipt lookup; null while the tx is still pending. status: 1 success, 0 reverted. */
  getReceipt(txHash: string): Promise<{ status: number; blockNumber: number } | null>;
}

export interface SubmitDeps {
  readonly prisma: PrismaClient;
  readonly sender: TxSender;
  readonly limit?: number;
}

export interface SubmitSummary {
  readonly claimed: number;
  readonly submitted: number;
  readonly failed: number;
}

export async function submitReady(deps: SubmitDeps): Promise<SubmitSummary> {
  const { prisma, sender } = deps;
  const iface = governanceInterface();
  const ready = await prisma.chainAction.findMany({
    where: { status: 'ready_to_submit' },
    orderBy: { updatedAt: 'asc' },
    take: deps.limit ?? 10,
  });

  let claimed = 0;
  let submitted = 0;
  let failed = 0;

  for (const action of ready) {
    // claim exclusively — only one tick may move ready_to_submit -> submitting
    if (!(await transitionAction(prisma, action.id, 'ready_to_submit', 'submitting'))) continue;
    claimed += 1;

    try {
      const call = action.callData as unknown as ChainCall;
      const calldata = iface.encodeFunctionData(call.fn, call.args);
      const { txHash, nonce } = await sender.send(calldata);
      await prisma.chainTransaction.create({
        data: {
          chainActionId: action.id,
          txHash,
          assignedNonce: nonce,
          status: 'pending',
          broadcastAt: new Date(),
        },
      });
      await transitionAction(prisma, action.id, 'submitting', 'submitted');
      submitted += 1;
    } catch (err: unknown) {
      // return to the queue for a later retry (attemptEpoch++), record the error
      await prisma.chainAction.updateMany({
        where: { id: action.id, status: 'submitting' },
        data: {
          status: 'ready_to_submit',
          lastError: err instanceof Error ? err.message : String(err),
          attemptEpoch: { increment: 1 },
        },
      });
      failed += 1;
    }
  }

  return { claimed, submitted, failed };
}

export interface ConfirmSummary {
  readonly checked: number;
  readonly confirmedOnChain: number; // tx mined ok; indexer will set `verified`
  readonly reverted: number;
  readonly stillPending: number;
}

export async function confirmPending(deps: SubmitDeps): Promise<ConfirmSummary> {
  const { prisma, sender } = deps;
  const actions = await prisma.chainAction.findMany({
    where: { status: { in: ['submitted', 'confirming'] } },
    orderBy: { updatedAt: 'asc' },
    take: deps.limit ?? 20,
    include: { transactions: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  let checked = 0;
  let confirmedOnChain = 0;
  let reverted = 0;
  let stillPending = 0;

  for (const action of actions) {
    const tx = action.transactions[0];
    if (tx === undefined || tx.txHash === null) {
      stillPending += 1;
      continue;
    }
    checked += 1;
    const receipt = await sender.getReceipt(tx.txHash);
    if (receipt === null) {
      stillPending += 1;
      continue;
    }

    const from = action.status as 'submitted' | 'confirming';
    if (receipt.status === 0) {
      await transitionAction(prisma, action.id, from, 'reverted', { lastError: 'TX_REVERTED' });
      await prisma.chainTransaction.update({
        where: { id: tx.id },
        data: { status: 'reverted', blockNumber: receipt.blockNumber, confirmedAt: new Date() },
      });
      reverted += 1;
    } else {
      // success mined — advance toward confirming; the indexer folds the event and sets `verified`
      if (from === 'submitted') await transitionAction(prisma, action.id, 'submitted', 'confirming');
      await prisma.chainTransaction.update({
        where: { id: tx.id },
        data: { status: 'mined', blockNumber: receipt.blockNumber, confirmedAt: new Date() },
      });
      confirmedOnChain += 1;
    }
  }

  return { checked, confirmedOnChain, reverted, stillPending };
}
