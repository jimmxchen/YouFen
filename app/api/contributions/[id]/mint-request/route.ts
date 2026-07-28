// POST /api/contributions/:id/mint-request — community-admin. Build the mint
// EIP-712 authorization the approver(s) sign and persist a SignatureRequest.
// Thin adapter: await the dynamic param, resolve deps (structured 500 on missing
// blockchain env), read the JSON body (malformed -> 400), read Idempotency-Key,
// delegate to the pure handler.

import { NextResponse } from 'next/server';

import { fail } from '@/lib/api/core';
import { resolveMintDeps } from '@/lib/api/mint/deps';
import { handleMintRequest } from '@/lib/api/mint/handlers';

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

  const idempotencyKey = req.headers.get('Idempotency-Key');
  const result = await handleMintRequest(deps, {
    headers: req.headers,
    contributionId: id,
    body,
    idempotencyKey,
  });
  return NextResponse.json(result.body, { status: result.status });
}
