// In-memory sliding-window rate limiter for GET /verify (BLOCKCHAIN-DESIGN §7:
// rate limit so public verification cannot flood the RPC).
//
// RED-TEAM NOTES:
//  1. Single process only. This counter lives in one Node process, so on
//     serverless / horizontally-scaled hosts each instance keeps its own window
//     and the effective cap multiplies by the instance count. A production
//     deployment must back this with a shared store (e.g. Redis INCR + EXPIRE).
//  2. Bounded memory. The key -> timestamps Map is bounded two ways so that a
//     caller who rotates the rate-limit key every request (e.g. a forged
//     X-Forwarded-For value at the route edge) cannot grow it without bound and
//     exhaust the process: (a) an amortized sweep reclaims keys whose whole
//     window has expired, and (b) a hard `maxKeys` cap evicts oldest entries if
//     a burst of unique keys floods within a single window before a sweep fires.
//  3. Key trust. This module rate-limits by whatever opaque key it is handed; it
//     cannot tell a genuine client identifier from a forged one. Rotating the
//     key per request still defeats the PER-KEY count limit — that must be
//     addressed at the route edge by deriving the key from a trusted source
//     (the platform's verified client IP, not an attacker-controlled header) or
//     by adding a shared/global backstop. See the task hand-off notes.
//
// This module is a demo placeholder for the shared-store production limiter.

export interface RateLimiter {
  /** Records a hit for `key` and returns whether it is within the window budget. */
  allow(key: string): boolean;
}

/**
 * A {@link RateLimiter} that also exposes the number of tracked keys, so the
 * bounded in-memory implementation's memory footprint can be observed/tested.
 */
export interface ManagedRateLimiter extends RateLimiter {
  /** Number of keys currently held in memory. */
  size(): number;
}

export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowMs: number;
  /** Injectable clock (ms). Defaults to Date.now; tests advance it deterministically. */
  readonly now?: () => number;
  /**
   * Hard upper bound on the number of tracked keys. When a burst of unique keys
   * would exceed it within a single window (before a sweep can reclaim expired
   * keys), the oldest-inserted keys are evicted. Backstop against key-flood OOM.
   */
  readonly maxKeys?: number;
}

/** Default key cap: bounds worst-case memory even under adversarial key churn. */
const DEFAULT_MAX_KEYS = 100_000;

/** Evict the `count` oldest-inserted keys (Map preserves insertion order). */
function evictOldest(hits: Map<string, readonly number[]>, count: number): void {
  let removed = 0;
  for (const key of hits.keys()) {
    if (removed >= count) {
      break;
    }
    hits.delete(key);
    removed += 1;
  }
}

/** Delete every key whose most recent hit has aged out of the window. */
function sweepExpired(hits: Map<string, readonly number[]>, windowStart: number): void {
  for (const [key, timestamps] of hits) {
    const last = timestamps[timestamps.length - 1];
    if (last === undefined || last <= windowStart) {
      hits.delete(key);
    }
  }
}

/**
 * Sliding-window limiter. Each key keeps the timestamps of its recent hits;
 * timestamps older than `windowMs` are dropped on every call, and a key is
 * allowed while it has fewer than `limit` live hits in the trailing window.
 *
 * Memory is bounded so a rotating/forged key cannot exhaust the process:
 * expired keys are reclaimed by an amortized per-window sweep, and `maxKeys`
 * caps the Map even under a same-window flood of unique keys.
 */
export function createRateLimiter(options: RateLimiterOptions): ManagedRateLimiter {
  const { limit, windowMs } = options;
  const clock = options.now ?? (() => Date.now());
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const hits = new Map<string, readonly number[]>();
  let lastSweepAt = clock();

  return {
    allow(key: string): boolean {
      const current = clock();
      const windowStart = current - windowMs;

      // Amortized sweep: at most once per window, reclaim keys whose entire
      // window has expired so churned keys do not accumulate without bound.
      if (current - lastSweepAt >= windowMs) {
        sweepExpired(hits, windowStart);
        lastSweepAt = current;
      }

      const live = (hits.get(key) ?? []).filter((t) => t > windowStart);

      if (live.length >= limit) {
        hits.set(key, live);
        return false;
      }

      // Hard backstop: if unique keys flood within a single window (before a
      // sweep can fire), evict oldest entries so the Map stays bounded.
      if (!hits.has(key) && hits.size >= maxKeys) {
        evictOldest(hits, hits.size - maxKeys + 1);
      }

      hits.set(key, [...live, current]);
      return true;
    },
    size(): number {
      return hits.size;
    },
  };
}

// Process-level singleton for the verify endpoint: 10 requests per 60s per key.
let verifyLimiter: ManagedRateLimiter | null = null;

/** Lazily-constructed shared limiter for GET /api/public-records/:id/verify. */
export function getVerifyRateLimiter(): RateLimiter {
  if (verifyLimiter === null) {
    verifyLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
  }
  return verifyLimiter;
}
