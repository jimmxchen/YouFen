// chain-confirm worker (BLOCKCHAIN-DESIGN §5 + §6). Read-only receipt polling,
// concurrency=4. processConfirmJob is a pure DI function for offline unit tests.

import { Worker } from 'bullmq';
import type { Job, Queue } from 'bullmq';

import { RetryableError } from '../errors';
import type { ChainRecordMeta, Hex32, PublicRecordService, TxConfirmer } from '../types';

import { CONFIRM_CONCURRENCY, CONFIRM_JOB_OPTIONS, QUEUE_NAMES, type ConnectionLike } from './queues';

/** Payload for a chain-confirm job: the record id plus the tx to poll. */
export interface ConfirmJobData {
  readonly recordId: string;
  readonly txHash: string;
}

/** The outcome tag returned to the caller/test; BullMQ ignores the value. */
export type ConfirmOutcome = 'verified' | 'reverted' | 'skipped';

/** Only the queue surface the confirm enqueuer needs. */
export type ConfirmQueueLike = Pick<Queue, 'add' | 'getJob'>;

export interface ConfirmDeps {
  readonly records: PublicRecordService;
  readonly confirmer: TxConfirmer;
  readonly readChainRecord: (recordHash: Hex32) => Promise<ChainRecordMeta>;
  readonly confirmations: number;
}

/**
 * Process one chain-confirm job. Missing record -> skipped. On `reverted` the
 * record moves to `failed`. On `confirmed` we re-read the chain to require the
 * record is actually indexed before moving confirming->verified; a not-yet-indexed
 * read throws RetryableError so BullMQ retries. A confirmation timeout propagates
 * (rethrow) so after 30 attempts the reconciler takes over.
 */
export async function processConfirmJob(
  deps: ConfirmDeps,
  job: { data: ConfirmJobData },
): Promise<{ outcome: ConfirmOutcome }> {
  const { recordId, txHash } = job.data;

  const record = await deps.records.getById(recordId);
  if (record === null) {
    return { outcome: 'skipped' };
  }

  const result = await deps.confirmer.waitForConfirmation(txHash, {
    confirmations: deps.confirmations,
    // Additive (W2-B): arms the confirmer null-receipt fast path so a lagging
    // RPC receipt index cannot strand a mined tx in confirming.
    recordHash: record.recordHash,
  });

  if (result.status === 'reverted') {
    await deps.records.transition(recordId, ['confirming'], 'failed', {
      lastError: 'REVERTED',
    });
    return { outcome: 'reverted' };
  }

  const meta = await deps.readChainRecord(record.recordHash);
  if (meta.exists !== true) {
    throw new RetryableError('CONFIRMED_BUT_NOT_INDEXED');
  }

  await deps.records.transition(recordId, ['confirming'], 'verified', {
    blockNumber: result.blockNumber,
    blockHash: result.blockHash,
    confirmedAt: result.confirmedAt,
  });
  return { outcome: 'verified' };
}

/**
 * Build the confirm enqueuer used by the submit worker. jobId =
 * `confirm:${recordId}:${txHash}`; getJob probe de-dupes like the submit enqueue.
 */
export function makeConfirmEnqueuer(
  confirmQueue: ConfirmQueueLike,
): (recordId: string, txHash: string) => Promise<void> {
  return async (recordId, txHash) => {
    const jobId = `confirm:${recordId}:${txHash}`;
    const existing = await confirmQueue.getJob(jobId);
    if (existing) {
      return;
    }
    await confirmQueue.add('confirm', { recordId, txHash }, { ...CONFIRM_JOB_OPTIONS, jobId });
  };
}

/** Wire the chain-confirm Worker. Constructor only: never instantiated in tests. */
export function createConfirmWorker(connection: ConnectionLike, deps: ConfirmDeps): Worker {
  return new Worker<ConfirmJobData>(
    QUEUE_NAMES.confirm,
    (job: Job<ConfirmJobData>) => processConfirmJob(deps, job),
    { connection, concurrency: CONFIRM_CONCURRENCY },
  );
}
