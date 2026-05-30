// GET /api/communities/:id/token-ledger — public paginated + filtered token
// ledger (PRD §18, W5-4). Thin adapter: resolve Next 15 async params, read the
// ?filter (default 'all') + page/limit from the query string, delegate to the
// pure handler which validates the filter enum (400 on an illegal value).

import { NextResponse } from 'next/server';

import { zPage, zLimit } from '../../../../../lib/api/core/validation';
import { resolveCommunitiesDeps } from '../../../../../lib/api/communities/deps';
import { handleGetLedger } from '../../../../../lib/api/communities/handlers';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const filter = url.searchParams.get('filter') ?? 'all';
  const page = zPage.parse(url.searchParams.get('page') ?? undefined);
  const limit = zLimit.parse(url.searchParams.get('limit') ?? undefined);

  const deps = await resolveCommunitiesDeps();
  const result = await handleGetLedger(deps, { communityId: id, filter, page, limit });
  return NextResponse.json(result.body, { status: result.status });
}
