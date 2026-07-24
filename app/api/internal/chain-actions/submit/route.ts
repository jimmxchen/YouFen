// GET /api/internal/chain-actions/submit — Vercel Cron: broadcast ready
// ChainActions. Internal-only (Bearer CRON_SECRET / INTERNAL_API_TOKEN).

import { NextResponse } from 'next/server';

import { fail } from '@/lib/api/core';
import { resolveChainDeps } from '@/lib/api/chain/deps';
import { handleChainSubmit } from '@/lib/api/chain/handlers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  let deps;
  try {
    deps = resolveChainDeps();
  } catch (e: unknown) {
    const bad = fail(500, 'CHAIN_RUNTIME_UNCONFIGURED', e instanceof Error ? e.message : 'runtime unavailable');
    return NextResponse.json(bad.body, { status: bad.status });
  }
  const url = new URL(req.url);
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw !== null ? Number(limitRaw) : undefined;
  const result = await handleChainSubmit(deps, { headers: req.headers, limit });
  return NextResponse.json(result.body, { status: result.status });
}
