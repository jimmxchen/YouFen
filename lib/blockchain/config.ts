// Blockchain env loading with fail-fast validation. Never reads env at module
// top level — reads happen only inside loadBlockchainConfig (default arg).

import { z } from 'zod';

import type { BlockchainConfig } from './types';

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

const schema = z.object({
  INJECTIVE_RPC_URL: z
    .string()
    .url()
    .default('https://k8s.testnet.json-rpc.injective.network/'),
  CHAIN_ID: z.coerce.number().int().default(1439),
  CONTRACT_ADDRESS: z
    .string()
    .regex(HEX_ADDRESS, 'must be a 0x-prefixed 40-hex address'),
  BLOCKCHAIN_PRIVATE_KEY: z
    .string()
    .regex(HEX_PRIVATE_KEY, 'must be a 0x-prefixed 64-hex private key'),
  RECORD_HASH_PEPPER: z.string().min(16, 'must be at least 16 characters'),
  CHAIN_CONFIRMATIONS: z.coerce.number().int().min(1).default(2),
  EXPLORER_BASE_URL: z
    .string()
    .url()
    .default('https://testnet-injective.cloud.blockscout.com'),
  CONTRACT_DEPLOY_BLOCK: z.coerce.number().int().min(0).default(0),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  INTERNAL_API_TOKEN: z.string().min(16, 'must be at least 16 characters'),
});

/**
 * Parse + validate blockchain env. Throws an Error listing every offending key
 * when any required value is missing or malformed (fail-fast on startup).
 */
export function loadBlockchainConfig(
  env: Record<string, string | undefined> = process.env,
): BlockchainConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    const keys = result.error.issues
      .map((issue) => issue.path.join('.'))
      .filter((key, index, all) => all.indexOf(key) === index)
      .join(', ');
    throw new Error(`Invalid blockchain configuration for: ${keys}`);
  }

  const parsed = result.data;
  return {
    rpcUrl: parsed.INJECTIVE_RPC_URL,
    chainId: parsed.CHAIN_ID,
    contractAddress: parsed.CONTRACT_ADDRESS,
    privateKey: parsed.BLOCKCHAIN_PRIVATE_KEY,
    pepper: parsed.RECORD_HASH_PEPPER,
    confirmations: parsed.CHAIN_CONFIRMATIONS,
    explorerBaseUrl: parsed.EXPLORER_BASE_URL,
    contractDeployBlock: parsed.CONTRACT_DEPLOY_BLOCK,
    redisUrl: parsed.REDIS_URL,
    internalApiToken: parsed.INTERNAL_API_TOKEN,
  };
}
