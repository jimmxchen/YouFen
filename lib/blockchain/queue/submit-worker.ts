// chain-submit worker (BLOCKCHAIN-DESIGN §5 + §6). concurrency=1 (single Server
// Wallet, strict nonce ordering). processSubmitJob is a pure DI function so it can
// be unit-tested without instantiating a Worker or touching Redis.

import { Worker } from 'bullmq';
import type { Job } from 'bullmq';

import {
  AlreadyRecordedError,
  NonceError,
  RetryableError,
  TerminalError,
  classifyUnknownError,
  type ChainError,
} from '../errors';
import type {
  ChainRecordMeta,
  Hex32,
  PublicRecordService,
  SubmittableRecord,
  TxConfirmer,
  TxSubmitter,
} from '../types';

import { QUEUE_NAMES, SUBMIT_CONCURRENCY, type ConnectionLike } from './queues';

/** Payload for a chain-submit job: only the record id (data re-read from DB). */
export interface SubmitJobData {
  readonly recordId: string;
}

/** The outcome tag returned to the caller/test; BullMQ ignores the value. */
export type SubmitOutcome = 'submitted' | 'recovered' | 'skipped' | 'failed';

export interface SubmitDeps {
  readonly records: PublicRecordService;
  readonly submitter: TxSubmitter;
  readonly wallet: {
    getNextNonce(): number;
    resyncNonce(): Promise<number>;
  };
  readonly readChainRecord: (recordHash: Hex32) => Promise<ChainRecordMeta>;
  readonly findTxByRecordHash: TxConfirmer['findTxByRecordHash'];
  readonly enqueueConfirm: (recordId: string, txHash: string) => Promise<void>;
  readonly buildSubmittable: (recordId: string) => Promise<SubmittableRecord>;
  readonly discard?: () => void;
}

/** Format a lastError column value from a classified chain error. */
function formatError(err: ChainError): string {
  return `${err.code}: ${err.message}`;
}

/**
 * Best-effort reset back to `pending` before a re-throw. Without it BullMQ retries
 * would spin against the `pending`-only status guard and never progress. A failed
 * reset must not block the re-throw (the reconciler still recovers the record).
 */
async function resetToPending(
  deps: SubmitDeps,
  recordId: string,
  err: ChainError,
): Promise<void> {
  try {
    await deps.records.transition(recordId, ['submitting'], 'pending', {
      lastError: formatError(err),
    });
  } catch {
    // Best-effort only: swallow so the original error still propagates.
  }
}

/**
 * Heal a leaked local nonce. getNextNonce advances a shared in-memory counter;
 * any path that advances it but never broadcasts leaves a permanent gap, after
 * which every subsequent record broadcasts a future nonce that silently stalls
 * in the mempool and deadlocks the pipeline (a too-high nonce raises no error).
 * concurrency=1 guarantees no other in-flight tx, so reseeding from the chain's
 * pending count is race-free. Best-effort: a failed reseed is retried later.
 */
async function healLeakedNonce(deps: SubmitDeps): Promise<void> {
  try {
    await deps.wallet.resyncNonce();
  } catch {
    // Swallow: the next attempt (or NonceError resync) reseeds the counter.
  }
}

/**
 * Recovery path: the contract already holds this recordHash. Backfill txHash from
 * the on-chain event, move submitting->confirming and hand off to the confirm queue.
 */
async function recover(
  deps: SubmitDeps,
  recordId: string,
  recordHash: Hex32,
): Promise<{ outcome: SubmitOutcome }> {
  const found = await deps.findTxByRecordHash(recordHash);
  if (found === null) {
    // Exists on chain but the event is not indexed yet. Reset to pending BEFORE
    // signalling a retry, otherwise the record stays 'submitting' and every
    // BullMQ retry loses the pending-only status guard and spins as 'skipped'.
    const err = new RetryableError('RECORD_EXISTS_BUT_TX_NOT_INDEXED');
    await resetToPending(deps, recordId, err);
    throw err;
  }
  await deps.records.transition(recordId, ['submitting'], 'confirming', {
    txHash: found.txHash,
    submittedAt: new Date(),
  });
  await deps.enqueueConfirm(recordId, found.txHash);
  return { outcome: 'recovered' };
}

/** State carried into the error handler to decide how to unwind a failed attempt. */
interface AttemptState {
  readonly submittable: SubmittableRecord | null;
  /** getNextNonce advanced the local counter for this attempt. */
  readonly nonceConsumed: boolean;
  /** submitRecord returned a txHash (the nonce was spent on-chain). */
  readonly broadcast: boolean;
}

/**
 * Classify a failed attempt and unwind it. A nonce consumed but never broadcast
 * is healed on every branch except NonceError (which resyncs on its own path).
 */
async function handleSubmitError(
  deps: SubmitDeps,
  recordId: string,
  rawError: unknown,
  state: AttemptState,
): Promise<{ outcome: SubmitOutcome }> {
  const err = classifyUnknownError(rawError);
  const leaked = state.nonceConsumed && !state.broadcast;

  if (leaked && !(err instanceof NonceError)) {
    await healLeakedNonce(deps);
  }

  if (err instanceof AlreadyRecordedError && state.submittable !== null) {
    // Broadcast reverted with RECORD_EXISTS: the nonce (already healed above) was
    // never spent on-chain. recover resets to pending itself if the tx is not yet
    // indexed, so a retry can always progress.
    return recover(deps, recordId, state.submittable.recordHash);
  }

  if (err instanceof NonceError) {
    await healLeakedNonce(deps);
    await resetToPending(deps, recordId, err);
    throw err;
  }

  if (err instanceof TerminalError) {
    await deps.records.transition(recordId, ['submitting'], 'failed', {
      lastError: formatError(err),
    });
    deps.discard?.();
    return { outcome: 'failed' };
  }

  // RetryableError / ChainUnavailableError: reset to pending then re-throw so the
  // next BullMQ attempt can progress (no txHash means broadcast never returned;
  // the §6 pre-check + contract require(!exists) prevent any double-write).
  await resetToPending(deps, recordId, err);
  throw err;
}

/**
 * Process one chain-submit job. Four idempotency layers (§6): jobId de-dup is
 * upstream; here the DB status guard (1) claims the record, the on-chain pre-check
 * (3) runs BEFORE the nonce is acquired (so recovery leaks no nonce), assignedNonce
 * is persisted before broadcast (§5 write-order 1), and the contract require(!exists)
 * is the final guard (4). buildSubmittable, getNextNonce and patchInStatus all run
 * inside the try so their throws are classified rather than stranding the record.
 */
export async function processSubmitJob(
  deps: SubmitDeps,
  job: { data: SubmitJobData },
): Promise<{ outcome: SubmitOutcome }> {
  const { recordId } = job.data;

  // (1) DB status guard: 0 rows -> another worker owns it, do not broadcast.
  const claimed = await deps.records.transition(recordId, ['pending'], 'submitting');
  if (!claimed) {
    return { outcome: 'skipped' };
  }

  let submittable: SubmittableRecord | null = null;
  let nonceConsumed = false;
  let broadcast = false;

  try {
    submittable = await deps.buildSubmittable(recordId);

    // (3) On-chain pre-check BEFORE acquiring a nonce: an already-recorded hash
    // recovers without ever advancing the local nonce counter.
    const meta = await deps.readChainRecord(submittable.recordHash);
    if (meta.exists) {
      return await recover(deps, recordId, submittable.recordHash);
    }

    // (§5 write-order 1) Acquire + persist assignedNonce immediately before the
    // broadcast. From here any non-broadcast exit must heal the nonce counter.
    const nonce = deps.wallet.getNextNonce();
    nonceConsumed = true;

    const patched = await deps.records.patchInStatus(recordId, 'submitting', {
      assignedNonce: nonce,
    });
    if (!patched) {
      // Status changed under us: the nonce advanced but nothing was broadcast.
      await healLeakedNonce(deps);
      return { outcome: 'skipped' };
    }

    const result = await deps.submitter.submitRecord(submittable, nonce);
    broadcast = true;
    await deps.records.transition(recordId, ['submitting'], 'confirming', {
      txHash: result.txHash,
      submittedAt: result.submittedAt,
    });
    await deps.enqueueConfirm(recordId, result.txHash);
    return { outcome: 'submitted' };
  } catch (rawError) {
    return handleSubmitError(deps, recordId, rawError, {
      submittable,
      nonceConsumed,
      broadcast,
    });
  }
}

/** Wire the chain-submit Worker. Constructor only: never instantiated in tests. */
export function createSubmitWorker(connection: ConnectionLike, deps: SubmitDeps): Worker {
  return new Worker<SubmitJobData>(
    QUEUE_NAMES.submit,
    (job: Job<SubmitJobData>) => processSubmitJob(deps, job),
    { connection, concurrency: SUBMIT_CONCURRENCY },
  );
}
