import { describe, it, expect } from 'vitest';

import { createRateLimiter, getVerifyRateLimiter } from './rate-limit';

describe('createRateLimiter (in-memory sliding window)', () => {
  it('allows up to the limit within a window then blocks', () => {
    let clock = 1_000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => clock });

    expect(limiter.allow('ip-1')).toBe(true);
    expect(limiter.allow('ip-1')).toBe(true);
    expect(limiter.allow('ip-1')).toBe(true);
    // 4th hit inside the same window is rejected.
    expect(limiter.allow('ip-1')).toBe(false);
    expect(limiter.allow('ip-1')).toBe(false);
  });

  it('re-allows once the sliding window advances past windowMs', () => {
    let clock = 1_000;
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: () => clock });

    expect(limiter.allow('ip-2')).toBe(true);
    expect(limiter.allow('ip-2')).toBe(true);
    expect(limiter.allow('ip-2')).toBe(false);

    // Advance the clock so the earlier hits fall outside the window.
    clock += 10_001;
    expect(limiter.allow('ip-2')).toBe(true);
    expect(limiter.allow('ip-2')).toBe(true);
    expect(limiter.allow('ip-2')).toBe(false);
  });

  it('partially frees capacity as individual hits age out', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 100, now: () => clock });

    clock = 10;
    expect(limiter.allow('k')).toBe(true); // hit at t=10
    clock = 50;
    expect(limiter.allow('k')).toBe(true); // hit at t=50
    clock = 60;
    expect(limiter.allow('k')).toBe(false); // full: both hits still in window

    // Move to t=120: the t=10 hit (>100 old) expires, the t=50 hit remains.
    clock = 120;
    expect(limiter.allow('k')).toBe(true);
  });

  it('tracks keys independently', () => {
    let clock = 1_000;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => clock });

    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    // A different key has its own budget.
    expect(limiter.allow('b')).toBe(true);
    expect(limiter.allow('b')).toBe(false);
  });

  it('defaults now to Date.now when not injected', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.allow('x')).toBe(true);
    expect(limiter.allow('x')).toBe(false);
  });
});

describe('createRateLimiter (bounded memory under key churn)', () => {
  it('evicts idle keys once their window has fully expired (no unbounded growth)', () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, now: () => clock });

    // A flood of distinct keys, each hit once inside the first window.
    for (let i = 0; i < 200; i += 1) {
      expect(limiter.allow(`churn-${i}`)).toBe(true);
    }
    expect(limiter.size()).toBe(200);

    // Advance past the window; the next call triggers an amortized sweep that
    // drops every key whose entire window has expired.
    clock = 2_001;
    expect(limiter.allow('live')).toBe(true);
    // Only the single live key survives — the 200 churned keys are reclaimed.
    expect(limiter.size()).toBe(1);
  });

  it('caps tracked keys under a same-window flood of unique keys (OOM backstop)', () => {
    let clock = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxKeys: 10,
      now: () => clock,
    });

    // 1000 unique keys inside a single window (no sweep can fire): the hard cap
    // must keep the Map bounded regardless.
    for (let i = 0; i < 1_000; i += 1) {
      limiter.allow(`flood-${i}`);
    }
    expect(limiter.size()).toBeLessThanOrEqual(10);
  });

  it('still enforces the per-key limit for a key that survives eviction pressure', () => {
    let clock = 0;
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 60_000,
      maxKeys: 5,
      now: () => clock,
    });

    expect(limiter.allow('victim')).toBe(true);
    expect(limiter.allow('victim')).toBe(true);
    expect(limiter.allow('victim')).toBe(false);
  });
});

describe('getVerifyRateLimiter', () => {
  it('returns a stable process-level singleton (10 per 60s)', () => {
    const a = getVerifyRateLimiter();
    const b = getVerifyRateLimiter();
    expect(a).toBe(b);

    // 10 allowed for a fresh key, 11th blocked.
    const key = `verify-singleton-${Math.random()}`;
    for (let i = 0; i < 10; i += 1) {
      expect(a.allow(key)).toBe(true);
    }
    expect(a.allow(key)).toBe(false);
  });
});
