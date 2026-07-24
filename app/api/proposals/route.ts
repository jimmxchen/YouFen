// POST /api/proposals — open a proposal (member, Idempotency-Key). Thin adapter:
// parse the JSON body (400 on malformed), resolve deps, derive the auth context
// and Idempotency-Key at the edge, and pass the ApiResult envelope straight
// through (bigints already serialized by jsonSafe inside ok()).

import { NextResponse } from 'next/server';

import { fail } from '../../../lib/api/core';
import { authFromRequest, resolveProposalsDeps } from '../../../lib/api/proposals/deps';
import { handleCreateProposal } from '../../../lib/api/proposals/handlers';

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const r = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(r.body, { status: r.status });
  }

  const deps = await resolveProposalsDeps();
  const auth = authFromRequest(req);
  const idempotencyKey = req.headers.get('idempotency-key');
  const result = await handleCreateProposal(deps, { auth, body, idempotencyKey });
  return NextResponse.json(result.body, { status: result.status });
}
