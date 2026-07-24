// POST /api/contributions/:id/mint — admin. Delegates to the engine mint via the
// pure handler. Thin adapter: await the dynamic param, resolve auth + deps, read
// the JSON body (malformed -> 400), delegate. Success -> 201; ALREADY_MINTED ->
// 200 idempotent replay; INSUFFICIENT_BUDGET -> 409 with an advancePath hint.

import { NextResponse } from 'next/server';

import { resolveAuth, resolveContributionsDeps } from '../../../../../lib/api/contributions/deps';
import { handleMint } from '../../../../../lib/api/contributions/handlers';
import { fail } from '../../../../../lib/api/core/respond';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const auth = resolveAuth(req.headers);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const bad = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(bad.body, { status: bad.status });
  }
  const deps = await resolveContributionsDeps();
  const result = await handleMint(deps, { contributionId: id, body, auth });
  return NextResponse.json(result.body, { status: result.status });
}
