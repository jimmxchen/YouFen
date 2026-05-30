// Real dependency resolver for the internal-API endpoint group (W5-6). Pulls the
// epoch + reversal services from the shared engine runtime and reads the two
// internal-auth secrets from the environment. Mirrors the resolve<group>Deps() /
// setDepsForTesting() seam every W5 group exposes (conventions §API-endpoint-group).
//
// onEpochClosed is intentionally left undefined here: the post-close health-report
// wiring (lib/ai) is a production hand-off — see task notes — and must not be
// imported by this key-free Web-layer module.

import { getEngineRuntime } from '../../engine/runtime';

import type { InternalDeps } from './handlers';

// Lazily resolved once per process; a per-request rebuild would re-read the
// runtime singleton needlessly.
let cached: InternalDeps | null = null;

/** Test seam: inject internal deps, or pass null to clear the cache. */
export function setDepsForTesting(deps: InternalDeps | null): void {
  cached = deps;
}

/** Read an env secret as a nullable, treating empty strings as absent. */
function envOrNull(name: string): string | null {
  const value = process.env[name];
  return value !== undefined && value.length > 0 ? value : null;
}

/**
 * Resolve the internal deps: engine epoch + reversal services plus the auth env.
 * Prefers test-injected deps. onEpochClosed stays undefined (production hook —
 * see notes).
 */
export async function resolveInternalDeps(): Promise<InternalDeps> {
  if (cached !== null) {
    return cached;
  }
  const runtime = await getEngineRuntime();
  return {
    runtime: { epoch: runtime.epoch, reversal: runtime.reversal },
    env: {
      cronSecret: envOrNull('CRON_SECRET'),
      internalApiToken: envOrNull('INTERNAL_API_TOKEN'),
    },
  };
}
