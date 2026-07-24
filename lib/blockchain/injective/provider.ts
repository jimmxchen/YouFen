// JsonRpcProvider factory for Injective (BLOCKCHAIN-DESIGN §1). A static network
// is declared up front so the provider never issues an eth_chainId detection
// round-trip; construction is inert and safe to run offline in tests.

import { JsonRpcProvider } from 'ethers';

import type { BlockchainConfig } from '../types';

/** Only the fields a provider needs; structurally compatible with BlockchainConfig. */
export type ProviderConfig = Pick<BlockchainConfig, 'rpcUrl' | 'chainId'>;

/** Build a fresh JsonRpcProvider pinned to a static Injective network. */
export function createProvider(config: ProviderConfig): JsonRpcProvider {
  return new JsonRpcProvider(
    config.rpcUrl,
    { chainId: config.chainId, name: 'injective-testnet' },
    { staticNetwork: true },
  );
}

const sharedProviders = new Map<string, JsonRpcProvider>();

/** Return a process-wide singleton provider, keyed by rpcUrl. */
export function getSharedProvider(config: ProviderConfig): JsonRpcProvider {
  const cached = sharedProviders.get(config.rpcUrl);
  if (cached) {
    return cached;
  }
  const provider = createProvider(config);
  sharedProviders.set(config.rpcUrl, provider);
  return provider;
}
