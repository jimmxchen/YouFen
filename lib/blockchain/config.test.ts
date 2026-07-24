import { describe, it, expect } from 'vitest';

import { loadBlockchainConfig } from './config';

const VALID_ADDRESS = '0x' + 'a'.repeat(40);
const VALID_KEY = '0x' + 'b'.repeat(64);
const VALID_PEPPER = 'pepper-1234567890';
const VALID_TOKEN = 'internal-token-1234';

function fullEnv(): Record<string, string | undefined> {
  return {
    INJECTIVE_RPC_URL: 'https://rpc.example.com/',
    CHAIN_ID: '1439',
    CONTRACT_ADDRESS: VALID_ADDRESS,
    BLOCKCHAIN_PRIVATE_KEY: VALID_KEY,
    RECORD_HASH_PEPPER: VALID_PEPPER,
    CHAIN_CONFIRMATIONS: '3',
    EXPLORER_BASE_URL: 'https://explorer.example.com',
    CONTRACT_DEPLOY_BLOCK: '42',
    REDIS_URL: 'redis://localhost:6380',
    INTERNAL_API_TOKEN: VALID_TOKEN,
  };
}

/** Only the required keys; optionals omitted so defaults must fill in. */
function minimalEnv(): Record<string, string | undefined> {
  return {
    CONTRACT_ADDRESS: VALID_ADDRESS,
    BLOCKCHAIN_PRIVATE_KEY: VALID_KEY,
    RECORD_HASH_PEPPER: VALID_PEPPER,
    INTERNAL_API_TOKEN: VALID_TOKEN,
  };
}

describe('loadBlockchainConfig', () => {
  it('parses a fully specified env into the config shape', () => {
    const config = loadBlockchainConfig(fullEnv());
    expect(config).toEqual({
      rpcUrl: 'https://rpc.example.com/',
      chainId: 1439,
      contractAddress: VALID_ADDRESS,
      privateKey: VALID_KEY,
      pepper: VALID_PEPPER,
      confirmations: 3,
      explorerBaseUrl: 'https://explorer.example.com',
      contractDeployBlock: 42,
      redisUrl: 'redis://localhost:6380',
      internalApiToken: VALID_TOKEN,
    });
  });

  it('applies documented defaults when optionals are omitted', () => {
    const config = loadBlockchainConfig(minimalEnv());
    expect(config.rpcUrl).toBe('https://k8s.testnet.json-rpc.injective.network/');
    expect(config.chainId).toBe(1439);
    expect(config.confirmations).toBe(2);
    expect(config.explorerBaseUrl).toBe('https://testnet-injective.cloud.blockscout.com');
    expect(config.contractDeployBlock).toBe(0);
    expect(config.redisUrl).toBe('redis://localhost:6379');
  });

  it('coerces numeric env strings to numbers', () => {
    const config = loadBlockchainConfig(fullEnv());
    expect(typeof config.chainId).toBe('number');
    expect(typeof config.confirmations).toBe('number');
    expect(typeof config.contractDeployBlock).toBe('number');
  });

  it('throws listing every missing required key when env is empty', () => {
    let caught: unknown;
    try {
      loadBlockchainConfig({});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain('CONTRACT_ADDRESS');
    expect(message).toContain('BLOCKCHAIN_PRIVATE_KEY');
    expect(message).toContain('RECORD_HASH_PEPPER');
    expect(message).toContain('INTERNAL_API_TOKEN');
  });

  it('throws when a single required key (CONTRACT_ADDRESS) is missing', () => {
    const env = minimalEnv();
    delete env.CONTRACT_ADDRESS;
    expect(() => loadBlockchainConfig(env)).toThrow(/CONTRACT_ADDRESS/);
  });

  it('rejects a malformed CONTRACT_ADDRESS', () => {
    const env = { ...minimalEnv(), CONTRACT_ADDRESS: '0x1234' };
    expect(() => loadBlockchainConfig(env)).toThrow(/CONTRACT_ADDRESS/);
  });

  it('rejects a malformed BLOCKCHAIN_PRIVATE_KEY', () => {
    const env = { ...minimalEnv(), BLOCKCHAIN_PRIVATE_KEY: 'not-a-key' };
    expect(() => loadBlockchainConfig(env)).toThrow(/BLOCKCHAIN_PRIVATE_KEY/);
  });

  it('rejects a too-short RECORD_HASH_PEPPER', () => {
    const env = { ...minimalEnv(), RECORD_HASH_PEPPER: 'short' };
    expect(() => loadBlockchainConfig(env)).toThrow(/RECORD_HASH_PEPPER/);
  });

  it('rejects a malformed INJECTIVE_RPC_URL', () => {
    const env = { ...minimalEnv(), INJECTIVE_RPC_URL: 'not a url' };
    expect(() => loadBlockchainConfig(env)).toThrow(/INJECTIVE_RPC_URL/);
  });

  it('rejects CHAIN_CONFIRMATIONS below 1', () => {
    const env = { ...minimalEnv(), CHAIN_CONFIRMATIONS: '0' };
    expect(() => loadBlockchainConfig(env)).toThrow(/CHAIN_CONFIRMATIONS/);
  });

  it('fails fast when INTERNAL_API_TOKEN is missing', () => {
    const env = minimalEnv();
    delete env.INTERNAL_API_TOKEN;
    expect(() => loadBlockchainConfig(env)).toThrow(/INTERNAL_API_TOKEN/);
  });

  it('fails fast when INTERNAL_API_TOKEN is too short', () => {
    const env = { ...minimalEnv(), INTERNAL_API_TOKEN: 'tiny' };
    expect(() => loadBlockchainConfig(env)).toThrow(/INTERNAL_API_TOKEN/);
  });
});
