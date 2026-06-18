// POST /api/contributions — create a pending contribution (member-level,
// Idempotency-Key required). Thin adapter: resolve auth + deps, read the JSON
// body (malformed -> 400 VALIDATION_ERROR), delegate to the pure handler, and
// pass the ApiResult envelope straight through (bigints already jsonSafe).

import { NextResponse } from 'next/server';

import { resolveAuth, resolveContributionsDeps } from '../../../lib/api/contributions/deps';
import { handleCreate } from '../../../lib/api/contributions/handlers';
import { fail } from '../../../lib/api/core/respond';

export async function POST(req: Request): Promise<NextResponse> {
  const auth = resolveAuth(req.headers);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const bad = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(bad.body, { status: bad.status });
  }
  const idempotencyKey = req.headers.get('Idempotency-Key');
  const deps = await resolveContributionsDeps();
  const result = await handleCreate(deps, { body, auth, idempotencyKey });
  return NextResponse.json(result.body, { status: result.status });
}
