// POST /api/reversal-requests (§6 #8) — create a reversal SignatureRequest.
// Thin adapter: parse JSON body (malformed -> 400), resolve deps, delegate to the
// pure handler. Admin auth + Idempotency-Key are enforced inside the handler.

import { NextResponse } from 'next/server';

import { fail } from '../../../lib/api/core';
import { resolveReversalDeps } from '../../../lib/api/reversal/deps';
import { handleCreateReversalRequest } from '../../../lib/api/reversal/handlers';

export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const bad = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(bad.body, { status: bad.status });
  }

  let deps;
  try {
    deps = resolveReversalDeps();
  } catch (e: unknown) {
    const bad = fail(500, 'CHAIN_RUNTIME_UNCONFIGURED', e instanceof Error ? e.message : 'chain runtime unavailable');
    return NextResponse.json(bad.body, { status: bad.status });
  }
  const result = await handleCreateReversalRequest(deps, {
    headers: req.headers,
    body,
    idempotencyKey: req.headers.get('idempotency-key'),
  });
  return NextResponse.json(result.body, { status: result.status });
}
