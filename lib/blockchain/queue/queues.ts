// BullMQ queue definitions (BLOCKCHAIN-DESIGN §6). Orchestration only: the queue
// names, retry policies and concurrency live here; all business logic sits in the
// DI processor functions. Amounts never touch this layer; jobs carry only ids.

import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

/** Connection handle accepted by BullMQ (ioredis instance or connection opts). */
export type ConnectionLike = ConnectionOptions;

/** Canonical queue names. `as const` so downstream reads are literal-typed. */
export const QUEUE_NAMES = {
  submit: 'chain-submit',
  confirm: 'chain-confirm',
  reconcile: 'chain-reconcile',
} as const;

/**
 * chain-submit retry policy: 5 attempts, exponential backoff from 5s.
 * Completed jobs kept 1 day, failed jobs kept 7 days for post-mortem.
 */
export const SUBMIT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
} as const;

/**
 * chain-confirm retry policy: 30 attempts, fixed 10s backoff (~5min window);
 * once exhausted the reconciler takes over. Same retention as submit.
 */
export const CONFIRM_JOB_OPTIONS = {
  attempts: 30,
  backoff: { type: 'fixed', delay: 10000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
} as const;

/** chain-reconcile repeat cadence: every 120s. */
export const RECONCILE_REPEAT = { every: 120000 } as const;

/** Single in-flight submit tx: one Server Wallet, strict nonce ordering. */
export const SUBMIT_CONCURRENCY = 1;

/** Read-only receipt polling can fan out safely. */
export const CONFIRM_CONCURRENCY = 4;

/** Construct the submit and confirm queues against a shared connection. */
export function createQueues(connection: ConnectionLike): {
  submitQueue: Queue;
  confirmQueue: Queue;
} {
  const submitQueue = new Queue(QUEUE_NAMES.submit, { connection });
  const confirmQueue = new Queue(QUEUE_NAMES.confirm, { connection });
  return { submitQueue, confirmQueue };
}
