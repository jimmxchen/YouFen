// POST /api/token-advances/:id/second-approve — the distinct-admin second
// approval. Thin adapter: Next 15 async params, header-derived AuthContext,
// pure handler, envelope straight through.

import { NextResponse } from 'next/server';

import { resolveAdvanceDeps } from '../../../../../lib/api/token-advances/deps';
import { handleSecondApprove } from '../../../../../lib/api/token-advances/handlers';
import { resolveAuthFromHeaders } from '../../../../../lib/api/core';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveAdvanceDeps();
  const auth = resolveAuthFromHeaders(req.headers, deps.authEnv);
  const result = await handleSecondApprove(deps, { id, auth });
  return NextResponse.json(result.body, { status: result.status });
}
