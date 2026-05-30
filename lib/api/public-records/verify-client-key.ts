// Rate-limit key derivation for the public verify endpoint (BLOCKCHAIN-DESIGN §7).
// Lives outside the Next route file because Next.js route modules may only export
// HTTP-method handlers + config — any other export fails the build's Route type
// check. The route imports these; unit tests target them directly here.

// Number of trusted reverse-proxy hops in front of the verify endpoint. Default 1
// (a single edge proxy, as on Railway / Fly). Operators with additional trusted
// proxies set TRUSTED_PROXY_HOPS so the caller IP is read that many entries from
// the right of X-Forwarded-For instead of the rightmost one.
export function trustedProxyHops(): number {
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
