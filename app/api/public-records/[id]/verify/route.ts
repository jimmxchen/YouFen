// GET /api/public-records/:id/verify — public, rate-limited live verification
// (BLOCKCHAIN-DESIGN §7). Thin adapter over the pure handler.
//
// This endpoint is public and verification is a pure read, so it deliberately
// does NOT build the blockchain runtime: that would force BLOCKCHAIN_PRIVATE_KEY
// into the Web env and instantiate the recorder wallet (with an eager resyncNonce
// RPC) in the Web process, breaking the key isolation the design mandates
// (BLOCKCHAIN-DESIGN §8; .env.example "Worker env only"). resolveVerifyDeps wires
// only a key-free verifier + DB read path — see verify-deps.ts.
//
// Rate-limit keying is security-critical. This endpoint is designed to run
// behind a single trusted reverse proxy (Railway / Fly), which appends the real
// caller IP as the *rightmost* X-Forwarded-For entry. We derive the limiter key
// from that proxy-written value — counted `hops` positions from the right —
// because everything to the LEFT of it is attacker-controlled and trivially
// forged. The previous code keyed on the *leftmost* entry, which let a client
// rotate a fake value per request to mint a fresh limiter bucket and bypass the
// limit entirely, defeating the "don't let public verify flood the RPC" goal.
//
// When no trustworthy client identity is present (e.g. a request that did not
// pass through the proxy, so X-Forwarded-For is absent), we deliberately do NOT
// fold all such callers into one shared bucket: that shared bucket let a single
// client's traffic 429 every other anonymous caller (a reverse-DoS). Instead we
// fail open for the unidentifiable case via an allow-all limiter, which also
// keeps the in-memory limiter's key set bounded. Production MUST sit behind a
// proxy that sets X-Forwarded-For (and, for a shared/multi-instance deployment,
// back the limiter with Redis — see lib/api/public-records/rate-limit.ts and
// the task notes).
//
// SCAFFOLD NOTE: not yet exercised against a live Next server — see task notes.

import { NextResponse } from 'next/server';

import { handleVerify } from '../../../../../lib/api/public-records/handlers';
import { getVerifyRateLimiter } from '../../../../../lib/api/public-records/rate-limit';
import type { RateLimiter } from '../../../../../lib/api/public-records/rate-limit';
import { resolveVerifyDeps } from '../../../../../lib/api/public-records/verify-deps';

// Number of trusted reverse-proxy hops in front of this endpoint. Default 1
// (a single edge proxy, as on Railway / Fly). Operators with additional trusted
// proxies set TRUSTED_PROXY_HOPS so the caller IP is read that many entries from
// the right of X-Forwarded-For instead of the rightmost one.
function trustedProxyHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS ?? '1');
  return Number.isInteger(raw) && raw >= 1 ? raw : 1;
}

/**
 * Derive the rate-limit key from the trusted (proxy-written) X-Forwarded-For
 * hop, or `null` when the request carries no trustworthy client identity.
 *
 * Only the entry `hops` positions from the right is trusted; entries to the left
 * are client-supplied and must never be used for keying. Returns `null` (rather
 * than a shared sentinel) when the header is missing or empty so the caller can
 * avoid pooling unidentifiable requests into one bucket.
 */
export function resolveVerifyClientKey(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded === null) {
    return null;
  }

  const chain = forwarded
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (chain.length === 0) {
    return null;
  }

  const hops = trustedProxyHops();
  const index = Math.max(0, chain.length - hops);
  const ip = chain[index];
  if (ip === undefined || ip.length === 0) {
    return null;
  }
  return `ip:${ip.toLowerCase()}`;
}

// Fail-open limiter for requests with no trustworthy client identity: it never
// stores state and never rejects, so unidentifiable traffic can neither be
// throttled into a shared bucket nor exhaust the in-memory key set.
const allowAllRateLimiter: RateLimiter = { allow: () => true };

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const deps = await resolveVerifyDeps();
  const clientKey = resolveVerifyClientKey(req);
  const rateLimiter = clientKey === null ? allowAllRateLimiter : getVerifyRateLimiter();
  const result = await handleVerify(
    { verifier: deps.verifier, records: deps.records, rateLimiter },
    { recordId: id, clientKey: clientKey ?? 'anonymous' },
  );
  return NextResponse.json(result.body, { status: result.status });
}
