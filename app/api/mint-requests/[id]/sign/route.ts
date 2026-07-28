// POST /api/mint-requests/:id/sign — RECEIVE an approver signature (the server
// never signs). The handler recovers the signer, verifies approver role +
// non-self, stores it, and drives the request to a ready_to_submit ChainAction
// once the threshold is met. Thin adapter: await param, resolve deps (structured
// 500 on missing blockchain env), read the JSON body (malformed -> 400), delegate.

import { NextResponse } from 'next/server';

import { fail } from '@/lib/api/core';
import { resolveMintDeps } from '@/lib/api/mint/deps';
import { handleSignMintRequest } from '@/lib/api/mint/handlers';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let deps;
  try {
    deps = resolveMintDeps();
  } catch (e: unknown) {
    const bad = fail(500, 'CHAIN_RUNTIME_UNCONFIGURED', e instanceof Error ? e.message : 'runtime unavailable');
    return NextResponse.json(bad.body, { status: bad.status });
  }

  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const bad = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(bad.body, { status: bad.status });
  }

  const result = await handleSignMintRequest(deps, {
    headers: req.headers,
    mintRequestId: id,
    body,
  });
  return NextResponse.json(result.body, { status: result.status });
}
