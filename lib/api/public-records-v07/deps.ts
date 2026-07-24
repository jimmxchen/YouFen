// Dependency resolver for the v0.7 PUBLIC-RECORDS verification endpoint group
// (payload / proof / verify-v07). These endpoints are PUBLIC and read-only, so —
// exactly like the v0.6 verify path (lib/api/public-records/verify-deps.ts) — the
// deployment MUST be able to serve them WITHOUT the recorder private key. Forcing
// BLOCKCHAIN_PRIVATE_KEY into the Web process (as getGovernanceRuntime does, since
// it builds a relayer Wallet) would break the key isolation the design mandates
// ("私钥仅存 worker 环境变量", BLOCKCHAIN-DESIGN §8; .env.example "Worker env only").
//
// Resolution order (mirrors resolveVerifyDeps):
//   1. Test-injected deps (setPublicRecordsV07DepsForTesting).
//   2. An already-initialised governance runtime (worker-embedded host, or a
//      test-injected fake via setGovernanceRuntimeForTesting) — reuse its
//      key-free reader + contract address.
//   3. Otherwise build a key-free read path: a provider-bound read Contract whose
//      only method the handlers call is recordExists. No wallet, no private key.

import { Contract, JsonRpcProvider } from 'ethers';
import { z } from 'zod';

import { YOUFEN_GOVERNANCE_ABI } from '../../blockchain/abi/youfen-governance';
import { getGovernanceRuntime } from '../../blockchain/relay/governance-runtime';
import { getPrisma } from '../../db/client';

import type { PublicRecordsV07Deps, RecordExistsReader } from './handlers';

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// Key-free subset of the blockchain env. Omits BLOCKCHAIN_PRIVATE_KEY /
// INTERNAL_API_TOKEN / REDIS_URL so a Web-only deployment can verify without ever
// holding the recorder key. Defaults mirror lib/blockchain/config.ts.
const envSchema = z.object({
  INJECTIVE_RPC_URL: z
    .string()
    .url()
    .default('https://k8s.testnet.json-rpc.injective.network/'),
  CHAIN_ID: z.coerce.number().int().default(1439),
  CONTRACT_ADDRESS: z.string().regex(HEX_ADDRESS, 'must be a 0x-prefixed 40-hex address'),
  EXPLORER_BASE_URL: z
    .string()
    .url()
    .default('https://testnet-injective.cloud.blockscout.com'),
});

let cached: PublicRecordsV07Deps | null = null;

/** Test seam: inject deps (fake reader), or null to clear. */
export function setPublicRecordsV07DepsForTesting(deps: PublicRecordsV07Deps | null): void {
  cached = deps;
}

/** A key-free reader that only exposes recordExists (no wallet, no signing). */
function buildKeyFreeReader(
  contractAddress: string,
  rpcUrl: string,
  chainId: number,
): RecordExistsReader {
  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const contract = new Contract(contractAddress, YOUFEN_GOVERNANCE_ABI, provider);
  return {
    async recordExists(recordHash: string): Promise<boolean> {
      return Boolean(await contract.recordExists(recordHash));
    },
  };
}

/** Parse + validate the key-free env, failing fast on a missing contract address. */
function loadKeyFreeConfig(
  env: Record<string, string | undefined> = process.env,
): { contractAddress: string; rpcUrl: string; chainId: number; explorerBaseUrl: string } {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const keys = result.error.issues
      .map((issue) => issue.path.join('.'))
      .filter((key, index, all) => all.indexOf(key) === index)
      .join(', ');
    throw new Error(`Invalid public-records-v07 configuration for: ${keys}`);
  }
  return {
    contractAddress: result.data.CONTRACT_ADDRESS,
    rpcUrl: result.data.INJECTIVE_RPC_URL,
    chainId: result.data.CHAIN_ID,
    explorerBaseUrl: result.data.EXPLORER_BASE_URL,
  };
}

/**
 * Resolve the deps the public verification handlers need, preferring key-free
 * wiring. explorerBaseUrl is always read from env (the runtime does not carry it).
 */
export function resolvePublicRecordsV07Deps(): PublicRecordsV07Deps {
  if (cached !== null) return cached;

  const explorerBaseUrl =
    process.env.EXPLORER_BASE_URL ?? 'https://testnet-injective.cloud.blockscout.com';

  // Reuse an already-initialised (or test-injected) governance runtime when
  // present, so a combined worker+web host shares one provider. In a Web-only
  // deployment without the key this throws and we fall back to key-free wiring.
  try {
    const runtime = getGovernanceRuntime();
    cached = {
      prisma: getPrisma(),
      reader: runtime.reader,
      contractAddress: runtime.contractAddress,
      explorerBaseUrl,
    };
    return cached;
  } catch {
    const config = loadKeyFreeConfig();
    cached = {
      prisma: getPrisma(),
      reader: buildKeyFreeReader(config.contractAddress, config.rpcUrl, config.chainId),
      contractAddress: config.contractAddress,
      explorerBaseUrl: config.explorerBaseUrl,
    };
    return cached;
  }
}
