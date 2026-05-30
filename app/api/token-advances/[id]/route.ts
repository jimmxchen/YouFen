// GET /api/token-advances/:id — advance-request detail (admin). Thin adapter:
// Next 15 async params, header-derived AuthContext, pure handler, envelope
// straight through.

import { NextResponse } from 'next/server';

import { resolveAdvanceDeps } from '../../../../lib/api/token-advances/deps';
import { handleGetAdvance } from '../../../../lib/api/token-advances/handlers';
import { resolveAuthFromHeaders } from '../../../../lib/api/core';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveAdvanceDeps();
  const auth = resolveAuthFromHeaders(req.headers, deps.authEnv);
  const result = await handleGetAdvance(deps, { id, auth });
  return NextResponse.json(result.body, { status: result.status });
}
