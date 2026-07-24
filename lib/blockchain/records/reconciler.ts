// Crash reconciler (BLOCKCHAIN-DESIGN §5). Redis is not the source of truth: after
// a crash or a cleared queue the DB alone drives recovery. reconcileOnce runs three
// steps against stale in-flight and pending rows, and never lets a single failing
// row abort the round (per-row try/catch). It performs no mutation of shared state;
// counters are local accumulators and the report is a fresh readonly object.

import type {
  ChainRecordMeta,
  EnqueueFn,
  Hex32,
  PublicRecordService,
  ReconcileReport,
  Reconciler,
  TxConfirmer,
  VerificationStatus,
} from '../types';

/** Both legal `from` edges the reconciler recovers/resets from (§5, W3 edges). */
const IN_FLIGHT_FROM: readonly VerificationStatus[] = ['submitting', 'confirming'];

const DEFAULT_STALE_MS = 180_000; // 3 min: in-flight long enough to inspect
const DEFAULT_HARD_TIMEOUT_MS = 600_000; // 10 min: give up on a stuck broadcast
const DEFAULT_PENDING_STALE_MS = 300_000; // 5 min: pending never enqueued/lost

/** The trimmed columns the reconciler reads from each scanned row. */
interface RecRow {
  readonly id: string;
  readonly recordHash: Hex32;
  readonly status: string;
  readonly assignedNonce: number | null;
  readonly txHash: string | null;
  readonly updatedAt: Date;
  readonly attemptEpoch: number;
}

/** findMany-only Prisma surface the reconciler needs. */
interface ReconcilerPrismaLike {
  readonly publicRecord: {
    findMany(args: { where: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface ReconcilerDeps {
  readonly prisma: ReconcilerPrismaLike;
  readonly records: PublicRecordService;
  readonly confirmer: Pick<TxConfirmer, 'findTxByRecordHash' | 'getTransactionStatus'>;
  readonly readChainRecord: (recordHash: Hex32) => Promise<ChainRecordMeta>;
  readonly getLatestNonce: () => Promise<number>;
  readonly enqueue: EnqueueFn;
  readonly staleThresholdMs?: number;
  readonly hardTimeoutMs?: number;
  readonly pendingStaleMs?: number;
}

/** Per-row outcome; the caller increments the matching report counter. */
type Outcome = 'recovered' | 'requeued' | 'failed' | 'untouched';

export function createReconciler(deps: ReconcilerDeps): Reconciler {
  const staleThresholdMs = deps.staleThresholdMs ?? DEFAULT_STALE_MS;
  const hardTimeoutMs = deps.hardTimeoutMs ?? DEFAULT_HARD_TIMEOUT_MS;
  const pendingStaleMs = deps.pendingStaleMs ?? DEFAULT_PENDING_STALE_MS;

  /** Backfill txHash from the on-chain event and move straight to verified. */
  async function recoverToVerified(row: RecRow, now: Date): Promise<void> {
    const found = await deps.confirmer.findTxByRecordHash(row.recordHash);
    const patch = found
      ? { txHash: found.txHash, blockNumber: found.blockNumber, confirmedAt: now }
      : { confirmedAt: now };
    await deps.records.transition(row.id, IN_FLIGHT_FROM, 'verified', patch);
  }

  /** §5 step (a) nonce judgement when the chain holds no record for this row. */
  async function nonceJudgement(row: RecRow, now: Date): Promise<Outcome> {
    if (row.assignedNonce === null) {
      // Crash before broadcast: no tx ever left; safe to reset and re-enqueue. Bump
      // the attempt epoch (persisted in the transition patch) so the jobId is fresh
      // and cannot de-dupe against a prior exhausted job still held in the BullMQ
      // failed set (§6 idempotency line 1; BLOCKCHAIN-DESIGN line 378).
      const attemptEpoch = row.attemptEpoch + 1;
      await deps.records.transition(row.id, IN_FLIGHT_FROM, 'pending', { attemptEpoch });
      const { queued } = await deps.enqueue({ id: row.id, attemptEpoch });
      return queued ? 'requeued' : 'untouched';
    }
    const latestNonce = await deps.getLatestNonce();
    if (row.assignedNonce < latestNonce) {
      // Nonce overtaken and chain has no record: contract require(!exists) guards
      // against any double-write, so bump the attempt epoch and re-enqueue.
      const attemptEpoch = row.attemptEpoch + 1;
      await deps.records.transition(row.id, IN_FLIGHT_FROM, 'pending', { attemptEpoch });
      const { queued } = await deps.enqueue({ id: row.id, attemptEpoch });
      return queued ? 'requeued' : 'untouched';
    }
    if (now.getTime() - row.updatedAt.getTime() < hardTimeoutMs) {
      // assignedNonce >= latest: the tx may still be sitting in the mempool.
      return 'untouched';
    }
    await deps.records.transition(row.id, IN_FLIGHT_FROM, 'failed', {
      lastError: 'RECONCILE_HARD_TIMEOUT',
    });
    return 'failed';
  }

  /** Handle one stale in-flight row: confirmation re-run (b) then nonce path (a). */
  async function handleInFlight(row: RecRow, now: Date): Promise<Outcome> {
    // (b) A confirming row that already has a txHash: re-run confirmation first.
    if (row.status === 'confirming' && row.txHash) {
      const status = await deps.confirmer.getTransactionStatus(row.txHash);
      if (status === 'confirmed') {
        await recoverToVerified(row, now);
        return 'recovered';
      }
      if (status === 'reverted') {
        await deps.records.transition(row.id, IN_FLIGHT_FROM, 'failed', { lastError: 'REVERTED' });
        return 'failed';
      }
      if (status === 'pending') {
        return 'untouched';
      }
      // not_found: fall through to the on-chain read + nonce judgement below.
    }

    // (a) Ask the contract whether the record already landed.
    const meta = await deps.readChainRecord(row.recordHash);
    if (meta.exists) {
      await recoverToVerified(row, now);
      return 'recovered';
    }
    return nonceJudgement(row, now);
  }

  async function reconcileOnce(now: Date = new Date()): Promise<ReconcileReport> {
    let scanned = 0;
    let recovered = 0;
    let requeued = 0;
    let failed = 0;
    let untouched = 0;

    const bump = (outcome: Outcome): void => {
      if (outcome === 'recovered') recovered += 1;
      else if (outcome === 'requeued') requeued += 1;
      else if (outcome === 'failed') failed += 1;
      else untouched += 1;
    };

    // Steps (a)/(b): stale in-flight rows (submitting|confirming).
    const inFlight = (await deps.prisma.publicRecord.findMany({
      where: {
        // W2-B: never touch DB-only rows. They are terminal, unqueued, and
        // (defensively) not even in the scanned status set — double guard.
        chainEligible: true,
        status: { in: IN_FLIGHT_FROM },
        updatedAt: { lt: new Date(now.getTime() - staleThresholdMs) },
      },
    })) as RecRow[];
    for (const row of inFlight) {
      scanned += 1;
      try {
        bump(await handleInFlight(row, now));
      } catch {
        // Single-row failure must not abort the round (§5 resilience).
        failed += 1;
      }
    }

    // Step (c): stale pending rows whose enqueue was lost (Redis cleared) —
    // re-enqueue without touching status; the DB fully rebuilds the queue.
    const stalePending = (await deps.prisma.publicRecord.findMany({
      where: {
        // W2-B (red-team high): step (c) previously bypassed the enqueue guard and
        // could re-enqueue a DB-only stale-pending row. Scope it to chainEligible.
        chainEligible: true,
        status: 'pending',
        updatedAt: { lt: new Date(now.getTime() - pendingStaleMs) },
      },
    })) as RecRow[];
    for (const row of stalePending) {
      scanned += 1;
      try {
        // Bump + persist the attempt epoch (same-status patch, never the state
        // machine) so the re-enqueue jobId is fresh: a prior job that exhausted its
        // retries and lingers in the BullMQ failed set (retained for days) would
        // otherwise de-dupe this add and strand the row until it ages out
        // (§5/§6; BLOCKCHAIN-DESIGN line 378/390).
        const attemptEpoch = row.attemptEpoch + 1;
        const patched = await deps.records.patchInStatus(row.id, 'pending', { attemptEpoch });
        if (!patched) {
          // Row left 'pending' under us (a worker claimed it): nothing to re-enqueue.
          untouched += 1;
          continue;
        }
        const { queued } = await deps.enqueue({ id: row.id, attemptEpoch });
        if (queued) {
          requeued += 1;
        } else {
          untouched += 1;
        }
      } catch {
        failed += 1;
      }
    }

    return { scanned, recovered, requeued, failed, untouched };
  }

  return { reconcileOnce };
}
