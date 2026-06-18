// chain-reconcile worker (BLOCKCHAIN-DESIGN §5 + §6). A single repeatable job
// drives reconciler.reconcileOnce; the DB is the source of truth, so a wiped Redis
// is fully rebuilt from pending/submitting rows on the next tick.

import { Worker } from 'bullmq';
import type { Queue } from 'bullmq';

import type { ReconcileReport, Reconciler } from '../types';

import { QUEUE_NAMES, RECONCILE_REPEAT, type ConnectionLike } from './queues';

export interface ReconcileDeps {
  readonly reconciler: Reconciler;
}

/** A fixed singleton jobId keeps exactly one repeatable reconcile schedule. */
export const RECONCILE_JOB_ID = 'chain-reconcile-singleton';

/** Register the repeatable reconcile job (idempotent by fixed jobId). */
export async function scheduleReconcile(queue: Pick<Queue, 'add'>): Promise<void> {
  await queue.add(
    'reconcile',
    {},
    { repeat: RECONCILE_REPEAT, jobId: RECONCILE_JOB_ID },
  );
}

/** Wire the chain-reconcile Worker. Constructor only: never instantiated in tests. */
export function createReconcileWorker(connection: ConnectionLike, deps: ReconcileDeps): Worker {
  return new Worker<Record<string, never>, ReconcileReport>(
    QUEUE_NAMES.reconcile,
    () => deps.reconciler.reconcileOnce(),
    { connection, concurrency: 1 },
  );
}
