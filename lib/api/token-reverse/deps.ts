// Real-dependency resolver for POST /api/token/reverse (W5-5). Wires the reversal
// engine from getEngineRuntime(), a Prisma-backed Idempotency-Key store + existing
// reversal lookup, and the default admin policy. Route adapters call
// resolveReverseDeps(); tests inject a fake via setDepsForTesting.

import { getEngineRuntime } from '../../engine/runtime';
import { getPrisma } from '../../db/client';
import {
  createPrismaIdempotencyStore,
  defaultAuthorizeAdmin,
  type PrismaIdempotencyDb,
} from '../core';

import type { ExistingReversal, ReverseDeps } from './handlers';

interface PrismaLike {
  tokenReversalEvent: {
    findFirst(args: unknown): Promise<ExistingReversal | null>;
  };
}

let override: ReverseDeps | null = null;

/** Test seam: inject fake deps (or clear with null). */
export function setDepsForTesting(deps: ReverseDeps | null): void {
  override = deps;
}

/** Resolve the real reverse deps (engine reversal service + Prisma idempotency). */
export async function resolveReverseDeps(): Promise<ReverseDeps> {
  if (override !== null) {
    return override;
  }
  const runtime = await getEngineRuntime();
  const prisma = getPrisma();
  const reader = prisma as unknown as PrismaLike;
  return {
    reversal: runtime.reversal,
    findExistingReversal: (originalMintEventId) =>
      reader.tokenReversalEvent.findFirst({ where: { originalMintEventId } }),
    idempotencyStore: createPrismaIdempotencyStore(
      prisma as unknown as PrismaIdempotencyDb,
    ),
    authorize: defaultAuthorizeAdmin,
  };
}
