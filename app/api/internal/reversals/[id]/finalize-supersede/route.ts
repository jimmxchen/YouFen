// POST /api/internal/reversals/:id/finalize-supersede — cron/ops-only reversal
// supersede finalization (W5-6). Thin adapter: resolve deps, await the dynamic
// route param, delegate to the pure handler, translate the ApiResult. Auth is
// enforced inside the handler. Returns finalized:false (200) when the reversal
// record is not yet verified so the caller can retry.

import { NextResponse } from 'next/server';

import { resolveInternalDeps } from '../../../../../../lib/api/internal/deps';
import { handleFinalizeSupersede } from '../../../../../../lib/api/internal/handlers';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveInternalDeps();
  const result = await handleFinalizeSupersede(deps, {
    headers: req.headers,
    reversalId: id,
  });
  return NextResponse.json(result.body, { status: result.status });
}
