// GET /api/mint-requests/:id — community-admin. The SignatureRequest + its
// collected signatures + the eip712 envelope. Thin adapter: await the dynamic
// param, resolve deps (structured 500 on missing blockchain env), delegate.

import { NextResponse } from 'next/server';

import { fail } from '@/lib/api/core';
import { resolveMintDeps } from '@/lib/api/mint/deps';
import { handleGetMintRequest } from '@/lib/api/mint/handlers';

export const dynamic = 'force-dynamic';

export async function GET(
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
  const result = await handleGetMintRequest(deps, {
    headers: req.headers,
    mintRequestId: id,
  });
  return NextResponse.json(result.body, { status: result.status });
}
