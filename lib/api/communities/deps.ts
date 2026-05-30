// Real-dependency resolver for the Community read-endpoint group (W5-4). Reads
// go straight to the guarded Prisma client (getPrisma) because they need count()
// which the engine's loose delegate surface does not expose; the single write
// path (policy-change proposal) is delegated to the engine proposal service from
// getEngineRuntime(). Admin authorization uses the shared default policy.
//
// Mirrors the runtime seam pattern: setDepsForTesting injects a fake bundle (or
// null to clear) so route tests never build the real engine/Prisma graph.

import { getPrisma } from '../../db/client';
import { getEngineRuntime } from '../../engine/runtime';
import { defaultAuthorizeAdmin, type AuthEnv } from '../core/auth';

import type { CommunitiesDb, CommunitiesDeps } from './handlers';

let override: CommunitiesDeps | null = null;

/** Test seam: inject a fake deps bundle, or pass null to clear it. */
export function setDepsForTesting(deps: CommunitiesDeps | null): void {
  override = deps;
}

/** Resolve the real dependency bundle the community handlers need. */
export async function resolveCommunitiesDeps(): Promise<CommunitiesDeps> {
  if (override !== null) {
    return override;
  }
  const runtime = await getEngineRuntime();
  const prisma = getPrisma();
  return {
    db: prisma as unknown as CommunitiesDb,
    proposal: runtime.proposal,
    authorize: defaultAuthorizeAdmin,
  };
}

/** Build the AuthEnv used to derive an AuthContext from request headers. */
export function resolveAuthEnv(): AuthEnv {
  return {
    internalApiToken: process.env.INTERNAL_API_TOKEN ?? null,
    cronSecret: process.env.CRON_SECRET ?? null,
  };
}
