import { describe, it, expect, afterEach } from 'vitest';

import {
  getBlockchainRuntime,
  initBlockchainRuntime,
  setBlockchainRuntimeForTesting,
} from './runtime';
import type { BlockchainRuntime } from './types';

// A minimal opaque stand-in; the runtime module never inspects its shape.
const fakeRuntime = { config: {} } as unknown as BlockchainRuntime;

afterEach(() => {
  setBlockchainRuntimeForTesting(null);
});

describe('blockchain runtime stub', () => {
  it('throws NOT_INITIALIZED before anything is set', () => {
    expect(() => getBlockchainRuntime()).toThrow('BLOCKCHAIN_RUNTIME_NOT_INITIALIZED');
  });

  it('returns the injected runtime after setBlockchainRuntimeForTesting', () => {
    setBlockchainRuntimeForTesting(fakeRuntime);
    expect(getBlockchainRuntime()).toBe(fakeRuntime);
  });

  it('clears the runtime when set back to null', () => {
    setBlockchainRuntimeForTesting(fakeRuntime);
    setBlockchainRuntimeForTesting(null);
    expect(() => getBlockchainRuntime()).toThrow('BLOCKCHAIN_RUNTIME_NOT_INITIALIZED');
  });

  it('initBlockchainRuntime is idempotent: returns the existing singleton', async () => {
    setBlockchainRuntimeForTesting(fakeRuntime);
    await expect(initBlockchainRuntime()).resolves.toBe(fakeRuntime);
  });

  it('delegates to real assembly when unset (the NOT_WIRED stub is gone)', async () => {
    // An empty env makes loadBlockchainConfig fail fast, before any provider or
    // queue is constructed — proving initBlockchainRuntime now attempts the real
    // createBlockchainRuntime assembly instead of throwing the old stub message.
    await expect(initBlockchainRuntime({ env: {} })).rejects.toThrow(
      /Invalid blockchain configuration/,
    );
  });

  it('an injected runtime wins over auto-assembly even when opts are supplied', async () => {
    setBlockchainRuntimeForTesting(fakeRuntime);
    // Would fail config validation if assembly ran; injection short-circuits it.
    await expect(initBlockchainRuntime({ env: {} })).resolves.toBe(fakeRuntime);
  });
});
