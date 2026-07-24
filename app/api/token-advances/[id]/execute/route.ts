// POST /api/token-advances/:id/execute — perform the advance mint (idempotent
// via the engine's advanceRequestId re-lookup). Thin adapter: Next 15 async
// params, header-derived AuthContext, body parse (invalid JSON -> 400), pure
// handler, envelope straight through.

import { NextResponse } from 'next/server';

import { resolveAdvanceDeps } from '../../../../../lib/api/token-advances/deps';
import { handleExecuteAdvance } from '../../../../../lib/api/token-advances/handlers';
import { fail, resolveAuthFromHeaders } from '../../../../../lib/api/core';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveAdvanceDeps();
  const auth = resolveAuthFromHeaders(req.headers, deps.authEnv);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const bad = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(bad.body, { status: bad.status });
  }

  const result = await handleExecuteAdvance(deps, { id, body, auth });
  return NextResponse.json(result.body, { status: result.status });
}
