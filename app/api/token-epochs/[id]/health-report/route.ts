// GET /api/token-epochs/:id/health-report (W5-7). Thin adapter: await the Next 15
// route params, derive the auth context, resolve real deps, delegate to the pure
// handler, and pass the ApiResult envelope through. This lives in a `health-report`
// subdirectory so it never collides with the epoch route at
// app/api/token-epochs/[id]/route.ts (W5-5).

import { NextResponse } from 'next/server';

import { resolveAuthFromHeaders } from '../../../../../lib/api/core';
import { resolveHealthReportDeps } from '../../../../../lib/api/ai-endpoints/deps';
import { handleHealthReport } from '../../../../../lib/api/ai-endpoints/handlers';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  const auth = resolveAuthFromHeaders(req.headers, {
    internalApiToken: process.env.INTERNAL_API_TOKEN ?? null,
    cronSecret: process.env.CRON_SECRET ?? null,
  });

  const deps = resolveHealthReportDeps();
  const result = await handleHealthReport(deps, { epochId: id, ctx: auth });
  return NextResponse.json(result.body, { status: result.status });
}
