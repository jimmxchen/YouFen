// Engine composition root (W4-1). This is the ONE place the six token-economy
// services are wired together; W5 route deps pull their engine services from
// here via getEngineRuntime(). Assembly is a lazy per-process singleton.
//
// Key isolation (BLOCKCHAIN-DESIGN §8): the Web process must NEVER hold the
// recorder private key. This file therefore assembles the PublicRecord service
// key-free — Prisma + a Redis-backed submit queue only — exactly like
// lib/api/public-records/admin-deps.ts. It imports NO wallet/submitter module;
// broadcasting is the worker's job, and the DB is the source of truth.
//
// Environment contract (red-team decision):
//   - DATABASE_URL / RECORD_HASH_PEPPER missing  -> hard-fail with a clear Error.
//   - REDIS_URL missing -> assemble a no-op enqueue (requestSubmission returns
//     { queued: false, jobId: 'noop' }); records stay 'pending' and the
//     reconciler is the fallback. A one-time console.error surfaces the degraded
//     mode. This mirrors the W5-8 seed-script contract: a DB-as-truth design
//     tolerates a missing queue.

import { buildEnvelopeForSource } from '../blockchain/payloads';
import {
  hashMemberId as hashMemberIdWithPepper,
  hashOptionId as hashOptionIdRaw,
} from '../blockchain/hashing/id-hash';
import { createEnqueue } from '../blockchain/queue/enqueue';
import { createQueues, type ConnectionLike } from '../blockchain/queue/queues';
import {
  createPublicRecordService,
  type PrismaLike,
} from '../blockchain/records/record-service';
import type { EnqueueFn } from '../blockchain/types';
import { getPrisma } from '../db/client';

import { createAdvanceService } from './advance-service';
import { createEpochService } from './epoch-service';
import { createMintService } from './mint-service';
import { createPolicyService } from './policy-service';
import { createProposalService } from './proposal-service';
import { createReversalService } from './reversal-service';
import type {
  AdvanceService,
  BuildEnvelopePort,
  EngineDb,
  EngineDeps,
  EpochService,
  Hex32,
  MintService,
  PolicyService,
  ProposalService,
  RecordsPort,
  ReversalService,
} from './types';

/**
 * The assembled engine. W5 route deps read exactly these eight members; the
 * peppered hashers and the pepper-curried envelope builder are assembly-internal
 * seams and are not re-exposed here.
 */
export interface EngineRuntime {
  readonly db: EngineDb;
  readonly records: RecordsPort;
  readonly mint: MintService;
  readonly advance: AdvanceService;
  readonly epoch: EpochService;
  readonly reversal: ReversalService;
  readonly proposal: ProposalService;
  readonly policy: PolicyService;
}

/** Read a required env var, hard-failing with a clear message when absent. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `Engine runtime requires ${name} to be set (${name} is missing or empty)`,
    );
  }
  return value;
}

// One-time degraded-mode warning latch so a Redis-less process logs once, not
// on every assembly. Module-scoped so setEngineRuntimeForTesting(null) rebuilds
// without re-warning within the same process.
let redisWarned = false;

/**
 * Build the record-submission enqueuer. With REDIS_URL present, a real
 * BullMQ-backed enqueue; without it, a no-op that reports the record was not
 * queued so requestSubmission stays honest and the reconciler takes over.
 */
function resolveEnqueue(): EnqueueFn {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl !== undefined && redisUrl.length > 0) {
    const connection = { url: redisUrl } as unknown as ConnectionLike;
    const { submitQueue } = createQueues(connection);
    return createEnqueue({ submitQueue });
  }

  if (!redisWarned) {
    redisWarned = true;
    // server-side diagnostic (console.error allowed): degraded, DB-as-truth mode.
    console.error(
      '[engine-runtime] REDIS_URL not set: records stay pending; the reconciler is the fallback',
    );
  }
  return () => Promise.resolve({ queued: false, jobId: 'noop' });
}

/** Assemble the full engine service graph over a shared Prisma client. */
function assembleRuntime(): EngineRuntime {
  // Fail fast before touching Prisma/Redis so a misconfigured process surfaces
  // the real cause instead of an opaque downstream error.
  requireEnv('DATABASE_URL');
  const pepper = requireEnv('RECORD_HASH_PEPPER');

  const client = getPrisma();
  const db = client as unknown as EngineDb;

  const enqueue = resolveEnqueue();
  const records = createPublicRecordService({
    prisma: client as unknown as PrismaLike,
    enqueue,
  }) as unknown as RecordsPort;

  // Pepper is curried in once at assembly so services never see it: they call a
  // 1-source / 2-arg port and cannot leak or mis-pass the pepper.
  const buildEnvelope: BuildEnvelopePort = (source) =>
    buildEnvelopeForSource(source, pepper);
  const hashMemberId = (communityId: string, memberId: string): Hex32 =>
    hashMemberIdWithPepper(communityId, memberId, pepper);
  const hashOptionId = (proposalId: string, optionId: string): Hex32 =>
    hashOptionIdRaw(proposalId, optionId);

  const base: EngineDeps = { db, records, buildEnvelope };

  const policy = createPolicyService(base);
  const epoch = createEpochService({ ...base, policyActivation: policy });
  const proposal = createProposalService({
    ...base,
    policy,
    hashMemberId,
    hashOptionId,
  });
  const mint = createMintService(base);
  const advance = createAdvanceService(base);
  const reversal = createReversalService(base);

  return { db, records, mint, advance, epoch, reversal, proposal, policy };
}

// Lazy per-process singleton (`cached`) plus a test override (`override`).
let cached: EngineRuntime | null = null;
let override: EngineRuntime | null = null;

/** Resolve the engine runtime, assembling and caching it on first call. */
export async function getEngineRuntime(): Promise<EngineRuntime> {
  if (override !== null) {
    return override;
  }
  if (cached === null) {
    cached = assembleRuntime();
  }
  return cached;
}

/**
 * Test seam: inject a runtime (e.g. a fake graph), or pass null to clear both
 * the override and the cached singleton so the next getEngineRuntime() rebuilds.
 */
export function setEngineRuntimeForTesting(rt: EngineRuntime | null): void {
  override = rt;
  if (rt === null) {
    cached = null;
  }
}
