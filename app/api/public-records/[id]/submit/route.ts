// POST /api/public-records/:id/submit — enqueue a pending record for submission
// (BLOCKCHAIN-DESIGN §7). Thin adapter over the pure handler.
//
// This endpoint only reads a record and enqueues a submit job (to Redis); it never
// signs or broadcasts, so it deliberately does NOT build the full blockchain
// runtime. Doing so would load the whole config (forcing BLOCKCHAIN_PRIVATE_KEY)
// and instantiate the recorder wallet — with an eager resyncNonce RPC — inside the
// Web process, breaking the key isolation the design mandates (BLOCKCHAIN-DESIGN
// §8; .env.example "Worker env only — never in frontend/repo"). resolveAdminDeps
// wires only a key-free DB record service + Redis submit queue + the internal admin
// token — see admin-deps.ts.
//
// AUTH NOTE: placeholder bearer check against the internal token (config-layer zod
// guarantees it is non-empty). Real per-admin authz is a human hand-off — see notes.
// SCAFFOLD NOTE: not yet exercised against a live Next server — see task notes.

import { NextResponse } from 'next/server';

import { resolveAdminDeps } from '../../../../../lib/api/public-records/admin-deps';
import { handleSubmit, type AuthInput } from '../../../../../lib/api/public-records/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveAdminDeps();
  const auth: AuthInput = {
    headerToken: req.headers.get('authorization')?.replace(/^Bearer /, '') ?? null,
  };
  const authorize = (a: AuthInput): boolean => a.headerToken === deps.internalApiToken;
  const result = await handleSubmit({ records: deps.records, authorize }, { recordId: id, auth });
  return NextResponse.json(result.body, { status: result.status });
}
