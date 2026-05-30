// POST /api/proposals/:id/end — settle the tally (admin/internal). No request
// body; Next 15 async params. Thin adapter over the pure handler.

import { NextResponse } from 'next/server';

import { authFromRequest, resolveProposalsDeps } from '../../../../../lib/api/proposals/deps';
import { handleEndProposal } from '../../../../../lib/api/proposals/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveProposalsDeps();
  const auth = authFromRequest(req);
  const result = await handleEndProposal(deps, { auth, proposalId: id });
  return NextResponse.json(result.body, { status: result.status });
}
