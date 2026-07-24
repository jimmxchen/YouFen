// Real dependency wiring for the Token-Advances endpoint group (conventions
// §API-endpoint-group). resolveAdvanceDeps() composes the pure handlers' deps
// from the engine runtime (advance + proposal services), the shared Prisma
// client (direct read + idempotency store), and the core auth policy.
//
// setDepsForTesting(d | null) is the test seam: routes call resolveAdvanceDeps()
// and tests inject fakes so no real DB/engine is ever touched (offline rule).

import { getPrisma } from '../../db/client';
import { getEngineRuntime } from '../../engine/runtime';
import {
  createPrismaIdempotencyStore,
  defaultAuthorizeAdmin,
  type AuthEnv,
  type PrismaIdempotencyDb,
} from '../core';

import type { AdvanceDeps, AdvanceReadPort, AdvanceRequestRow } from './handlers';

/** The auth env the route adapters need to derive an AuthContext from headers. */
export interface AdvanceRouteDeps extends AdvanceDeps {
  readonly authEnv: AuthEnv;
}

let testDeps: AdvanceRouteDeps | null = null;

/** Test seam: inject route deps (or clear with null). */
export function setDepsForTesting(deps: AdvanceRouteDeps | null): void {
  testDeps = deps;
}

/** Minimal structural view of the Prisma tokenAdvanceRequest delegate we read. */
interface TokenAdvanceRequestDelegate {
  findUnique(args: { where: { id: string } }): Promise<AdvanceRequestRow | null>;
}

function readAuthEnv(env: Record<string, string | undefined> = process.env): AuthEnv {
  return {
    internalApiToken: env.INTERNAL_API_TOKEN ?? null,
    cronSecret: env.CRON_SECRET ?? null,
  };
}

/**
 * Compose the real route deps. The advance + proposal services come from the
 * engine runtime; the direct reader and idempotency store come from Prisma.
 */
export async function resolveAdvanceDeps(): Promise<AdvanceRouteDeps> {
  if (testDeps !== null) return testDeps;

  const rt = await getEngineRuntime();
  const prisma = getPrisma();
  const delegate = (prisma as unknown as {
    tokenAdvanceRequest: TokenAdvanceRequestDelegate;
  }).tokenAdvanceRequest;

  const reader: AdvanceReadPort = {
    findById: (id) => delegate.findUnique({ where: { id } }),
  };

  return {
    advance: rt.advance,
    proposal: rt.proposal,
    reader,
    authorizeAdmin: defaultAuthorizeAdmin,
    idempotencyStore: createPrismaIdempotencyStore(
      prisma as unknown as PrismaIdempotencyDb,
    ),
    authEnv: readAuthEnv(),
  };
}
