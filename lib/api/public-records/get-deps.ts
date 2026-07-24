// Read-only dependency resolver for GET /api/public-records/:id (BLOCKCHAIN-DESIGN
// §7). The public detail endpoint is a pure DB read: it needs only
// PublicRecordService.getById plus the explorer base URL for tx links. It must
// NOT build the full blockchain runtime, because createBlockchainRuntime loads
// the whole config (forcing BLOCKCHAIN_PRIVATE_KEY) and instantiates the recorder
// wallet — including an eager resyncNonce RPC — inside the Web process. That
// violates the key isolation the design mandates: the recorder key lives only in
// the worker env, never in the frontend ("私钥仅存 worker 环境变量，绝不进前端/仓库",
// BLOCKCHAIN-DESIGN §8; .env.example "Worker env only — never in frontend/repo").
//
// Resolution order:
//   1. An already-initialised runtime (a worker-embedded host, or a test-injected
//      fake) — reuse its records + explorerBaseUrl.
//   2. Otherwise build a read-only, key-free service from Prisma + env. No private
//      key, no wallet, no RPC — safe for a Web-only deployment.

import { getBlockchainRuntime } from '../../blockchain/runtime';
import {
  createPublicRecordService,
  type PrismaLike,
} from '../../blockchain/records/record-service';

import type { GetDeps } from './handlers';

// Mirror the EXPLORER_BASE_URL default in lib/blockchain/config.ts so the public
// read path renders identical explorer links without loading the full config.
const DEFAULT_EXPLORER_BASE_URL = 'https://testnet-injective.cloud.blockscout.com';

// Lazily built once per process: constructing a PrismaClient per request would
// exhaust the connection pool on serverless hosts.
let cached: GetDeps | null = null;

/** Test seam: inject read-only deps (or clear with null). Mirrors the runtime seam. */
export function setGetDepsForTesting(deps: GetDeps | null): void {
  cached = deps;
}

/**
 * Enqueue stub for the read-only public path. The GET handler only ever calls
 * getById, so this must never fire; if it does, failing loudly is correct because
 * the Web layer has no recorder key and must not attempt to write on-chain.
 */
const READONLY_ENQUEUE = (): Promise<never> => {
  throw new Error('enqueue is unavailable on the read-only public records path');
};

/** Load the generated Prisma client lazily so offline callers never pull it in. */
async function loadPrisma(): Promise<PrismaLike> {
  const mod = (await import('@prisma/client')) as unknown as {
    PrismaClient: new () => unknown;
  };
  return new mod.PrismaClient() as unknown as PrismaLike;
}

/** Resolve the dependencies handleGet needs, preferring key-free read-only wiring. */
export async function resolveGetDeps(): Promise<GetDeps> {
  if (cached !== null) {
    return cached;
  }

  try {
    const rt = getBlockchainRuntime();
    return { records: rt.records, explorerBaseUrl: rt.config.explorerBaseUrl };
  } catch {
    const prisma = await loadPrisma();
    cached = {
      records: createPublicRecordService({ prisma, enqueue: READONLY_ENQUEUE }),
      explorerBaseUrl: process.env.EXPLORER_BASE_URL ?? DEFAULT_EXPLORER_BASE_URL,
    };
    return cached;
  }
}
