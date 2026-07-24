import { describe, it, expect, vi } from 'vitest';

import { createReconciler } from './reconciler';

// Frozen defaults from the spec: stale=3min, hardTimeout=10min, pendingStale=5min.
const NOW = new Date('2026-07-23T12:00:00.000Z');
const min = (n: number) => new Date(NOW.getTime() - n * 60_000);
const STALE = min(10); // in-flight long enough to be scanned
const WITHIN_HARD = min(5); // scanned (>3min) but below the 10min hard timeout
const BEYOND_HARD = min(11); // past the hard timeout

const HASH = (c: string) => `0x${c.repeat(64)}` as const;

interface RecRow {
  id: string;
  recordHash: string;
  status: string;
  assignedNonce: number | null;
  txHash: string | null;
  updatedAt: Date;
  attemptEpoch: number;
}

function recRow(over: Partial<RecRow> = {}): RecRow {
  return {
    id: 'r1',
    recordHash: HASH('a'),
    status: 'submitting',
    assignedNonce: null,
    txHash: null,
    updatedAt: STALE,
    attemptEpoch: 1,
    ...over,
  };
}

type Deps = Parameters<typeof createReconciler>[0];

function makeDeps(over: Record<string, unknown> = {}) {
  const findMany = vi.fn().mockResolvedValue([]);
  return {
    prisma: { publicRecord: { findMany } },
    records: {
      transition: vi.fn().mockResolvedValue(true),
      patchInStatus: vi.fn().mockResolvedValue(true),
      createPendingRecord: vi.fn(),
      requestSubmission: vi.fn(),
      getById: vi.fn(),
      getWithSource: vi.fn(),
      markSuperseded: vi.fn(),
    },
    confirmer: {
      findTxByRecordHash: vi.fn().mockResolvedValue(null),
      getTransactionStatus: vi.fn().mockResolvedValue('pending'),
    },
    readChainRecord: vi.fn().mockResolvedValue({ exists: false }),
    getLatestNonce: vi.fn().mockResolvedValue(0),
    enqueue: vi.fn().mockResolvedValue({ queued: true, jobId: 'submit:r1:v1' }),
    ...over,
  };
}

function build(deps: ReturnType<typeof makeDeps>) {
  return createReconciler(deps as unknown as Deps);
}

/** Route the two findMany scans: first call = in-flight, second = stale pending. */
function setScan(
  deps: ReturnType<typeof makeDeps>,
  inflight: RecRow[],
  pending: RecRow[] = [],
) {
  deps.prisma.publicRecord.findMany.mockImplementation((args: { where: { status?: unknown } }) => {
    const status = args.where.status as { in?: string[] } | string | undefined;
    if (status && typeof status === 'object' && Array.isArray(status.in)) {
      return Promise.resolve(inflight);
    }
    return Promise.resolve(pending);
  });
}

describe('reconcileOnce — in-flight recovery (chain already holds the record)', () => {
  it('recovers a submitting row to verified via findTxByRecordHash', async () => {
    const deps = makeDeps();
    setScan(deps, [recRow({ id: 'r1', status: 'submitting', assignedNonce: 5 })]);
    deps.readChainRecord.mockResolvedValue({ exists: true });
    deps.confirmer.findTxByRecordHash.mockResolvedValue({ txHash: '0xtx', blockNumber: 100 });
    const rep = await build(deps).reconcileOnce(NOW);
    expect(rep.recovered).toBe(1);
    expect(deps.records.transition).toHaveBeenCalledWith(
      'r1',
      ['submitting', 'confirming'],
      'verified',
      { txHash: '0xtx', blockNumber: 100, confirmedAt: NOW },
    );
  });

  it('recovers a confirming row (no txHash) to verified the same way', async () => {
    const deps = makeDeps();
    setScan(deps, [recRow({ id: 'r2', status: 'confirming', assignedNonce: 5 })]);
    deps.readChainRecord.mockResolvedValue({ exists: true });
    deps.confirmer.findTxByRecordHash.mockResolvedValue({ txHash: '0xtx2', blockNumber: 7 });
    const rep = await build(deps).reconcileOnce(NOW);
    expect(rep.recovered).toBe(1);
    expect(deps.records.transition).toHaveBeenCalledWith(
      'r2',
      ['submitting', 'confirming'],
      'verified',
      { txHash: '0xtx2', blockNumber: 7, confirmedAt: NOW },
    );
  });

  it('scans in-flight rows with status IN (submitting,confirming) and a stale cutoff', async () => {
    const deps = makeDeps();
    setScan(deps, []);
    await build(deps).reconcileOnce(NOW);
    const firstWhere = deps.prisma.publicRecord.findMany.mock.calls[0][0].where;
    expect(firstWhere.status).toEqual({ in: ['submitting', 'confirming'] });
    expect(firstWhere.updatedAt).toEqual({ lt: min(3) });
  });
});

describe('reconcileOnce — nonce judgement when the chain has no record', () => {
  it('resets to pending, bumps attemptEpoch and re-enqueues when there was no broadcast (assignedNonce null)', async () => {
    const deps = makeDeps();
    setScan(deps, [recRow({ id: 'r1', assignedNonce: null, attemptEpoch: 1 })]);
    deps.readChainRecord.mockResolvedValue({ exists: false });
    const rep = await build(deps).reconcileOnce(NOW);
    // Epoch must bump so the jobId is fresh and cannot de-dupe against a prior
    // exhausted job still held in the BullMQ failed set (BLOCKCHAIN-DESIGN line 378).
    expect(deps.records.transition).toHaveBeenCalledWith(
      'r1',
      ['submitting', 'confirming'],
      'pending',
      { attemptEpoch: 2 },
    );
    expect(deps.enqueue).toHaveBeenCalledWith({ id: 'r1', attemptEpoch: 2 });
    expect(rep.requeued).toBe(1);
  });

  it('counts untouched (not requeued) when the null-branch enqueue is de-duped', async () => {
    const deps = makeDeps();
    setScan(deps, [recRow({ id: 'r1', assignedNonce: null, attemptEpoch: 1 })]);
    deps.readChainRecord.mockResolvedValue({ exists: false });
    deps.enqueue.mockResolvedValue({ queued: false, jobId: 'submit:r1:v2' });
    const rep = await build(deps).reconcileOnce(NOW);
    expect(rep.requeued).toBe(0);
    expect(rep.untouched).toBe(1);
  });

  it('bumps attemptEpoch and re-enqueues when the nonce was overtaken', async () => {
    const deps = makeDeps();
    setScan(deps, [recRow({ id: 'r1', assignedNonce: 3, attemptEpoch: 1 })]);
    deps.readChainRecord.mockResolvedValue({ exists: false });
    deps.getLatestNonce.mockResolvedValue(5);
    const rep = await build(deps).reconcileOnce(NOW);
    expect(deps.records.transition).toHaveBeenCalledWith(
      'r1',
      ['submitting', 'confirming'],
      'pending',
      { attemptEpoch: 2 },
    );
    expect(deps.enqueue).toHaveBeenCalledWith({ id: 'r1', attemptEpoch: 2 });
    expect(rep.requeued).toBe(1);
  });

  it('leaves a row untouched while it may still be in the mempool', async () => {
    const deps = makeDeps();
    setScan(deps, [recRow({ id: 'r1', assignedNonce: 5, updatedAt: WITHIN_HARD })]);
    deps.readChainRecord.mockResolvedValue({ exists: false });
    deps.getLatestNonce.mockResolvedValue(5);
    const rep = await build(deps).reconcileOnce(NOW);
    expect(rep.untouched).toBe(1);
    expect(deps.records.transition).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it('fails a row past the hard timeout', async () => {
    const deps = makeDeps();
    setScan(deps, [recRow({ id: 'r1', assignedNonce: 5, updatedAt: BEYOND_HARD })]);
    deps.readChainRecord.mockResolvedValue({ exists: false });
    deps.getLatestNonce.mockResolvedValue(5);
    const rep = await build(deps).reconcileOnce(NOW);
    expect(deps.records.transition).toHaveBeenCalledWith(
      'r1',
      ['submitting', 'confirming'],
      'failed',
      { lastError: 'RECONCILE_HARD_TIMEOUT' },
    );
    expect(rep.failed).toBe(1);
  });
});

describe('reconcileOnce — confirming rows with a txHash re-run confirmation first', () => {
  it('confirmed -> verified without reading the contract', async () => {
    const deps = makeDeps();
    setScan(deps, [recRow({ id: 'r1', status: 'confirming', txHash: '0xtx', assignedNonce: 5 })]);
    deps.confirmer.getTransactionStatus.mockResolvedValue('confirmed');
    deps.confirmer.findTxByRecordHash.mockResolvedValue({ txHash: '0xtx', blockNumber: 50 });
    const rep = await build(deps).reconcileOnce(NOW);
    expect(rep.recovered).toBe(1);
    expect(deps.readChainRecord).not.toHaveBeenCalled();
    expect(deps.records.transition).toHaveBeenCalledWith(
      'r1',
      ['submitting', 'confirming'],
      'verified',
      { txHash: '0xtx', blockNumber: 50, confirmedAt: NOW },
    );
  });

  it('reverted -> failed with lastError REVERTED', async () => {
    const deps = makeDeps();
    setScan(deps, [recRow({ id: 'r1', status: 'confirming', txHash: '0xtx', assignedNonce: 5 })]);
    deps.confirmer.getTransactionStatus.mockResolvedValue('reverted');
    const rep = await build(deps).reconcileOnce(NOW);
    expect(deps.records.transition).toHaveBeenCalledWith(
      'r1',
      ['submitting', 'confirming'],
      'failed',
      { lastError: 'REVERTED' },
    );
    expect(rep.failed).toBe(1);
  });

  it('not_found falls through to the nonce judgement', async () => {
    const deps = makeDeps();
    setScan(deps, [
      recRow({ id: 'r1', status: 'confirming', txHash: '0xtx', assignedNonce: null }),
    ]);
    deps.confirmer.getTransactionStatus.mockResolvedValue('not_found');
    deps.readChainRecord.mockResolvedValue({ exists: false });
    const rep = await build(deps).reconcileOnce(NOW);
    expect(deps.readChainRecord).toHaveBeenCalled();
    expect(deps.enqueue).toHaveBeenCalledWith({ id: 'r1', attemptEpoch: 2 });
    expect(rep.requeued).toBe(1);
  });
});

describe('reconcileOnce — pending backfill (DB is the source of truth)', () => {
  it('bumps+persists attemptEpoch then re-enqueues stale pending rows, without a state transition', async () => {
    const deps = makeDeps();
    setScan(deps, [], [recRow({ id: 'p1', status: 'pending', attemptEpoch: 4, updatedAt: STALE })]);
    const rep = await build(deps).reconcileOnce(NOW);
    // Epoch bump is persisted via patchInStatus (same-status field patch, never the
    // state machine) so the fresh jobId cannot collide with a prior exhausted job
    // stranded in the BullMQ failed set (BLOCKCHAIN-DESIGN line 378/390).
    expect(deps.records.patchInStatus).toHaveBeenCalledWith('p1', 'pending', { attemptEpoch: 5 });
    expect(deps.enqueue).toHaveBeenCalledWith({ id: 'p1', attemptEpoch: 5 });
    expect(rep.requeued).toBe(1);
    expect(deps.records.transition).not.toHaveBeenCalled();
    const pendingWhere = deps.prisma.publicRecord.findMany.mock.calls[1][0].where;
    expect(pendingWhere.status).toBe('pending');
    expect(pendingWhere.updatedAt).toEqual({ lt: min(5) });
  });

  it('counts untouched (not requeued) when the stale-pending enqueue is de-duped', async () => {
    const deps = makeDeps();
    setScan(deps, [], [recRow({ id: 'p1', status: 'pending', attemptEpoch: 4, updatedAt: STALE })]);
    deps.enqueue.mockResolvedValue({ queued: false, jobId: 'submit:p1:v5' });
    const rep = await build(deps).reconcileOnce(NOW);
    expect(rep.requeued).toBe(0);
    expect(rep.untouched).toBe(1);
  });

  it('skips re-enqueue when the row already left pending (patch matched 0 rows)', async () => {
    const deps = makeDeps();
    setScan(deps, [], [recRow({ id: 'p1', status: 'pending', attemptEpoch: 4, updatedAt: STALE })]);
    deps.records.patchInStatus.mockResolvedValue(false);
    const rep = await build(deps).reconcileOnce(NOW);
    expect(deps.enqueue).not.toHaveBeenCalled();
    expect(rep.requeued).toBe(0);
    expect(rep.untouched).toBe(1);
  });
});

describe('reconcileOnce — chainEligible filter (W2-B: DB-only / recorded rows never re-enqueue)', () => {
  it('scopes both the in-flight and stale-pending scans to chainEligible: true', async () => {
    const deps = makeDeps();
    setScan(deps, [], []);
    await build(deps).reconcileOnce(NOW);
    const inflightWhere = deps.prisma.publicRecord.findMany.mock.calls[0][0].where;
    const pendingWhere = deps.prisma.publicRecord.findMany.mock.calls[1][0].where;
    expect(inflightWhere.chainEligible).toBe(true);
    expect(pendingWhere.chainEligible).toBe(true);
  });

  it('leaves the pre-existing status/updatedAt predicates intact alongside the new guard', async () => {
    const deps = makeDeps();
    setScan(deps, [], []);
    await build(deps).reconcileOnce(NOW);
    const inflightWhere = deps.prisma.publicRecord.findMany.mock.calls[0][0].where;
    const pendingWhere = deps.prisma.publicRecord.findMany.mock.calls[1][0].where;
    expect(inflightWhere.status).toEqual({ in: ['submitting', 'confirming'] });
    expect(pendingWhere.status).toBe('pending');
  });
});

describe('reconcileOnce — resilience', () => {
  it('a single failing row does not abort the round', async () => {
    const deps = makeDeps();
    const bad = recRow({ id: 'bad', recordHash: HASH('c'), assignedNonce: 5 });
    const good = recRow({ id: 'good', recordHash: HASH('d'), assignedNonce: 5 });
    setScan(deps, [bad, good]);
    deps.readChainRecord.mockImplementation((h: string) =>
      h === bad.recordHash ? Promise.reject(new Error('rpc boom')) : Promise.resolve({ exists: true }),
    );
    deps.confirmer.findTxByRecordHash.mockResolvedValue({ txHash: '0xtx', blockNumber: 1 });
    const rep = await build(deps).reconcileOnce(NOW);
    expect(rep.scanned).toBe(2);
    expect(rep.failed).toBe(1);
    expect(rep.recovered).toBe(1);
  });

  it('defaults now to the current time when omitted', async () => {
    const deps = makeDeps();
    setScan(deps, []);
    const rep = await build(deps).reconcileOnce();
    expect(rep.scanned).toBe(0);
  });
});
