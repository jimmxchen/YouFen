// GET /api/token-epochs/:id (W5-5). Public, read-only epoch detail. Thin adapter:
// resolve Next 15 async params, resolve real deps, delegate to the pure handler,
// and pass the ApiResult envelope straight through. No auth: this endpoint is public.

import { NextResponse } from 'next/server';

import { resolveMembersDeps } from '../../../../lib/api/members/deps';
import { handleEpochDetail } from '../../../../lib/api/members/handlers';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = resolveMembersDeps();
  const result = await handleEpochDetail(deps, { epochId: id });
  return NextResponse.json(result.body, { status: result.status });
}
