// GET /api/public-records/:id/verify-v07 — public, rate-limited live verification
// for a v0.7 governance record (docs/BLOCKCHAIN-DESIGN-v0.7.md §6 #18). Reports
// { hashMatches, onChain, enforcementMatches } and their AND as `verified`.
//
// This is added ALONGSIDE the v0.6 `/verify` route (which is left byte-for-byte
// untouched): v0.6 records verify at /verify; v0.7 governance records, which also
// carry an enforcement projection to cross-check, verify here.
//
// The path is key-free by design (never builds the relayer wallet;
// BLOCKCHAIN-DESIGN §8) and reuses the v0.6 rate-limit machinery: the limiter key
// is derived from the trusted (proxy-written, rightmost) X-Forwarded-For hop, and
// requests with no trustworthy client identity fail open via an allow-all limiter
// so one anonymous caller can never 429 every other (reverse-DoS guard). See
// lib/api/public-records/{rate-limit,verify-client-key}.ts for the rationale.

import { NextResponse } from 'next/server';

import { resolvePublicRecordsV07Deps } from '../../../../../lib/api/public-records-v07/deps';
import { handleVerifyV07 } from '../../../../../lib/api/public-records-v07/handlers';
import { getVerifyRateLimiter } from '../../../../../lib/api/public-records/rate-limit';
import type { RateLimiter } from '../../../../../lib/api/public-records/rate-limit';
import { resolveVerifyClientKey } from '../../../../../lib/api/public-records/verify-client-key';

// Fail-open limiter for requests with no trustworthy client identity: it never
// stores state and never rejects, so unidentifiable traffic can neither be
// throttled into a shared bucket nor exhaust the in-memory key set.
const allowAllRateLimiter: RateLimiter = { allow: () => true };

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = resolvePublicRecordsV07Deps();
  const clientKey = resolveVerifyClientKey(req);
  const rateLimiter = clientKey === null ? allowAllRateLimiter : getVerifyRateLimiter();
  const result = await handleVerifyV07(
    {
      prisma: deps.prisma,
      reader: deps.reader,
      rateLimiter,
      explorerBaseUrl: deps.explorerBaseUrl,
    },
    { recordId: id, clientKey: clientKey ?? 'anonymous' },
  );
  return NextResponse.json(result.body, { status: result.status });
}
