// Key-free dependency resolver for the admin write endpoints
// POST /api/public-records/:id/submit and /retry (BLOCKCHAIN-DESIGN §7).
//
// Enqueueing a pending record for submission maps to
// PublicRecordService.requestSubmission -> enqueue (a Redis job); retry adds a
// DB-only status transition on top. Neither path signs or broadcasts, so neither
// needs the recorder wallet. Building the full blockchain runtime here would load
// the whole config (forcing BLOCKCHAIN_PRIVATE_KEY) and instantiate the recorder
// wallet — including an eager resyncNonce RPC — inside the Web process. That
// violates the key isolation the design mandates: the recorder key lives only in
// the worker env, never in the frontend ("私钥仅存 worker 环境变量，绝不进前端/仓库",
// BLOCKCHAIN-DESIGN §8; .env.example "Worker env only — never in frontend/repo").
// INTERNAL_API_TOKEN, by contrast, is a legitimate Web-layer secret: it is the
// admin bearer the endpoint authenticates against, so it belongs in the Web env.
//
// Resolution order mirrors get-deps.ts / verify-deps.ts:
//   1. Test-injected deps (setAdminDepsForTesting).
//   2. An already-initialised runtime (a worker-embedded host, or a test-injected
//      fake) — reuse its records + internal token.
//   3. Otherwise build a key-free admin path from Prisma + a Redis-backed submit
//      queue + the internal token. No private key, no wallet, no RPC at
//      construction time — safe for a Web-only deployment.

import { z } from 'zod';

import { createEnqueue } from '../../blockchain/queue/enqueue';
import { createQueues, type ConnectionLike } from '../../blockchain/queue/queues';
import {
  createPublicRecordService,
  type PrismaLike,
} from '../../blockchain/records/record-service';
import { getBlockchainRuntime } from '../../blockchain/runtime';

import type { RecordsPort } from './handlers';

/** The deps the admin write handlers (submit/retry) need. */
export interface AdminResolvedDeps {
  readonly records: RecordsPort;
  readonly internalApiToken: string;
}

// Key-free subset of the admin config. Mirrors the fields (and defaults) of the
// frozen lib/blockchain/config.ts that the enqueue path actually needs, but omits
// BLOCKCHAIN_PRIVATE_KEY / RPC / contract / pepper so a Web-only deployment can
// enqueue admin submissions without ever holding the recorder key.
const adminEnvSchema = z.object({
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  INTERNAL_API_TOKEN: z.string().min(16, 'must be at least 16 characters'),
});

interface AdminConfig {
  readonly redisUrl: string;
  readonly internalApiToken: string;
}

/** Parse + validate the key-free admin env, failing fast on any missing field. */
function loadAdminConfig(
  env: Record<string, string | undefined> = process.env,
): AdminConfig {
  const result = adminEnvSchema.safeParse(env);
  if (!result.success) {
    const keys = result.error.issues
      .map((issue) => issue.path.join('.'))
      .filter((key, index, all) => all.indexOf(key) === index)
      .join(', ');
    throw new Error(`Invalid admin configuration for: ${keys}`);
  }

  return {
    redisUrl: result.data.REDIS_URL,
    internalApiToken: result.data.INTERNAL_API_TOKEN,
  };
}

// Lazily built once per process: constructing a PrismaClient (and BullMQ queue)
// per request would exhaust the connection pool on serverless hosts.
let cached: AdminResolvedDeps | null = null;

/** Test seam: inject admin deps (or clear with null). Mirrors setVerifyDepsForTesting. */
export function setAdminDepsForTesting(deps: AdminResolvedDeps | null): void {
  cached = deps;
}

/** Load the generated Prisma client lazily so offline callers never pull it in. */
async function loadPrisma(): Promise<PrismaLike> {
  const mod = (await import('@prisma/client')) as unknown as {
    PrismaClient: new () => unknown;
  };
  return new mod.PrismaClient() as unknown as PrismaLike;
}

/**
 * Build the key-free admin deps: DB record service bound to a Redis-backed submit
 * queue, plus the internal admin token. Config is validated first so a missing
 * token fails fast before any Prisma client or queue is constructed.
 */
async function buildKeyFreeAdminDeps(): Promise<AdminResolvedDeps> {
  const config = loadAdminConfig();
  const connection = { url: config.redisUrl } as unknown as ConnectionLike;
  const { submitQueue } = createQueues(connection);
  const enqueue = createEnqueue({ submitQueue });

  const prisma = await loadPrisma();
  const records = createPublicRecordService({ prisma, enqueue });

  return { records, internalApiToken: config.internalApiToken };
}

/** Resolve the deps the admin write handlers need, preferring key-free wiring. */
export async function resolveAdminDeps(): Promise<AdminResolvedDeps> {
  if (cached !== null) {
    return cached;
  }

  try {
    const rt = getBlockchainRuntime();
    return { records: rt.records, internalApiToken: rt.config.internalApiToken };
  } catch {
    cached = await buildKeyFreeAdminDeps();
    return cached;
  }
}
