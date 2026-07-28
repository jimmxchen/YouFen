// Shared dependency resolver for the v0.7 chain-WRITE endpoint groups
// (mint / reversal / proposal / vote / member-enroll / rotate / relay — the §6
// write endpoints). Every write group builds its handler deps on top of this
// Foundation shape, so identity/runtime/config wiring lives in exactly one
// place. Mirrors the resolve<group>Deps() / set<group>DepsForTesting() seam that
// lib/api/chain/deps.ts established.
//
// getGovernanceRuntime() and loadBlockchainConfig() fail-fast when CONTRACT_ADDRESS
// / BLOCKCHAIN_PRIVATE_KEY / RECORD_HASH_PEPPER / INTERNAL_API_TOKEN are missing;
// the thin route adapter catches that and returns a structured 500.

import type { PrismaClient } from '@prisma/client';

import { getPrisma } from '../../db/client';
import { loadBlockchainConfig } from '../../blockchain/config';
import type { BlockchainConfig } from '../../blockchain/types';
import {
  getGovernanceRuntime,
  type GovernanceRuntime,
} from '../../blockchain/relay/governance-runtime';
import type { AuthEnv } from '../core/auth';

/**
 * The Foundation deps every chain-write handler group receives. Group-specific
 * resolvers may intersect this with extra fields (e.g. an assembler), but this
 * is the shared base. `config` carries the record-hash pepper used by
 * resolveMemberIdHash and the confirmations/explorer settings.
 */
export interface ChainWriteDeps {
  readonly prisma: PrismaClient;
  readonly runtime: GovernanceRuntime;
  readonly authEnv: AuthEnv;
  readonly config: BlockchainConfig;
}

let cached: ChainWriteDeps | null = null;

/** Test seam: inject deps (fake runtime + config), or null to clear. */
export function setChainWriteDepsForTesting(deps: ChainWriteDeps | null): void {
  cached = deps;
}

function envOrNull(name: string): string | null {
  const value = process.env[name];
  return value !== undefined && value.length > 0 ? value : null;
}

/**
 * Resolve the shared chain-write deps from env + singletons. Throws (via
 * loadBlockchainConfig / getGovernanceRuntime) when required blockchain env is
 * absent — the route adapter maps that to CHAIN_RUNTIME_UNCONFIGURED.
 */
export function resolveChainWriteDeps(): ChainWriteDeps {
  if (cached !== null) return cached;
  return {
    prisma: getPrisma(),
    runtime: getGovernanceRuntime(),
    authEnv: {
      cronSecret: envOrNull('CRON_SECRET'),
      internalApiToken: envOrNull('INTERNAL_API_TOKEN'),
    },
    config: loadBlockchainConfig(),
  };
}
