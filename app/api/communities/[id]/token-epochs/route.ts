// GET /api/communities/:id/token-epochs — public paginated epoch list (PRD §5,
// W5-4). Thin adapter: resolve Next 15 async params, coerce page/limit from the
// query string, delegate to the pure handler.

import { NextResponse } from 'next/server';

import { zPage, zLimit } from '../../../../../lib/api/core/validation';
import { resolveCommunitiesDeps } from '../../../../../lib/api/communities/deps';
import { handleListEpochs } from '../../../../../lib/api/communities/handlers';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const page = zPage.parse(url.searchParams.get('page') ?? undefined);
  const limit = zLimit.parse(url.searchParams.get('limit') ?? undefined);

  const deps = await resolveCommunitiesDeps();
  const result = await handleListEpochs(deps, { communityId: id, page, limit });
  return NextResponse.json(result.body, { status: result.status });
}
