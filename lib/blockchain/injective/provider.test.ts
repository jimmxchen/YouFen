import { JsonRpcProvider } from 'ethers';
import { describe, it, expect } from 'vitest';

import { createProvider, getSharedProvider } from './provider';

const CONFIG_A = { rpcUrl: 'https://rpc-a.example/', chainId: 1439 } as const;
const CONFIG_B = { rpcUrl: 'https://rpc-b.example/', chainId: 1439 } as const;

describe('createProvider', () => {
  it('builds a JsonRpcProvider', () => {
    const provider = createProvider(CONFIG_A);
    expect(provider).toBeInstanceOf(JsonRpcProvider);
  });

  it('builds a distinct instance on every call', () => {
    const first = createProvider(CONFIG_A);
    const second = createProvider(CONFIG_A);
    expect(first).not.toBe(second);
  });
});

describe('getSharedProvider', () => {
  it('reuses a single instance per rpcUrl', () => {
    const first = getSharedProvider(CONFIG_A);
    const second = getSharedProvider(CONFIG_A);
    expect(first).toBe(second);
    expect(first).toBeInstanceOf(JsonRpcProvider);
  });

  it('creates separate instances for different rpcUrls', () => {
    const a = getSharedProvider(CONFIG_A);
    const b = getSharedProvider(CONFIG_B);
    expect(a).not.toBe(b);
  });
});
