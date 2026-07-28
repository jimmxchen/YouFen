// Dependency resolver for the reversal-request endpoint group (§6 #8-#10).
// Reuses the chain-write Foundation deps (prisma / runtime / authEnv / config)
// and adds the Prisma-backed Idempotency-Key store the create endpoint needs.
// Mirrors the resolve<group>Deps() / set<group>DepsForTesting() seam.

import { resolveChainWriteDeps, type ChainWriteDeps } from '../chain-write/deps';
import {
  createPrismaIdempotencyStore,
  type IdempotencyStore,
  type PrismaIdempotencyDb,
} from '../core';

/** Foundation chain-write deps + the idempotency store the create handler uses. */
export interface ReversalDeps extends ChainWriteDeps {
  readonly idempotencyStore: IdempotencyStore;
}

let cached: ReversalDeps | null = null;

/** Test seam: inject deps (fake runtime + config + store), or null to clear. */
export function setReversalDepsForTesting(deps: ReversalDeps | null): void {
  cached = deps;
}

/**
 * Resolve the reversal deps from the shared chain-write Foundation. Throws (via
 * resolveChainWriteDeps) when required blockchain env is absent — the thin route
 * adapter surfaces that as a structured 500.
 */
export function resolveReversalDeps(): ReversalDeps {
  if (cached !== null) return cached;
  const base = resolveChainWriteDeps();
  return {
    ...base,
    idempotencyStore: createPrismaIdempotencyStore(base.prisma as unknown as PrismaIdempotencyDb),
  };
}
