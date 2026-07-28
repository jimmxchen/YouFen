// Dependency resolver for the SIGNER endpoint group (enroll / rotate member
// client-held keys). Reuses the chain-write Foundation (`resolveChainWriteDeps`)
// for the prisma/runtime/config/authEnv wiring, then layers on the shared admin
// policy + Prisma idempotency store. Mirrors the resolve<group>Deps() /
// set<group>DepsForTesting() seam every API group exposes.

import {
  createPrismaIdempotencyStore,
  defaultAuthorizeAdmin,
  type AuthEnv,
  type PrismaIdempotencyDb,
} from '../core';
import { resolveChainWriteDeps } from '../chain-write/deps';

import type { SignerDeps } from './handlers';

/** Route-adapter deps: the pure-handler deps plus the AuthEnv the thin route
 * needs to derive an AuthContext from request headers. */
export interface SignerRouteDeps extends SignerDeps {
  readonly authEnv: AuthEnv;
}

let testDeps: SignerRouteDeps | null = null;

/** Test seam: inject route deps (fake runtime + config), or null to clear. */
export function setSignerDepsForTesting(deps: SignerRouteDeps | null): void {
  testDeps = deps;
}

/**
 * Compose the real signer route deps. Throws (via resolveChainWriteDeps) when the
 * required blockchain env is absent — the thin route adapter maps that to a 500.
 */
export function resolveSignerDeps(): SignerRouteDeps {
  if (testDeps !== null) return testDeps;

  const base = resolveChainWriteDeps();
  return {
    prisma: base.prisma,
    runtime: base.runtime,
    config: base.config,
    authorizeAdmin: defaultAuthorizeAdmin,
    idempotencyStore: createPrismaIdempotencyStore(
      base.prisma as unknown as PrismaIdempotencyDb,
    ),
    authEnv: base.authEnv,
  };
}
