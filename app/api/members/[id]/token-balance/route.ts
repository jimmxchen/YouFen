// GET /api/members/:id/token-balance (W5-5). Thin adapter: resolve Next 15 async
// params, derive the auth context from headers, resolve real deps, delegate to the
// pure handler, and pass the ApiResult envelope straight through.

import { NextResponse } from 'next/server';

import { resolveAuthFromHeaders } from '../../../../../lib/api/core';
import { resolveMembersDeps } from '../../../../../lib/api/members/deps';
import { handleTokenBalance } from '../../../../../lib/api/members/handlers';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const auth = resolveAuthFromHeaders(req.headers, {
    internalApiToken: process.env.INTERNAL_API_TOKEN ?? null,
    cronSecret: process.env.CRON_SECRET ?? null,
  });
  const deps = resolveMembersDeps();
  const result = await handleTokenBalance(deps, { memberId: id, ctx: auth });
  return NextResponse.json(result.body, { status: result.status });
}
