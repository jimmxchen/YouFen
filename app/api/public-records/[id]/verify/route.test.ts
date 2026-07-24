import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import { setBlockchainRuntimeForTesting } from '../../../../../lib/blockchain/runtime';
import type { BlockchainRuntime, PublicRecordDTO, VerifyResult } from '../../../../../lib/blockchain/types';

import { GET as getVerify } from './route';
import { resolveVerifyClientKey } from '../../../../../lib/api/public-records/verify-client-key';

// resolveVerifyClientKey is the security-critical unit: it must derive the
// limiter key from the proxy-written (rightmost) X-Forwarded-For entry, never
// from the attacker-controlled leftmost entry, and must never fold header-less
// callers into one shared bucket.

const req = (headers: Record<string, string> = {}): Request =>
  new Request('http://t/api/public-records/r1/verify', { headers });

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

afterEach(() => {
  setBlockchainRuntimeForTesting(null);
  vi.restoreAllMocks();
  delete process.env.TRUSTED_PROXY_HOPS;
});

describe('resolveVerifyClientKey', () => {
  it('keys on the trusted (rightmost) hop, ignoring a spoofed leftmost value', () => {
    // A single trusted proxy (hops=1) appends the real caller IP on the right.
    const spoofedA = resolveVerifyClientKey(req({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }));
    const spoofedB = resolveVerifyClientKey(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }));

    // Both requests share the same trusted client IP -> same limiter bucket,
    // so an attacker cannot mint a fresh bucket per request by rotating the
    // leftmost value.
    expect(spoofedA).not.toBeNull();
    expect(spoofedA).toBe(spoofedB);
    expect(spoofedA).toContain('203.0.113.7');
    expect(spoofedA).not.toContain('9.9.9.9');
    expect(spoofedA).not.toContain('1.2.3.4');
  });

  it('distinguishes genuinely different trusted clients', () => {
    const one = resolveVerifyClientKey(req({ 'x-forwarded-for': '203.0.113.7' }));
    const two = resolveVerifyClientKey(req({ 'x-forwarded-for': '203.0.113.8' }));
    expect(one).not.toBe(two);
  });

  it('honors TRUSTED_PROXY_HOPS when more than one proxy is in front', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    // chain: client, realClient, edgeProxy -> with 2 trusted hops the caller is
    // the 2nd-from-right entry ("realClient" = 198.51.100.5).
    const key = resolveVerifyClientKey(
      req({ 'x-forwarded-for': 'evil-spoof, 198.51.100.5, 10.0.0.1' }),
    );
    expect(key).toContain('198.51.100.5');
    expect(key).not.toContain('evil-spoof');
    expect(key).not.toContain('10.0.0.1');
  });

  it('returns null when no trustworthy client identity is present', () => {
    // No X-Forwarded-For at all: the request cannot be attributed to a client.
    expect(resolveVerifyClientKey(req())).toBeNull();
    // Empty / whitespace-only header must not resolve to a shared bucket either.
    expect(resolveVerifyClientKey(req({ 'x-forwarded-for': '   ' }))).toBeNull();
    expect(resolveVerifyClientKey(req({ 'x-forwarded-for': ' , ' }))).toBeNull();
  });
});

// ---- Route-level fail-open behavior for header-less requests ----

function dto(overrides: Partial<PublicRecordDTO> = {}): PublicRecordDTO {
  return {
    id: 'r1',
    communityId: 'c_1',
    sourceTable: 'TokenMintEvent',
    sourceId: 'mint_1',
    recordType: 'token_mint',
    status: 'verified',
    envelopeJson: '{"schema":"youfen.record.v1"}',
    recordHash: ('0x' + 'ab'.repeat(32)) as PublicRecordDTO['recordHash'],
    txHash: '0x' + 'ef'.repeat(32),
    assignedNonce: 1,
    blockNumber: 42,
    blockHash: '0x' + '00'.repeat(32),
    submittedAt: new Date(0),
    confirmedAt: new Date('2026-07-23T00:00:00.000Z'),
    attemptEpoch: 1,
    lastError: null,
    supersededByRecordId: null,
    createdAt: new Date('2026-07-20T00:00:00.000Z'),
    updatedAt: new Date('2026-07-23T00:00:00.000Z'),
    ...overrides,
  };
}

function verifyResult(): VerifyResult {
  const hash = ('0x' + 'ab'.repeat(32)) as VerifyResult['storedHash'];
  return {
    verified: true,
    hashMatches: true,
    onChain: true,
    computedHash: hash,
    storedHash: hash,
    txHash: '0x' + 'ef'.repeat(32),
    blockNumber: 42,
    explorerUrl: 'https://explorer.test/tx/0x',
    failureReason: undefined,
  };
}

function installRuntime(): void {
  const records = {
    getById: vi.fn().mockResolvedValue(dto()),
    getWithSource: vi.fn(),
    requestSubmission: vi.fn(),
    transition: vi.fn(),
    createPendingRecord: vi.fn(),
    patchInStatus: vi.fn(),
    markSuperseded: vi.fn(),
  };
  const runtime = {
    config: { internalApiToken: 't', explorerBaseUrl: 'https://explorer.test' },
    records,
    injective: { verifier: { verifyRecord: vi.fn().mockResolvedValue(verifyResult()) } },
  } as unknown as BlockchainRuntime;
  setBlockchainRuntimeForTesting(runtime);
}

describe('GET /verify rate-limit isolation', () => {
  beforeEach(() => installRuntime());

  it('never 429s header-less requests, even far beyond the per-key budget', async () => {
    // Reverse-DoS guard: without a trusted client IP, requests must not share a
    // single bucket that one caller could exhaust to 429 everybody else.
    for (let i = 0; i < 25; i += 1) {
      const res = await getVerify(req(), ctx('r1'));
      expect(res.status).toBe(200);
    }
  });
});
