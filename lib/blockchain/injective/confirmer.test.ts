import { describe, it, expect, vi, afterEach } from 'vitest';

import { RetryableError, TerminalError } from '../errors';
import type { Hex32 } from '../types';

import { createTxConfirmer } from './confirmer';

const TX_HASH = '0x' + 'cd'.repeat(32);
const BLOCK_HASH = '0x' + 'bb'.repeat(32);
const RECORD_HASH = ('0x' + 'ab'.repeat(32)) as Hex32;
const CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

function fakeProvider() {
  return {
    getTransactionReceipt: vi.fn(),
    getTransaction: vi.fn(),
    getLogs: vi.fn(),
    getBlockNumber: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForConfirmation', () => {
  it('returns confirmed once the confirmation depth is reached', async () => {
    const provider = fakeProvider();
    provider.getTransactionReceipt.mockResolvedValue({
      status: 1,
      blockNumber: 100,
      blockHash: BLOCK_HASH,
    });
    provider.getBlockNumber.mockResolvedValue(101);
    const confirmer = createTxConfirmer({
      provider,
      contractAddress: CONTRACT_ADDRESS,
      deployBlock: 0,
      confirmations: 2,
    });

    const result = await confirmer.waitForConfirmation(TX_HASH);

    expect(result.status).toBe('confirmed');
    expect(result.blockNumber).toBe(100);
    expect(result.blockHash).toBe(BLOCK_HASH);
    expect(result.confirmedAt).toBeInstanceOf(Date);
  });

  it('polls until the confirmation depth is reached', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    provider.getTransactionReceipt.mockResolvedValue({
      status: 1,
      blockNumber: 100,
      blockHash: BLOCK_HASH,
    });
    provider.getBlockNumber.mockResolvedValueOnce(100).mockResolvedValue(101);
    const confirmer = createTxConfirmer({
      provider,
      contractAddress: CONTRACT_ADDRESS,
      deployBlock: 0,
      confirmations: 2,
      pollIntervalMs: 2000,
    });

    const pending = confirmer.waitForConfirmation(TX_HASH);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pending;

    expect(result.status).toBe('confirmed');
  });

  it('returns reverted when the receipt status is 0', async () => {
    const provider = fakeProvider();
    provider.getTransactionReceipt.mockResolvedValue({
      status: 0,
      blockNumber: 200,
      blockHash: BLOCK_HASH,
    });
    const confirmer = createTxConfirmer({
      provider,
      contractAddress: CONTRACT_ADDRESS,
      deployBlock: 0,
      confirmations: 2,
    });

    const result = await confirmer.waitForConfirmation(TX_HASH);

    expect(result.status).toBe('reverted');
    expect(result.blockNumber).toBe(200);
  });

  it('throws a RetryableError CONFIRM_TIMEOUT when the receipt never appears', async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    provider.getTransactionReceipt.mockResolvedValue(null);
    const confirmer = createTxConfirmer({
      provider,
      contractAddress: CONTRACT_ADDRESS,
      deployBlock: 0,
      confirmations: 2,
      pollIntervalMs: 2000,
    });

    const pending = confirmer.waitForConfirmation(TX_HASH);
    const assertion = expect(pending).rejects.toThrowError(RetryableError);
    await vi.advanceTimersByTimeAsync(130000);
    await assertion;
    await expect(pending.catch((e) => (e as Error).message)).resolves.toBe('CONFIRM_TIMEOUT');
  });
});

describe('getTransactionStatus', () => {
  const confirmer = createTxConfirmer({
    provider: fakeProvider(),
    contractAddress: CONTRACT_ADDRESS,
    deployBlock: 0,
    confirmations: 2,
  });

  it('classifies confirmed / reverted / pending / not_found', async () => {
    const provider = fakeProvider();
    const c = createTxConfirmer({
      provider,
      contractAddress: CONTRACT_ADDRESS,
      deployBlock: 0,
      confirmations: 2,
    });

    provider.getTransactionReceipt.mockResolvedValueOnce({ status: 1 });
    expect(await c.getTransactionStatus(TX_HASH)).toBe('confirmed');

    provider.getTransactionReceipt.mockResolvedValueOnce({ status: 0 });
    expect(await c.getTransactionStatus(TX_HASH)).toBe('reverted');

    provider.getTransactionReceipt.mockResolvedValueOnce(null);
    provider.getTransaction.mockResolvedValueOnce({ hash: TX_HASH });
    expect(await c.getTransactionStatus(TX_HASH)).toBe('pending');

    provider.getTransactionReceipt.mockResolvedValueOnce(null);
    provider.getTransaction.mockResolvedValueOnce(null);
    expect(await c.getTransactionStatus(TX_HASH)).toBe('not_found');

    expect(confirmer).toBeDefined();
  });
});

describe('findTxByRecordHash', () => {
  it('finds a recent record in the newest segment with a single getLogs call', async () => {
    const provider = fakeProvider();
    provider.getBlockNumber.mockResolvedValue(100);
    provider.getLogs.mockResolvedValue([{ transactionHash: TX_HASH, blockNumber: 90 }]);
    const confirmer = createTxConfirmer({
      provider,
      contractAddress: CONTRACT_ADDRESS,
      deployBlock: 1,
      confirmations: 2,
      maxRangePerQuery: 9000,
    });

    const found = await confirmer.findTxByRecordHash(RECORD_HASH);

    expect(found).toEqual({ txHash: TX_HASH, blockNumber: 90 });
    expect(provider.getLogs).toHaveBeenCalledTimes(1);
    expect(provider.getLogs).toHaveBeenCalledWith({
      address: CONTRACT_ADDRESS,
      fromBlock: 1,
      toBlock: 100,
      topics: [null, null, null, RECORD_HASH],
    });
  });

  it('scans newest-first and only walks back when the record is in an old segment', async () => {
    const provider = fakeProvider();
    provider.getBlockNumber.mockResolvedValue(20000);
    provider.getLogs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ transactionHash: TX_HASH, blockNumber: 500 }]);
    const confirmer = createTxConfirmer({
      provider,
      contractAddress: CONTRACT_ADDRESS,
      deployBlock: 1,
      confirmations: 2,
      maxRangePerQuery: 9000,
    });

    const found = await confirmer.findTxByRecordHash(RECORD_HASH);

    expect(found).toEqual({ txHash: TX_HASH, blockNumber: 500 });
    expect(provider.getLogs).toHaveBeenCalledTimes(3);
    // First query covers the newest window (records almost always land here).
    expect(provider.getLogs).toHaveBeenNthCalledWith(1, {
      address: CONTRACT_ADDRESS,
      fromBlock: 11001,
      toBlock: 20000,
      topics: [null, null, null, RECORD_HASH],
    });
    // Last query is clamped to the configured deploy block, never genesis.
    expect(provider.getLogs).toHaveBeenNthCalledWith(3, {
      address: CONTRACT_ADDRESS,
      fromBlock: 1,
      toBlock: 2000,
      topics: [null, null, null, RECORD_HASH],
    });
  });

  it('returns null when no segment down to the deploy block contains the recordHash', async () => {
    const provider = fakeProvider();
    provider.getBlockNumber.mockResolvedValue(20000);
    provider.getLogs.mockResolvedValue([]);
    const confirmer = createTxConfirmer({
      provider,
      contractAddress: CONTRACT_ADDRESS,
      deployBlock: 1,
      confirmations: 2,
      maxRangePerQuery: 9000,
    });

    const found = await confirmer.findTxByRecordHash(RECORD_HASH);

    expect(found).toBeNull();
    expect(provider.getLogs).toHaveBeenCalledTimes(3);
  });

  it('throws TerminalError instead of scanning from genesis when deployBlock is unset', async () => {
    const provider = fakeProvider();
    const confirmer = createTxConfirmer({
      provider,
      contractAddress: CONTRACT_ADDRESS,
      deployBlock: 0,
      confirmations: 2,
      maxRangePerQuery: 9000,
    });

    await expect(confirmer.findTxByRecordHash(RECORD_HASH)).rejects.toThrowError(TerminalError);
    expect(provider.getBlockNumber).not.toHaveBeenCalled();
    expect(provider.getLogs).not.toHaveBeenCalled();
  });
});
