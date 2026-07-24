import { describe, it, expect, vi } from 'vitest';

import {
  AlreadyRecordedError,
  ChainUnavailableError,
  NonceError,
  RetryableError,
  TerminalError,
} from '../errors';
import type { Hex32, SubmittableRecord, SubmitResult } from '../types';

import { processSubmitJob, type SubmitDeps } from './submit-worker';

const HASH = ('0x' + 'ab'.repeat(32)) as Hex32;
const JOB = { data: { recordId: 'pr_1' } } as const;
const SUBMITTED_AT = new Date(1_000);

function makeSubmittable(): SubmittableRecord {
  return { recordId: 'pr_1', recordType: 'token_mint', recordHash: HASH, chainArgs: [] };
}

interface SetupOpts {
  claimed?: boolean;
  patched?: boolean;
  exists?: boolean;
  submitImpl?: () => Promise<SubmitResult>;
  buildImpl?: () => Promise<SubmittableRecord>;
  found?: { txHash: string; blockNumber: number } | null;
  resetRejects?: boolean;
}

function setup(opts: SetupOpts = {}) {
  const transition = vi.fn().mockResolvedValue(true);
  if (opts.claimed === false) {
    transition.mockResolvedValueOnce(false);
  }
  if (opts.resetRejects) {
    // First call = claim (true); second call = reset-to-pending (rejects).
    transition.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('db down'));
  }
  const patchInStatus = vi.fn().mockResolvedValue(opts.patched ?? true);
  const records = { transition, patchInStatus } as unknown as SubmitDeps['records'];

  const submitRecord = vi.fn(
    opts.submitImpl ??
      (async (): Promise<SubmitResult> => ({ txHash: '0xtx', nonce: 7, submittedAt: SUBMITTED_AT })),
  );
  const submitter = { submitRecord } as unknown as SubmitDeps['submitter'];

  const getNextNonce = vi.fn(() => 7);
  const resyncNonce = vi.fn(async () => 8);
  const wallet = { getNextNonce, resyncNonce };

  const readChainRecord = vi.fn(async () => ({ exists: opts.exists ?? false }));
  const findTxByRecordHash = vi.fn(async () =>
    opts.found === undefined ? { txHash: '0xrec', blockNumber: 5 } : opts.found,
  );
  const enqueueConfirm = vi.fn(async () => {});
  const buildSubmittable = vi.fn(opts.buildImpl ?? (async () => makeSubmittable()));
  const discard = vi.fn();

  const deps: SubmitDeps = {
    records,
    submitter,
    wallet,
    readChainRecord,
    findTxByRecordHash,
    enqueueConfirm,
    buildSubmittable,
    discard,
  };
  return {
    deps,
    transition,
    patchInStatus,
    submitRecord,
    getNextNonce,
    resyncNonce,
    readChainRecord,
    findTxByRecordHash,
    enqueueConfirm,
    discard,
  };
}

describe('processSubmitJob', () => {
  it('skips when the pending->submitting status guard loses the race', async () => {
    const s = setup({ claimed: false });
    const result = await processSubmitJob(s.deps, JOB);
    expect(result).toEqual({ outcome: 'skipped' });
    expect(s.submitRecord).not.toHaveBeenCalled();
    expect(s.patchInStatus).not.toHaveBeenCalled();
  });

  it('skips when patchInStatus reports the status changed under us', async () => {
    const s = setup({ patched: false });
    const result = await processSubmitJob(s.deps, JOB);
    expect(result).toEqual({ outcome: 'skipped' });
    expect(s.submitRecord).not.toHaveBeenCalled();
    expect(s.transition).toHaveBeenCalledTimes(1); // only the claim
  });

  it('submits: persists assignedNonce via patchInStatus BEFORE broadcast, then confirming + enqueueConfirm', async () => {
    const s = setup();
    const result = await processSubmitJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'submitted' });
    expect(s.patchInStatus).toHaveBeenCalledWith('pr_1', 'submitting', { assignedNonce: 7 });
    expect(s.submitRecord).toHaveBeenCalledWith(makeSubmittable(), 7);
    // Write-order: assignedNonce persisted before the broadcast (§5 write-order 1).
    expect(s.patchInStatus.mock.invocationCallOrder[0]).toBeLessThan(
      s.submitRecord.mock.invocationCallOrder[0],
    );
    expect(s.transition).toHaveBeenNthCalledWith(2, 'pr_1', ['submitting'], 'confirming', {
      txHash: '0xtx',
      submittedAt: SUBMITTED_AT,
    });
    expect(s.enqueueConfirm).toHaveBeenCalledWith('pr_1', '0xtx');
  });

  it('recovers via the on-chain pre-check (exists=true) without broadcasting', async () => {
    const s = setup({ exists: true, found: { txHash: '0xrec', blockNumber: 5 } });
    const result = await processSubmitJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'recovered' });
    expect(s.submitRecord).not.toHaveBeenCalled();
    expect(s.findTxByRecordHash).toHaveBeenCalledWith(HASH);
    expect(s.transition).toHaveBeenNthCalledWith(2, 'pr_1', ['submitting'], 'confirming', {
      txHash: '0xrec',
      submittedAt: expect.any(Date),
    });
    expect(s.enqueueConfirm).toHaveBeenCalledWith('pr_1', '0xrec');
  });

  it('recovers when submitRecord throws AlreadyRecordedError', async () => {
    const s = setup({
      submitImpl: async () => {
        throw new AlreadyRecordedError('RECORD_EXISTS');
      },
      found: { txHash: '0xrec', blockNumber: 5 },
    });
    const result = await processSubmitJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'recovered' });
    expect(s.findTxByRecordHash).toHaveBeenCalledWith(HASH);
    expect(s.enqueueConfirm).toHaveBeenCalledWith('pr_1', '0xrec');
  });

  it('retries when recovery finds no tx yet (exists but not indexed)', async () => {
    const s = setup({ exists: true, found: null });
    await expect(processSubmitJob(s.deps, JOB)).rejects.toBeInstanceOf(RetryableError);
    expect(s.enqueueConfirm).not.toHaveBeenCalled();
  });

  it('on NonceError: resyncs, resets to pending, and re-throws', async () => {
    const s = setup({
      submitImpl: async () => {
        throw new NonceError('nonce too low');
      },
    });
    await expect(processSubmitJob(s.deps, JOB)).rejects.toBeInstanceOf(NonceError);
    expect(s.resyncNonce).toHaveBeenCalledTimes(1);
    expect(s.transition).toHaveBeenCalledWith('pr_1', ['submitting'], 'pending', {
      lastError: 'NONCE_ERROR: nonce too low',
    });
  });

  it('on a retryable/unavailable error: resets to pending and re-throws (retry can progress)', async () => {
    const s = setup({
      submitImpl: async () => {
        throw new ChainUnavailableError('rpc down');
      },
    });
    await expect(processSubmitJob(s.deps, JOB)).rejects.toBeInstanceOf(ChainUnavailableError);
    expect(s.transition).toHaveBeenCalledWith('pr_1', ['submitting'], 'pending', {
      lastError: 'CHAIN_UNAVAILABLE: rpc down',
    });
    expect(s.discard).not.toHaveBeenCalled();
  });

  it('re-throws even when the reset-to-pending write itself fails (best-effort)', async () => {
    const s = setup({
      resetRejects: true,
      submitImpl: async () => {
        throw new ChainUnavailableError('rpc down');
      },
    });
    await expect(processSubmitJob(s.deps, JOB)).rejects.toBeInstanceOf(ChainUnavailableError);
  });

  it('on TerminalError: moves to failed, calls discard, does NOT re-throw', async () => {
    const s = setup({
      submitImpl: async () => {
        throw new TerminalError('bad arg');
      },
    });
    const result = await processSubmitJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'failed' });
    expect(s.transition).toHaveBeenCalledWith('pr_1', ['submitting'], 'failed', {
      lastError: 'TERMINAL: bad arg',
    });
    expect(s.discard).toHaveBeenCalledTimes(1);
    expect(s.enqueueConfirm).not.toHaveBeenCalled();
  });

  // ---- nonce-leak regressions (getNextNonce advances a shared counter) ----

  it('never acquires a nonce on the on-chain pre-check recovery path', async () => {
    const s = setup({ exists: true, found: { txHash: '0xrec', blockNumber: 5 } });
    const result = await processSubmitJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'recovered' });
    // Pre-check runs before getNextNonce, so no nonce is consumed (thus none leaks).
    expect(s.getNextNonce).not.toHaveBeenCalled();
    expect(s.resyncNonce).not.toHaveBeenCalled();
  });

  it('heals the nonce (resync) when a consumed nonce is never broadcast: ChainUnavailable', async () => {
    const s = setup({
      submitImpl: async () => {
        throw new ChainUnavailableError('rpc down');
      },
    });
    await expect(processSubmitJob(s.deps, JOB)).rejects.toBeInstanceOf(ChainUnavailableError);
    // The nonce advanced but no tx was broadcast -> reseed from chain to close the gap.
    expect(s.getNextNonce).toHaveBeenCalledTimes(1);
    expect(s.resyncNonce).toHaveBeenCalledTimes(1);
  });

  it('heals the nonce when a consumed nonce is never broadcast: RECORD_EXISTS revert', async () => {
    const s = setup({
      submitImpl: async () => {
        throw new AlreadyRecordedError('RECORD_EXISTS');
      },
      found: { txHash: '0xrec', blockNumber: 5 },
    });
    const result = await processSubmitJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'recovered' });
    expect(s.resyncNonce).toHaveBeenCalledTimes(1);
    expect(s.enqueueConfirm).toHaveBeenCalledWith('pr_1', '0xrec');
  });

  it('heals the nonce when patchInStatus loses the race after the nonce was consumed', async () => {
    const s = setup({ patched: false });
    const result = await processSubmitJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'skipped' });
    expect(s.getNextNonce).toHaveBeenCalledTimes(1);
    expect(s.resyncNonce).toHaveBeenCalledTimes(1);
    expect(s.submitRecord).not.toHaveBeenCalled();
  });

  it('does NOT resync after a successful broadcast (nonce was spent on-chain)', async () => {
    const s = setup();
    const result = await processSubmitJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'submitted' });
    expect(s.resyncNonce).not.toHaveBeenCalled();
  });

  // ---- boundary regressions: build/nonce throws must not strand the record ----

  it('moves to failed when buildSubmittable throws a TerminalError (no nonce leaked)', async () => {
    const s = setup({
      buildImpl: async () => {
        throw new TerminalError('SOURCE_NOT_FOUND');
      },
    });
    const result = await processSubmitJob(s.deps, JOB);

    expect(result).toEqual({ outcome: 'failed' });
    expect(s.transition).toHaveBeenCalledWith('pr_1', ['submitting'], 'failed', {
      lastError: 'TERMINAL: SOURCE_NOT_FOUND',
    });
    expect(s.discard).toHaveBeenCalledTimes(1);
    // Threw before nonce acquisition, so nothing to heal.
    expect(s.getNextNonce).not.toHaveBeenCalled();
    expect(s.resyncNonce).not.toHaveBeenCalled();
  });

  it('resyncs, resets to pending and re-throws when getNextNonce throws NonceError (uninitialised wallet)', async () => {
    const s = setup();
    s.getNextNonce.mockImplementation(() => {
      throw new NonceError('Server wallet nonce not initialised');
    });
    await expect(processSubmitJob(s.deps, JOB)).rejects.toBeInstanceOf(NonceError);
    expect(s.resyncNonce).toHaveBeenCalledTimes(1);
    expect(s.transition).toHaveBeenCalledWith('pr_1', ['submitting'], 'pending', {
      lastError: 'NONCE_ERROR: Server wallet nonce not initialised',
    });
    expect(s.submitRecord).not.toHaveBeenCalled();
  });

  it('resets recovery-from-catch to pending when the tx is not indexed yet (retry can progress)', async () => {
    const s = setup({
      submitImpl: async () => {
        throw new AlreadyRecordedError('RECORD_EXISTS');
      },
      found: null,
    });
    await expect(processSubmitJob(s.deps, JOB)).rejects.toBeInstanceOf(RetryableError);
    // Record must be reset to pending so a later BullMQ attempt re-claims it.
    expect(s.transition).toHaveBeenCalledWith('pr_1', ['submitting'], 'pending', {
      lastError: 'RETRYABLE: RECORD_EXISTS_BUT_TX_NOT_INDEXED',
    });
    expect(s.enqueueConfirm).not.toHaveBeenCalled();
  });
});
