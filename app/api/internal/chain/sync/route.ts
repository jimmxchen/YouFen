// GET /api/internal/chain/sync — Vercel Cron: getLogs -> ChainEvent -> fold
// projections (confirmed balances). Internal-only, idempotent.

import { NextResponse } from 'next/server';

import { fail } from '@/lib/api/core';
import { resolveChainDeps } from '@/lib/api/chain/deps';
import { handleChainSync } from '@/lib/api/chain/handlers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<NextResponse> {
  let deps;
  try {
    deps = resolveChainDeps();
  } catch (e: unknown) {
    const bad = fail(500, 'CHAIN_RUNTIME_UNCONFIGURED', e instanceof Error ? e.message : 'runtime unavailable');
    return NextResponse.json(bad.body, { status: bad.status });
  }
  const result = await handleChainSync(deps, { headers: req.headers });
  return NextResponse.json(result.body, { status: result.status });
}
