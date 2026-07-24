// GET /api/proposals/:id/snapshot — public read of the frozen snapshot (Next 15
// async params). An optional ?memberId= query attaches that member's frozen
// governance weight. Thin adapter over the pure handler.

import { NextResponse } from 'next/server';

import { resolveProposalsDeps } from '../../../../../lib/api/proposals/deps';
import { handleGetSnapshot } from '../../../../../lib/api/proposals/handlers';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const memberId = new URL(req.url).searchParams.get('memberId');
  const deps = await resolveProposalsDeps();
  const result = await handleGetSnapshot(deps, { proposalId: id, memberId });
  return NextResponse.json(result.body, { status: result.status });
}
