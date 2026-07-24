// POST /api/proposals/:id/execute — queue executeProposal(proposalId) (§6 #15).
// Thin adapter: Next async params, parse the JSON body (400 on malformed),
// resolve deps (500 if the chain runtime is unconfigured), delegate to the pure
// handler. Auth is enforced in the handler.

import { NextResponse } from 'next/server';

import { fail } from '@/lib/api/core';
import { resolveGovProposalsDeps } from '@/lib/api/gov-proposals/deps';
import { handleExecuteProposal } from '@/lib/api/gov-proposals/handlers';

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

  let deps;
  try {
    deps = resolveGovProposalsDeps();
  } catch (e: unknown) {
    const bad = fail(500, 'CHAIN_RUNTIME_UNCONFIGURED', e instanceof Error ? e.message : 'runtime unavailable');
    return NextResponse.json(bad.body, { status: bad.status });
  }

  const result = await handleExecuteProposal(deps, { headers: req.headers, proposalId: id, body });
  return NextResponse.json(result.body, { status: result.status });
}
