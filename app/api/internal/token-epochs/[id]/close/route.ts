// POST /api/internal/token-epochs/:id/close — cron/ops-only epoch rollover
// (W5-6). Thin adapter: resolve deps, await the dynamic route param, delegate to
// the pure handler, and translate the ApiResult into a NextResponse. Auth
// (CRON_SECRET / INTERNAL_API_TOKEN) is enforced inside the handler.

import { NextResponse } from 'next/server';

import { resolveInternalDeps } from '../../../../../../lib/api/internal/deps';
import { handleCloseEpoch } from '../../../../../../lib/api/internal/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveInternalDeps();
  const result = await handleCloseEpoch(deps, { headers: req.headers, epochId: id });
  return NextResponse.json(result.body, { status: result.status });
}
