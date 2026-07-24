// POST /api/reversal-requests/:id/sign (§6 #9) — collect one approver signature.
// Thin adapter: parse JSON body (malformed -> 400), await the Next async param,
// resolve deps, delegate. Signature recovery + approver-role check live in the
// handler (the server never signs; it verifies a received signature).

import { NextResponse } from 'next/server';

import { fail } from '../../../../../lib/api/core';
import { resolveReversalDeps } from '../../../../../lib/api/reversal/deps';
import { handleSignReversalRequest } from '../../../../../lib/api/reversal/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const bad = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(bad.body, { status: bad.status });
  }

  let deps;
  try {
    deps = resolveReversalDeps();
  } catch (e: unknown) {
    const bad = fail(500, 'CHAIN_RUNTIME_UNCONFIGURED', e instanceof Error ? e.message : 'chain runtime unavailable');
    return NextResponse.json(bad.body, { status: bad.status });
  }
  const result = await handleSignReversalRequest(deps, { id, headers: req.headers, body });
  return NextResponse.json(result.body, { status: result.status });
}
