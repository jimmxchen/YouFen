import { Wallet } from 'ethers';
import { describe, it, expect, vi } from 'vitest';

import { NonceError } from '../errors';

import { createServerWallet } from './wallet';

// Hardhat account #1 private key — deterministic, never funded.
const TEST_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const TEST_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

type CountFn = (address: string, blockTag?: string) => Promise<number>;

/** Drain all pending microtasks (and any queued 0ms timers). */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeProvider(getTransactionCount: CountFn): {
  getTransactionCount: ReturnType<typeof vi.fn>;
} {
  return { getTransactionCount: vi.fn(getTransactionCount) };
}

describe('createServerWallet', () => {
  it('exposes the signer address and a real ethers Wallet', async () => {
    const provider = fakeProvider(async () => 0);
    const wallet = createServerWallet({ provider, privateKey: TEST_PRIVATE_KEY });
    expect(wallet.signer).toBeInstanceOf(Wallet);
    expect(wallet.address).toBe(TEST_ADDRESS);
  });

  it('initialises localNonce from getTransactionCount(address, "pending")', async () => {
    const provider = fakeProvider(async () => 5);
    const wallet = createServerWallet({ provider, privateKey: TEST_PRIVATE_KEY });
    const resynced = await wallet.resyncNonce();
    expect(resynced).toBe(5);
    expect(wallet.started()).toBe(true);
    expect(wallet.peekNonce()).toBe(5);
    expect(provider.getTransactionCount).toHaveBeenCalledWith(TEST_ADDRESS, 'pending');
  });

  it('returns the current nonce and monotonically increments', async () => {
    const provider = fakeProvider(async () => 5);
    const wallet = createServerWallet({ provider, privateKey: TEST_PRIVATE_KEY });
    await wallet.resyncNonce();
    expect(wallet.getNextNonce()).toBe(5);
    expect(wallet.getNextNonce()).toBe(6);
    expect(wallet.peekNonce()).toBe(7);
  });

  it('converges back to the chain count after drift on resync', async () => {
    let onChain = 5;
    const provider = fakeProvider(async () => onChain);
    const wallet = createServerWallet({ provider, privateKey: TEST_PRIVATE_KEY });
    await wallet.resyncNonce();
    // Drift the local counter forward past the chain view.
    wallet.getNextNonce();
    wallet.getNextNonce();
    wallet.getNextNonce();
    expect(wallet.peekNonce()).toBe(8);
    // Chain got reorged / wallet restarted: resync must collapse local drift.
    onChain = 3;
    const resynced = await wallet.resyncNonce();
    expect(resynced).toBe(3);
    expect(wallet.peekNonce()).toBe(3);
    expect(wallet.getNextNonce()).toBe(3);
  });

  it('throws NonceError when reading a nonce before initialisation', () => {
    // getTransactionCount never resolves -> localNonce stays uninitialised.
    const provider = { getTransactionCount: vi.fn(() => new Promise<number>(() => {})) };
    const wallet = createServerWallet({ provider, privateKey: TEST_PRIVATE_KEY });
    expect(wallet.started()).toBe(false);
    expect(() => wallet.getNextNonce()).toThrow(NonceError);
    expect(() => wallet.peekNonce()).toThrow(NonceError);
  });

  it('self-heals after a failed startup resync when getNextNonce is called', async () => {
    // Startup RPC blip: the eager resync rejects once, then the RPC recovers.
    let call = 0;
    const provider = {
      getTransactionCount: vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error('RPC down at startup');
        return 5;
      }),
    };
    const wallet = createServerWallet({ provider, privateKey: TEST_PRIVATE_KEY });
    await flush();
    expect(wallet.started()).toBe(false);
    // First submit attempt: getNextNonce still throws but kicks a background
    // reseed so the wallet can recover without a manual process restart.
    expect(() => wallet.getNextNonce()).toThrow(NonceError);
    await flush();
    // The background reseed (call 2) succeeded: the wallet is now usable.
    expect(wallet.started()).toBe(true);
    expect(wallet.getNextNonce()).toBe(5);
    expect(provider.getTransactionCount).toHaveBeenCalledTimes(2);
  });

  it('does not spawn a resync storm while uninitialised', async () => {
    // The RPC stays down: every getNextNonce reschedules a reseed, but only one
    // reseed may be in flight at a time (single-flight guard).
    const provider = {
      getTransactionCount: vi.fn(() => new Promise<number>(() => {})),
    };
    const wallet = createServerWallet({ provider, privateKey: TEST_PRIVATE_KEY });
    await flush();
    expect(() => wallet.getNextNonce()).toThrow(NonceError);
    expect(() => wallet.getNextNonce()).toThrow(NonceError);
    expect(() => wallet.getNextNonce()).toThrow(NonceError);
    // Eager seed + first uninitialised call started one in-flight resync; the
    // later calls coalesce onto it rather than fanning out.
    expect(provider.getTransactionCount).toHaveBeenCalledTimes(1);
  });

  it('a stale in-flight resync never clobbers a newer applied nonce', async () => {
    // First call = eager startup resync (slow, resolves LAST with a stale count);
    // second call = explicit resync that wins and is then consumed.
    const eager = createDeferred<number>();
    let call = 0;
    const provider = {
      getTransactionCount: vi.fn(async () => {
        call += 1;
        if (call === 1) return eager.promise;
        return 7;
      }),
    };
    const wallet = createServerWallet({ provider, privateKey: TEST_PRIVATE_KEY });
    // Explicit resync sees chain pending = 7 and applies it.
    const explicit = await wallet.resyncNonce();
    expect(explicit).toBe(7);
    // Broadcast two txs: local advances to 9.
    expect(wallet.getNextNonce()).toBe(7);
    expect(wallet.getNextNonce()).toBe(8);
    expect(wallet.peekNonce()).toBe(9);
    // The slow eager resync finally resolves with the now-stale count 7.
    eager.resolve(7);
    await flush();
    // It must NOT roll local back to 7 (that would reuse nonce 7 and 8).
    expect(wallet.peekNonce()).toBe(9);
    expect(wallet.getNextNonce()).toBe(9);
  });
});
