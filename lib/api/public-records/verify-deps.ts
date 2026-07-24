// Read-only, key-free dependency resolver for GET /api/public-records/:id/verify
// (BLOCKCHAIN-DESIGN §7). Public live verification is a pure read: it reloads the
// source, rebuilds the hash, and reads the contract for on-chain existence. None
// of that needs the recorder wallet, so this path must NOT build the full
// blockchain runtime — createBlockchainRuntime loads the whole config (forcing
// BLOCKCHAIN_PRIVATE_KEY) and instantiates the recorder wallet in the Web process,
// including an eager resyncNonce RPC. That violates the key isolation the design
// mandates: the recorder key lives only in the worker env, never in the frontend
// ("私钥仅存 worker 环境变量，绝不进前端/仓库", BLOCKCHAIN-DESIGN §8;
// .env.example "Worker env only — never in frontend/repo").
//
// Resolution order mirrors get-deps.ts:
//   1. Test-injected deps (setVerifyDepsForTesting).
//   2. An already-initialised runtime (a worker-embedded host, or a test-injected
//      fake) — reuse its verifier + records.
//   3. Otherwise build a read-only verifier from a provider-bound read contract
//      plus Prisma. No private key, no wallet, no RPC at construction time — safe
//      for a Web-only deployment.

import { Contract } from 'ethers';
import { z } from 'zod';

import { YOUFEN_RECORDS_ABI } from '../../blockchain/abi/youfen-records';
import {
  createTxConfirmer,
  type CreateTxConfirmerDeps,
} from '../../blockchain/injective/confirmer';
import { getSharedProvider } from '../../blockchain/injective/provider';
import {
  createRecordVerifier,
  type VerifierReadContract,
} from '../../blockchain/injective/verifier';
import { buildEnvelopeForSource } from '../../blockchain/payloads';
import {
  createPublicRecordService,
  type PrismaLike,
} from '../../blockchain/records/record-service';
import { getBlockchainRuntime } from '../../blockchain/runtime';

import type { RecordsPort, VerifierPort } from './handlers';

/** The deps resolveVerifyDeps supplies; the route adds the request-scoped limiter. */
export interface VerifyResolvedDeps {
  readonly verifier: VerifierPort;
  readonly records: RecordsPort;
}

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// Key-free subset of the verify config. Mirrors the fields (and defaults) of the
// frozen lib/blockchain/config.ts that verification actually needs, but omits
// BLOCKCHAIN_PRIVATE_KEY / INTERNAL_API_TOKEN / REDIS_URL so a Web-only deployment
// can verify without ever holding the recorder key.
const verifyEnvSchema = z.object({
  INJECTIVE_RPC_URL: z
    .string()
    .url()
    .default('https://k8s.testnet.json-rpc.injective.network/'),
  CHAIN_ID: z.coerce.number().int().default(1439),
  CONTRACT_ADDRESS: z
    .string()
    .regex(HEX_ADDRESS, 'must be a 0x-prefixed 40-hex address'),
  RECORD_HASH_PEPPER: z.string().min(16, 'must be at least 16 characters'),
  CHAIN_CONFIRMATIONS: z.coerce.number().int().min(1).default(2),
  EXPLORER_BASE_URL: z
    .string()
    .url()
    .default('https://testnet-injective.cloud.blockscout.com'),
  CONTRACT_DEPLOY_BLOCK: z.coerce.number().int().min(0).default(0),
});

interface VerifyConfig {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly contractAddress: string;
  readonly pepper: string;
  readonly confirmations: number;
  readonly explorerBaseUrl: string;
  readonly contractDeployBlock: number;
}

/** Parse + validate the key-free verify env, failing fast on any missing field. */
function loadVerifyConfig(
  env: Record<string, string | undefined> = process.env,
): VerifyConfig {
  const result = verifyEnvSchema.safeParse(env);
  if (!result.success) {
    const keys = result.error.issues
      .map((issue) => issue.path.join('.'))
      .filter((key, index, all) => all.indexOf(key) === index)
      .join(', ');
    throw new Error(`Invalid verify configuration for: ${keys}`);
  }

  const parsed = result.data;
  return {
    rpcUrl: parsed.INJECTIVE_RPC_URL,
    chainId: parsed.CHAIN_ID,
    contractAddress: parsed.CONTRACT_ADDRESS,
    pepper: parsed.RECORD_HASH_PEPPER,
    confirmations: parsed.CHAIN_CONFIRMATIONS,
    explorerBaseUrl: parsed.EXPLORER_BASE_URL,
    contractDeployBlock: parsed.CONTRACT_DEPLOY_BLOCK,
  };
}

// Lazily built once per process: constructing a PrismaClient per request would
// exhaust the connection pool on serverless hosts.
let cached: VerifyResolvedDeps | null = null;

/** Test seam: inject verify deps (or clear with null). Mirrors setGetDepsForTesting. */
export function setVerifyDepsForTesting(deps: VerifyResolvedDeps | null): void {
  cached = deps;
}

/**
 * Enqueue stub for the read-only verify path. The verifier only reads; opportunistic
 * reconciliation writes to the DB, never on-chain. If something ever reaches enqueue,
 * failing loudly is correct because the Web layer has no recorder key and must not
 * attempt to broadcast.
 */
const READONLY_ENQUEUE = (): Promise<never> => {
  throw new Error('enqueue is unavailable on the read-only verify path');
};

/** Load the generated Prisma client lazily so offline callers never pull it in. */
async function loadPrisma(): Promise<PrismaLike> {
  const mod = (await import('@prisma/client')) as unknown as {
    PrismaClient: new () => unknown;
  };
  return new mod.PrismaClient() as unknown as PrismaLike;
}

/** Build the key-free verifier + records from a provider-bound read contract. */
async function buildReadOnlyVerifyDeps(): Promise<VerifyResolvedDeps> {
  const config = loadVerifyConfig();
  const provider = getSharedProvider({ rpcUrl: config.rpcUrl, chainId: config.chainId });
  const read = new Contract(config.contractAddress, YOUFEN_RECORDS_ABI, provider);
  const confirmer = createTxConfirmer({
    provider: provider as unknown as CreateTxConfirmerDeps['provider'],
    contractAddress: config.contractAddress,
    deployBlock: config.contractDeployBlock,
    confirmations: config.confirmations,
  });

  const prisma = await loadPrisma();
  const records = createPublicRecordService({ prisma, enqueue: READONLY_ENQUEUE });

  const verifier = createRecordVerifier({
    read: read as unknown as VerifierReadContract,
    confirmer,
    loadRecordWithSource: (id) => records.getWithSource(id),
    buildEnvelope: buildEnvelopeForSource,
    pepper: config.pepper,
    explorerBaseUrl: config.explorerBaseUrl,
  });

  return { verifier, records };
}

/** Resolve the verifier + records handleVerify needs, preferring key-free wiring. */
export async function resolveVerifyDeps(): Promise<VerifyResolvedDeps> {
  if (cached !== null) {
    return cached;
  }

  try {
    const rt = getBlockchainRuntime();
    return { verifier: rt.injective.verifier, records: rt.records };
  } catch {
    cached = await buildReadOnlyVerifyDeps();
    return cached;
  }
}
