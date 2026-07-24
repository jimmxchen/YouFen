// POST /api/token-advances — create a token-advance request (idempotent).
// Thin adapter: resolve deps, derive the AuthContext from headers, parse the
// body (invalid JSON -> 400), delegate to the pure handler, pass the envelope
// through. Next 15 route with no dynamic params.

import { NextResponse } from 'next/server';

import { resolveAdvanceDeps } from '../../../lib/api/token-advances/deps';
import { handleCreateAdvance } from '../../../lib/api/token-advances/handlers';
import { fail, resolveAuthFromHeaders } from '../../../lib/api/core';

export async function POST(req: Request): Promise<NextResponse> {
  const deps = await resolveAdvanceDeps();
  const auth = resolveAuthFromHeaders(req.headers, deps.authEnv);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const bad = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(bad.body, { status: bad.status });
  }

  const idempotencyKey = req.headers.get('Idempotency-Key');
  const result = await handleCreateAdvance(deps, { body, auth, idempotencyKey });
  return NextResponse.json(result.body, { status: result.status });
}
