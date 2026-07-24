import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { describe, it, expect } from 'vitest';

import { createProvider } from './provider';
import { createContracts } from './contract';

const TEST_PRIVATE_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

describe('createContracts', () => {
  const provider = createProvider({ rpcUrl: 'https://rpc.example/', chainId: 1439 });
  const signer = new Wallet(TEST_PRIVATE_KEY, provider);

  it('returns typed read and write Contract instances at the address', () => {
    const { read, write } = createContracts({ provider, signer, address: CONTRACT_ADDRESS });
    expect(read).toBeInstanceOf(Contract);
    expect(write).toBeInstanceOf(Contract);
    expect(read.target).toBe(CONTRACT_ADDRESS);
    expect(write.target).toBe(CONTRACT_ADDRESS);
  });

  it('connects the read view to the provider and the write view to the signer', () => {
    const { read, write } = createContracts({ provider, signer, address: CONTRACT_ADDRESS });
    expect(read.runner).toBe(provider);
    expect(read.runner).toBeInstanceOf(JsonRpcProvider);
    expect(write.runner).toBe(signer);
    expect(write.runner).toBeInstanceOf(Wallet);
  });

  it('exposes the ABI methods on both views', () => {
    const { read, write } = createContracts({ provider, signer, address: CONTRACT_ADDRESS });
    expect(typeof read.getRecord).toBe('function');
    expect(typeof write.recordMint).toBe('function');
    expect(typeof write.recordProposalResult).toBe('function');
  });
});
