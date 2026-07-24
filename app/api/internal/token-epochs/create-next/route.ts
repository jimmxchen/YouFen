// POST /api/internal/token-epochs/create-next — cron/ops-only "ensure next epoch
// exists" (W5-6). Thin adapter: parse+validate the JSON body (malformed JSON →
// 400 VALIDATION_ERROR), resolve deps, delegate to the pure handler. Auth is
// enforced inside the handler.

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { fail, zId } from '../../../../../lib/api/core';
import { resolveInternalDeps } from '../../../../../lib/api/internal/deps';
import { handleCreateNextEpoch } from '../../../../../lib/api/internal/handlers';

const bodySchema = z.object({ communityId: zId });

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    const bad = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(bad.body, { status: bad.status });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const bad = fail(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      parsed.error.flatten(),
    );
    return NextResponse.json(bad.body, { status: bad.status });
  }

  const deps = await resolveInternalDeps();
  const result = await handleCreateNextEpoch(deps, {
    headers: req.headers,
    communityId: parsed.data.communityId,
  });
  return NextResponse.json(result.body, { status: result.status });
}
