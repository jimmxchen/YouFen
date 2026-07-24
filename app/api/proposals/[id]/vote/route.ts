// POST /api/proposals/:id/vote — cast a snapshot-bound vote (member). Thin
// adapter: parse the JSON body (400 on malformed), Next 15 async params, resolve
// deps, delegate to the handler.

import { NextResponse } from 'next/server';

import { fail } from '../../../../../lib/api/core';
import { authFromRequest, resolveProposalsDeps } from '../../../../../lib/api/proposals/deps';
import { handleVote } from '../../../../../lib/api/proposals/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const r = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(r.body, { status: r.status });
  }

  const deps = await resolveProposalsDeps();
  const auth = authFromRequest(req);
  const result = await handleVote(deps, { auth, proposalId: id, body });
  return NextResponse.json(result.body, { status: result.status });
}
