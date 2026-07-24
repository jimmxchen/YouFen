// Dependency resolver for the MINT write-endpoint group (docs/BLOCKCHAIN-DESIGN
// -v0.7.md §6, endpoints #4-#7). Builds on the shared chain-write Foundation
// deps (prisma / runtime / authEnv / config) and adds the idempotency store,
// the community-admin policy, and a clock — the only collaborators the mint
// handlers need beyond the runtime reader + signing/relay services.
//
// Mirrors the resolve<group>Deps() / set<group>DepsForTesting() seam every API
// group exposes. Nothing here talks to the chain or DB directly; it only wires
// singletons so the handlers stay pure and DB/unit-testable with an injected
// fake runtime + a real (or fake) Prisma client.

import {
  resolveChainWriteDeps,
  type ChainWriteDeps,
} from '../chain-write/deps';
import {
  createPrismaIdempotencyStore,
  type IdempotencyStore,
  type PrismaIdempotencyDb,
} from '../core/idempotency';
import {
  defaultAuthorizeAdmin,
  resolveAuthFromHeaders,
  type AuthContext,
  type AuthorizeAdminFn,
  type HeaderReader,
} from '../core/auth';

/**
 * The mint handler deps: the shared chain-write base intersected with an
 * idempotency store (mint-request + submit dedup), the community-admin policy
 * (who may create/collect/trigger), and an injectable clock.
 */
export interface MintDeps extends ChainWriteDeps {
  readonly idempotency: IdempotencyStore;
  readonly authorizeAdmin: AuthorizeAdminFn;
  readonly now: () => Date;
}

let cached: MintDeps | null = null;

/** Test seam: inject mint deps (fake runtime + real/fake prisma), or clear. */
export function setMintDepsForTesting(deps: MintDeps | null): void {
  cached = deps;
}

/**
 * Resolve the mint deps from the shared chain-write Foundation + singletons.
 * Throws (via resolveChainWriteDeps) when required blockchain env is absent —
 * the thin route adapter maps that to a structured 500.
 */
export function resolveMintDeps(): MintDeps {
  if (cached !== null) return cached;
  const base = resolveChainWriteDeps();
  return {
    ...base,
    idempotency: createPrismaIdempotencyStore(
      base.prisma as unknown as PrismaIdempotencyDb,
    ),
    authorizeAdmin: defaultAuthorizeAdmin,
    now: () => new Date(),
  };
}

/** Resolve the AuthContext for a request's headers against the deps' authEnv. */
export function resolveMintAuth(deps: MintDeps, headers: HeaderReader): AuthContext {
  return resolveAuthFromHeaders(headers, deps.authEnv);
}
