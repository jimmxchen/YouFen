// GET /api/members/:id/token-history (W5-5, paginated). Thin adapter: resolve Next
// 15 async params, parse page/limit from the query string, derive the auth context,
// resolve real deps, delegate to the pure handler, and pass the envelope through.

import { NextResponse } from 'next/server';

import { resolveAuthFromHeaders, zLimit, zPage } from '../../../../../lib/api/core';
import { resolveMembersDeps } from '../../../../../lib/api/members/deps';
import { handleTokenHistory } from '../../../../../lib/api/members/handlers';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const page = zPage.parse(url.searchParams.get('page') ?? undefined);
  const limit = zLimit.parse(url.searchParams.get('limit') ?? undefined);

  const auth = resolveAuthFromHeaders(req.headers, {
    internalApiToken: process.env.INTERNAL_API_TOKEN ?? null,
    cronSecret: process.env.CRON_SECRET ?? null,
  });
  const deps = resolveMembersDeps();
  const result = await handleTokenHistory(deps, { memberId: id, ctx: auth, page, limit });
  return NextResponse.json(result.body, { status: result.status });
}
