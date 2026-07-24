// GET /api/public-records/:id — public record detail (BLOCKCHAIN-DESIGN §7).
// Thin adapter: resolve params (Next 15 async params), resolve read-only deps,
// delegate to the pure handler, and pass the ApiResult envelope straight through.
//
// This endpoint is public and read-only, so it deliberately does NOT build the
// blockchain runtime: that would force BLOCKCHAIN_PRIVATE_KEY into the Web env and
// instantiate the recorder wallet in the Web process, breaking the key isolation
// the design mandates (BLOCKCHAIN-DESIGN §8; .env.example "Worker env only").
// resolveGetDeps wires only a key-free, DB-backed read path — see get-deps.ts.
//
// SCAFFOLD NOTE: not yet exercised against a live Next server — see task notes.

import { NextResponse } from 'next/server';

import { resolveGetDeps } from '../../../../lib/api/public-records/get-deps';
import { handleGet } from '../../../../lib/api/public-records/handlers';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveGetDeps();
  const result = await handleGet(deps, { recordId: id });
  return NextResponse.json(result.body, { status: result.status });
}
