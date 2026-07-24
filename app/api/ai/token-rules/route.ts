// POST /api/ai/token-rules (W5-7). Thin adapter: parse the JSON body (bad JSON ->
// 400), validate it, derive the auth context, resolve real deps, delegate to the
// pure handler, and pass the ApiResult envelope through. The handler returns only
// an advisory draft — nothing is written to the ledger.

import { NextResponse } from 'next/server';

import { fail, parseBody, resolveAuthFromHeaders } from '../../../../lib/api/core';
import { resolveTokenRulesDeps } from '../../../../lib/api/ai-endpoints/deps';
import {
  handleTokenRules,
  tokenRulesBodySchema,
} from '../../../../lib/api/ai-endpoints/handlers';

export async function POST(req: Request): Promise<NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    const result = fail(400, 'VALIDATION_ERROR', 'Request body must be valid JSON');
    return NextResponse.json(result.body, { status: result.status });
  }

  const parsed = parseBody(tokenRulesBodySchema, raw);
  if (!parsed.ok) {
    return NextResponse.json(parsed.response.body, { status: parsed.response.status });
  }

  const auth = resolveAuthFromHeaders(req.headers, {
    internalApiToken: process.env.INTERNAL_API_TOKEN ?? null,
    cronSecret: process.env.CRON_SECRET ?? null,
  });

  const deps = resolveTokenRulesDeps();
  const result = await handleTokenRules(deps, { body: parsed.data, ctx: auth });
  return NextResponse.json(result.body, { status: result.status });
}
