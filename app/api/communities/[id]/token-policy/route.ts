// GET /api/communities/:id/token-policy — public policy detail (PRD §16, W5-4).
// Thin adapter: resolve Next 15 async params, resolve real deps, delegate to the
// pure handler, and pass the ApiResult envelope straight through.

import { NextResponse } from 'next/server';

import { resolveCommunitiesDeps } from '../../../../../lib/api/communities/deps';
import { handleGetTokenPolicy } from '../../../../../lib/api/communities/handlers';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveCommunitiesDeps();
  const result = await handleGetTokenPolicy(deps, { communityId: id });
  return NextResponse.json(result.body, { status: result.status });
}
