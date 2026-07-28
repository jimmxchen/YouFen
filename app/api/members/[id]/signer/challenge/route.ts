// POST /api/members/:id/signer/challenge (§6 #1). Thin adapter: resolve Next
// async params, resolve deps, derive the AuthContext from headers, parse the body
// (invalid JSON -> 400), delegate to the pure handler, pass the envelope through.

import { NextResponse } from 'next/server';

import { fail, resolveAuthFromHeaders } from '../../../../../../lib/api/core';
import { resolveSignerDeps } from '../../../../../../lib/api/signer/deps';
import { handleSignerChallenge } from '../../../../../../lib/api/signer/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  let deps;
  try {
    deps = resolveSignerDeps();
  } catch (e: unknown) {
    const bad = fail(500, 'CHAIN_RUNTIME_UNCONFIGURED', e instanceof Error ? e.message : 'chain runtime unavailable');
    return NextResponse.json(bad.body, { status: bad.status });
  }
  const auth = resolveAuthFromHeaders(req.headers, deps.authEnv);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const bad = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(bad.body, { status: bad.status });
  }

  const result = await handleSignerChallenge(deps, { memberId: id, body, auth });
  return NextResponse.json(result.body, { status: result.status });
}
