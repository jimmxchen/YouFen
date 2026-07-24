// POST /api/proposals/:id/start — freeze the snapshot and open voting (admin).
// Thin adapter: Next 15 async params, resolve deps, delegate to the handler.

import { NextResponse } from 'next/server';

import { authFromRequest, resolveProposalsDeps } from '../../../../../lib/api/proposals/deps';
import { handleStartProposal } from '../../../../../lib/api/proposals/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveProposalsDeps();
  const auth = authFromRequest(req);
  const result = await handleStartProposal(deps, { auth, proposalId: id });
  return NextResponse.json(result.body, { status: result.status });
}
