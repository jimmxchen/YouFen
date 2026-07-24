// Submit enqueue factory (BLOCKCHAIN-DESIGN §6, idempotency line 1 + red-team fix).
// jobId = `submit:${recordId}:v${attemptEpoch}` de-dupes at the queue layer; the
// job payload carries only { recordId } so workers always re-read fresh DB state.

import type { Queue } from 'bullmq';

import type { EnqueueFn } from '../types';

import { SUBMIT_JOB_OPTIONS } from './queues';

/** Only the queue surface the enqueuer needs; never a full Queue in tests. */
export type SubmitQueueLike = Pick<Queue, 'add' | 'getJob'>;

/** States in which an existing job still represents genuine in-flight work. */
const ACTIVE_JOB_STATES: ReadonlySet<string> = new Set([
  'active',
  'waiting',
  'waiting-children',
  'delayed',
  'prioritized',
  'unknown', // indeterminate: treat as in-flight to avoid a duplicate add.
]);

/**
 * Build the record-submission enqueuer. Red-team fix: probe getJob(jobId) before
 * add so an already-queued record returns { queued: false } without a second add
 * (BullMQ would silently de-dupe, but the explicit probe keeps the return honest).
 *
 * Second red-team fix: SUBMIT_JOB_OPTIONS retains completed jobs for 1 day and
 * failed jobs for 7 days, so getJob(jobId) can hit a *terminal* job that no longer
 * represents in-flight work. The reconciler re-enqueues both crash-reset and stale
 * pending rows with the SAME attemptEpoch (identical jobId), so a lingering
 * completed/failed job would swallow the re-enqueue and strand the record for up to
 * 7 days. Only a job in an active state counts as "already queued"; a terminal job
 * is removed so a fresh attempt can be added under the same id.
 */
export function createEnqueue(deps: { submitQueue: SubmitQueueLike }): EnqueueFn {
  return async (record) => {
    const jobId = `submit:${record.id}:v${record.attemptEpoch}`;
    const existing = await deps.submitQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (ACTIVE_JOB_STATES.has(state)) {
        return { queued: false, jobId };
      }
      // Terminal (completed | failed) job retained only by removeOnComplete/
      // removeOnFail: drop it so add() below is not silently de-duped.
      await existing.remove();
    }
    await deps.submitQueue.add('submit', { recordId: record.id }, { ...SUBMIT_JOB_OPTIONS, jobId });
    return { queued: true, jobId };
  };
}
