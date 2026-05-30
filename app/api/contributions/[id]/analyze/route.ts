// POST /api/contributions/:id/analyze — admin, strictly read-only AI analysis
// (§8.3). Thin adapter: await the dynamic param (Next 15 Promise), resolve auth
// + deps, delegate to the pure handler. No request body is read.

import { NextResponse } from 'next/server';

import { resolveAuth, resolveContributionsDeps } from '../../../../../lib/api/contributions/deps';
import { handleAnalyze } from '../../../../../lib/api/contributions/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const auth = resolveAuth(req.headers);
  const deps = await resolveContributionsDeps();
  const result = await handleAnalyze(deps, { contributionId: id, auth });
  return NextResponse.json(result.body, { status: result.status });
}
