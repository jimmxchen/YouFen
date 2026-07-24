// POST /api/mint-requests/:id/submit — community-admin. Idempotent trigger:
// ensure a ready_to_submit execute_mint ChainAction exists for a fully-signed
// mint request; return its id + status. Does NOT broadcast (the cron submitter
// does). Thin adapter: await param, resolve deps (structured 500 on missing
// blockchain env), read Idempotency-Key, delegate. No request body is read — the
// trigger's identity is the mint request id in the path.

import { NextResponse } from 'next/server';

import { fail } from '@/lib/api/core';
import { resolveMintDeps } from '@/lib/api/mint/deps';
import { handleSubmitMintRequest } from '@/lib/api/mint/handlers';

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
  const idempotencyKey = req.headers.get('Idempotency-Key');
  const result = await handleSubmitMintRequest(deps, {
    headers: req.headers,
    mintRequestId: id,
    idempotencyKey,
  });
  return NextResponse.json(result.body, { status: result.status });
}
