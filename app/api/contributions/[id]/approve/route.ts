// POST /api/contributions/:id/approve — admin. Persists approvedTokenAmount /
// ruleId / aiReason (the approver carries the analysis conclusion) on a pending
// contribution. Thin adapter: await the dynamic param, resolve auth + deps, read
// the JSON body (malformed -> 400), delegate to the pure handler.

import { NextResponse } from 'next/server';

import { resolveAuth, resolveContributionsDeps } from '../../../../../lib/api/contributions/deps';
import { handleApprove } from '../../../../../lib/api/contributions/handlers';
import { fail } from '../../../../../lib/api/core/respond';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const auth = resolveAuth(req.headers);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const bad = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(bad.body, { status: bad.status });
  }
  const deps = await resolveContributionsDeps();
  const result = await handleApprove(deps, { contributionId: id, body, auth });
  return NextResponse.json(result.body, { status: result.status });
}
