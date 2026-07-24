// POST /api/reversal-requests/:id/submit (§6 #10) — queue the reversal for the
// relayer. Thin adapter: await the Next async param, resolve deps, delegate. No
// request body; admin auth is enforced inside the handler.

import { NextResponse } from 'next/server';

import { fail } from '../../../../../lib/api/core';
import { resolveReversalDeps } from '../../../../../lib/api/reversal/deps';
import { handleSubmitReversalRequest } from '../../../../../lib/api/reversal/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  let deps;
  try {
    deps = resolveReversalDeps();
  } catch (e: unknown) {
    const bad = fail(500, 'CHAIN_RUNTIME_UNCONFIGURED', e instanceof Error ? e.message : 'chain runtime unavailable');
    return NextResponse.json(bad.body, { status: bad.status });
  }
  const result = await handleSubmitReversalRequest(deps, { id, headers: req.headers });
  return NextResponse.json(result.body, { status: result.status });
}
