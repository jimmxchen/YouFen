// Dependency resolver for the governance-PROPOSAL endpoint group (§6 #11-#15:
// activate / vote-authorization / votes-relay / finalize / execute). Builds on
// the shared chain-write Foundation deps (prisma + runtime + authEnv + config)
// and adds the Prisma-backed idempotency store the mutating endpoints need.
// Mirrors the resolve<group>Deps() / set<group>DepsForTesting() seam every group
// exposes so route tests can inject a fake runtime without a real RPC/DB.

import { getPrisma } from '../../db/client';
import {
  createPrismaIdempotencyStore,
  type IdempotencyStore,
  type PrismaIdempotencyDb,
} from '../core';
import { resolveChainWriteDeps, type ChainWriteDeps } from '../chain-write/deps';

/** ChainWriteDeps + the idempotency store the §5 "all mutating endpoints" rule requires. */
export interface GovProposalsDeps extends ChainWriteDeps {
  readonly idempotency: IdempotencyStore;
}

let cached: GovProposalsDeps | null = null;

/** Test seam: inject deps (fake runtime + store), or null to clear. */
export function setGovProposalsDepsForTesting(deps: GovProposalsDeps | null): void {
  cached = deps;
}

/**
 * Resolve the group deps. Throws (via resolveChainWriteDeps → loadBlockchainConfig
 * / getGovernanceRuntime) when required blockchain env is absent — the thin route
 * adapter maps that to CHAIN_RUNTIME_UNCONFIGURED.
 */
export function resolveGovProposalsDeps(): GovProposalsDeps {
  if (cached !== null) return cached;
  const base = resolveChainWriteDeps();
  return {
    ...base,
    idempotency: createPrismaIdempotencyStore(getPrisma() as unknown as PrismaIdempotencyDb),
  };
}
