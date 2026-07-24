// POST /api/token/reverse (W5-5). Thin adapter: derive the auth context, parse the
// JSON body (bad JSON -> 400), validate it, build the Idempotency-Key context, resolve
// real deps, delegate to the pure handler, and pass the ApiResult envelope through.

import { NextResponse } from 'next/server';

import {
  fail,
  hashRequestBody,
  parseBody,
  resolveAuthFromHeaders,
} from '../../../../lib/api/core';
import { resolveReverseDeps } from '../../../../lib/api/token-reverse/deps';
import { handleReverse, reverseBodySchema } from '../../../../lib/api/token-reverse/handlers';

const ENDPOINT = 'POST /api/token/reverse';

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    const result = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(result.body, { status: result.status });
  }

  const parsed = parseBody(reverseBodySchema, raw);
  if (!parsed.ok) {
    return NextResponse.json(parsed.response.body, { status: parsed.response.status });
  }

  const auth = resolveAuthFromHeaders(req.headers, {
    internalApiToken: process.env.INTERNAL_API_TOKEN ?? null,
    cronSecret: process.env.CRON_SECRET ?? null,
  });

  const deps = await resolveReverseDeps();
  const result = await handleReverse(deps, {
    body: parsed.data,
    ctx: auth,
    idempotency: {
      endpoint: ENDPOINT,
      key: req.headers.get('idempotency-key'),
      requestHash: hashRequestBody(parsed.data),
    },
  });
  return NextResponse.json(result.body, { status: result.status });
}
