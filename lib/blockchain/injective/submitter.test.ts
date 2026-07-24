import { describe, it, expect, vi } from 'vitest';

import { AlreadyRecordedError, ChainUnavailableError, NonceError, TerminalError } from '../errors';
import type { Hex32, RecordType, SubmittableRecord } from '../types';

import { createTxSubmitter } from './submitter';

const HASH = ('0x' + 'ab'.repeat(32)) as Hex32;
const TX_HASH = '0x' + 'cd'.repeat(32);

type MockFn = ReturnType<typeof vi.fn>;
type FakeMethod = MockFn & { estimateGas: MockFn; wait: MockFn };

function makeMethod(): FakeMethod {
  const wait = vi.fn();
  const fn = vi.fn(async () => ({ hash: TX_HASH, wait })) as unknown as FakeMethod;
  fn.estimateGas = vi.fn(async () => 21000n);
  fn.wait = wait;
  return fn;
}

function makeWrite(): Record<string, FakeMethod> {
  return {
    recordMint: makeMethod(),
    recordReversal: makeMethod(),
    recordEpochSummary: makeMethod(),
    recordPolicyVersion: makeMethod(),
    recordProposalSnapshot: makeMethod(),
    recordProposalResult: makeMethod(),
  };
}

function record(recordType: RecordType): SubmittableRecord {
  return {
    recordId: `pr_${recordType}`,
    recordType,
    recordHash: HASH,
    chainArgs: [HASH, 5n, 10, HASH],
  };
}

const DISPATCH: ReadonlyArray<readonly [RecordType, string]> = [
  ['token_mint', 'recordMint'],
  ['advance_mint', 'recordMint'],
  ['token_reversal', 'recordReversal'],
  ['epoch_summary', 'recordEpochSummary'],
  ['policy_version', 'recordPolicyVersion'],
  ['proposal_snapshot', 'recordProposalSnapshot'],
  ['proposal_result', 'recordProposalResult'],
];

describe('createTxSubmitter dispatch', () => {
  it.each(DISPATCH)('routes %s to %s and returns a SubmitResult', async (recordType, method) => {
    const write = makeWrite();
    const wallet = { resyncNonce: vi.fn(async () => 0) };
    const submitter = createTxSubmitter({ write, wallet });

    const result = await submitter.submitRecord(record(recordType), 42);

    expect(write[method]).toHaveBeenCalledWith(HASH, 5n, 10, HASH, { nonce: 42 });
    expect(write[method].estimateGas).toHaveBeenCalledWith(HASH, 5n, 10, HASH, { nonce: 42 });
    expect(result.txHash).toBe(TX_HASH);
    expect(result.nonce).toBe(42);
    expect(result.submittedAt).toBeInstanceOf(Date);
  });
});

describe('createTxSubmitter error mapping', () => {
  it('maps RECORD_EXISTS reverts to AlreadyRecordedError and never broadcasts', async () => {
    const write = makeWrite();
    write.recordMint.estimateGas.mockRejectedValueOnce({
      code: 'CALL_EXCEPTION',
      reason: 'RECORD_EXISTS',
      shortMessage: 'execution reverted: RECORD_EXISTS',
    });
    const submitter = createTxSubmitter({ write, wallet: { resyncNonce: vi.fn(async () => 0) } });

    await expect(submitter.submitRecord(record('token_mint'), 1)).rejects.toBeInstanceOf(
      AlreadyRecordedError,
    );
    expect(write.recordMint).not.toHaveBeenCalled();
  });

  it('maps nonce-too-low broadcast failures to NonceError', async () => {
    const write = makeWrite();
    write.recordMint.mockRejectedValueOnce({
      code: 'NONCE_EXPIRED',
      shortMessage: 'nonce has already been used',
      message: 'nonce too low',
    });
    const submitter = createTxSubmitter({ write, wallet: { resyncNonce: vi.fn(async () => 0) } });

    await expect(submitter.submitRecord(record('token_mint'), 1)).rejects.toBeInstanceOf(
      NonceError,
    );
  });

  it('maps network failures to ChainUnavailableError', async () => {
    const write = makeWrite();
    write.recordMint.estimateGas.mockRejectedValueOnce({
      code: 'NETWORK_ERROR',
      message: 'could not detect network',
    });
    const submitter = createTxSubmitter({ write, wallet: { resyncNonce: vi.fn(async () => 0) } });

    await expect(submitter.submitRecord(record('token_mint'), 1)).rejects.toBeInstanceOf(
      ChainUnavailableError,
    );
  });

  it('throws TerminalError when the write contract lacks the mapped method', async () => {
    const submitter = createTxSubmitter({
      write: {},
      wallet: { resyncNonce: vi.fn(async () => 0) },
    });

    await expect(submitter.submitRecord(record('token_mint'), 1)).rejects.toBeInstanceOf(
      TerminalError,
    );
  });

  it('never awaits confirmation (tx.wait is not called)', async () => {
    const write = makeWrite();
    const submitter = createTxSubmitter({ write, wallet: { resyncNonce: vi.fn(async () => 0) } });

    await submitter.submitRecord(record('token_mint'), 7);

    expect(write.recordMint.wait).not.toHaveBeenCalled();
  });
});

describe('createTxSubmitter.resyncNonce', () => {
  it('delegates to the wallet', async () => {
    const write = makeWrite();
    const wallet = { resyncNonce: vi.fn(async () => 99) };
    const submitter = createTxSubmitter({ write, wallet });

    await expect(submitter.resyncNonce()).resolves.toBe(99);
    expect(wallet.resyncNonce).toHaveBeenCalledOnce();
  });
});
