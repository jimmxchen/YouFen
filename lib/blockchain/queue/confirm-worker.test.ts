import { describe, it, expect, vi } from 'vitest';
import type { Queue } from 'bullmq';

import { RetryableError } from '../errors';
import type { ConfirmResult, Hex32, PublicRecordDTO } from '../types';

import {
  processConfirmJob,
  makeConfirmEnqueuer,
  type ConfirmDeps,
} from './confirm-worker';
import { CONFIRM_JOB_OPTIONS } from './queues';

const HASH = ('0x' + 'cd'.repeat(32)) as Hex32;
const CONFIRMED_AT = new Date(2_000);
const JOB = { data: { recordId: 'pr_1', txHash: '0xtx' } } as const;

interface SetupOpts {
  record?: PublicRecordDTO | null;
  confirmStatus?: 'confirmed' | 'reverted';
  exists?: boolean;
  waitImpl?: () => Promise<ConfirmResult>;
}

function setup(opts: SetupOpts = {}) {
  const record =
    opts.record === undefined ? ({ id: 'pr_1', recordHash: HASH } as PublicRecordDTO) : opts.record;
  const getById = vi.fn().mockResolvedValue(record);
  const transition = vi.fn().mockResolvedValue(true);
  const records = { getById, transition } as unknown as ConfirmDeps['records'];

  const waitForConfirmation = vi.fn(
    opts.waitImpl ??
      (async (): Promise<ConfirmResult> => ({
        status: opts.confirmStatus ?? 'confirmed',
        blockNumber: 12,
        blockHash: '0xbh',
        confirmedAt: CONFIRMED_AT,
      })),
  );
  const confirmer = { waitForConfirmation } as unknown as ConfirmDeps['confirmer'];

  const readChainRecord = vi.fn(async () => ({ exists: opts.exists ?? true }));

  const deps: ConfirmDeps = { records, confirmer, readChainRecord, confirmations: 2 };
  return { deps, getById, transition, waitForConfirmation, readChainRecord };
}

describe('processConfirmJob', () => {
  it('skips when the record no longer exists', async () => {
    const s = setup({ record: null });
    const result = await processConfirmJob(s.deps, JOB);
    expect(result).toEqual({ outcome: 'skipped' });
    expect(s.waitForConfirmation).not.toHaveBeenCalled();
  });

  it('verifies when confirmed and indexed on chain', async () => {
    const s = setup();
    const result = await processConfirmJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'verified' });
    // W2-B: recordHash is threaded additively to arm the confirmer fast path.
    expect(s.waitForConfirmation).toHaveBeenCalledWith('0xtx', {
      confirmations: 2,
      recordHash: HASH,
    });
    expect(s.readChainRecord).toHaveBeenCalledWith(HASH);
    expect(s.transition).toHaveBeenCalledWith('pr_1', ['confirming'], 'verified', {
      blockNumber: 12,
      blockHash: '0xbh',
      confirmedAt: CONFIRMED_AT,
    });
  });

  it('fails on a reverted receipt without re-reading the chain', async () => {
    const s = setup({ confirmStatus: 'reverted' });
    const result = await processConfirmJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'reverted' });
    expect(s.transition).toHaveBeenCalledWith('pr_1', ['confirming'], 'failed', {
      lastError: 'REVERTED',
    });
    expect(s.readChainRecord).not.toHaveBeenCalled();
  });

  it('throws RetryableError when confirmed but not yet indexed', async () => {
    const s = setup({ exists: false });
    await expect(processConfirmJob(s.deps, JOB)).rejects.toBeInstanceOf(RetryableError);
    // Must NOT prematurely mark verified.
    expect(s.transition).not.toHaveBeenCalled();
  });

  it('threads the record hash into waitForConfirmation for the fast path (W2-B)', async () => {
    const s = setup();
    await processConfirmJob(s.deps, JOB);
    expect(s.waitForConfirmation).toHaveBeenCalledWith('0xtx', {
      confirmations: 2,
      recordHash: HASH,
    });
  });

  it('re-throws a confirmation timeout so the reconciler can take over', async () => {
    const s = setup({
      waitImpl: async () => {
        throw new RetryableError('CONFIRM_TIMEOUT');
      },
    });
    await expect(processConfirmJob(s.deps, JOB)).rejects.toThrow('CONFIRM_TIMEOUT');
  });
});

function makeConfirmQueue() {
  const add = vi.fn().mockResolvedValue({});
  const getJob = vi.fn();
  const confirmQueue = { add, getJob } as unknown as Pick<Queue, 'add' | 'getJob'>;
  return { add, getJob, confirmQueue };
}

describe('makeConfirmEnqueuer', () => {
  it('adds a confirm job keyed confirm:${recordId}:${txHash} with CONFIRM_JOB_OPTIONS', async () => {
    const { add, getJob, confirmQueue } = makeConfirmQueue();
    getJob.mockResolvedValue(undefined);

    await makeConfirmEnqueuer(confirmQueue)('pr_1', '0xtx');

    expect(getJob).toHaveBeenCalledWith('confirm:pr_1:0xtx');
    expect(add).toHaveBeenCalledWith(
      'confirm',
      { recordId: 'pr_1', txHash: '0xtx' },
      { ...CONFIRM_JOB_OPTIONS, jobId: 'confirm:pr_1:0xtx' },
    );
  });

  it('de-dupes when getJob already finds the job', async () => {
    const { add, getJob, confirmQueue } = makeConfirmQueue();
    getJob.mockResolvedValue({ id: 'confirm:pr_1:0xtx' });

    await makeConfirmEnqueuer(confirmQueue)('pr_1', '0xtx');

    expect(add).not.toHaveBeenCalled();
  });
});
