// Dependency resolver for the v0.7 chain cron endpoint group. Mirrors the
// resolve<group>Deps() / set<group>DepsForTesting() seam every API group exposes.
// getGovernanceRuntime() fail-fasts if CONTRACT_ADDRESS / BLOCKCHAIN_PRIVATE_KEY
// are missing — the route adapter catches that and returns a structured error.

import { getPrisma } from '../../db/client';
import { getGovernanceRuntime } from '../../blockchain/relay/governance-runtime';

import type { ChainHandlerDeps } from './handlers';

let cached: ChainHandlerDeps | null = null;

/** Test seam: inject deps (fake runtime), or null to clear. */
export function setChainDepsForTesting(deps: ChainHandlerDeps | null): void {
  cached = deps;
}

function envOrNull(name: string): string | null {
  const value = process.env[name];
  return value !== undefined && value.length > 0 ? value : null;
}

export function resolveChainDeps(): ChainHandlerDeps {
  if (cached !== null) return cached;
  return {
    prisma: getPrisma(),
    runtime: getGovernanceRuntime(),
    authEnv: {
      cronSecret: envOrNull('CRON_SECRET'),
      internalApiToken: envOrNull('INTERNAL_API_TOKEN'),
    },
  };
}
