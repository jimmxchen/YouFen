import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ClaudeClient } from '../../ai';
import type { IdempotencyRow, IdempotencyStore } from '../core/idempotency';

import { setDepsForTesting } from './deps';
import type { ContributionRow, ContributionsDb, ContributionsDeps, MintPort } from './handlers';

// Route adapters under test (thin Next 15 wrappers around the pure handlers).
import { POST as postCreate } from '../../../app/api/contributions/route';
import { POST as postAnalyze } from '../../../app/api/contributions/[id]/analyze/route';
import { POST as postApprove } from '../../../app/api/contributions/[id]/approve/route';
import { POST as postMint } from '../../../app/api/contributions/[id]/mint/route';
import { POST as postReject } from '../../../app/api/contributions/[id]/reject/route';

// ---- Shared fakes --------------------------------------------------------

function contributionRow(overrides: Partial<ContributionRow> = {}): ContributionRow {
  return {
    id: 'ct_1',
    communityId: 'c_1',
    memberId: 'm_1',
    description: 'Fixed a bug',
    type: 'code',
    ruleId: 'rule_1',
    suggestedTokenAmount: 100n,
    approvedTokenAmount: null,
    status: 'pending',
    aiReason: null,
    evidence: ['https://pr/1'],
    submittedBy: 'm_1',
    ...overrides,
  };
}

function makeDb(overrides: Partial<ContributionsDb> = {}): ContributionsDb {
  return {
    createContribution: vi.fn().mockResolvedValue({ id: 'ct_new', status: 'pending' }),
    findContribution: vi.fn().mockResolvedValue(contributionRow()),
    approveIfPending: vi.fn().mockResolvedValue(1),
    rejectIfPending: vi.fn().mockResolvedValue(1),
    findCurrentEpochMintEvents: vi.fn().mockResolvedValue([]),
    findMemberRole: vi.fn().mockResolvedValue('member'),
    // 默认：被提名的第二审批人是本社区 manager（合法路径）
    findMemberContext: vi.fn().mockResolvedValue({ communityId: 'c_1', role: 'manager' }),
    findActiveEpoch: vi.fn().mockResolvedValue({
      epochNumber: 3,
      baseMintBudget: 10_000n,
      effectiveRegularBudget: 10_000n,
      regularMintedAmount: 0n,
      advancedMintedAmount: 0n,
      maxAdvanceAmount: 2_500n,
      advanceDebtFromPreviousEpoch: 0n,
    }),
    findBalance: vi.fn().mockResolvedValue({ tokensEarnedCurrentEpoch: 0n }),
    findCurrentPolicy: vi.fn().mockResolvedValue({
      policyVersion: 2,
      memberMintCapRateBps: 2_000,
      rules: [{ id: 'rule_1', name: 'Bug fix', tokenAmount: 100 }],
    }),
    ...overrides,
  };
}

function makeMint(overrides: Partial<MintPort> = {}): MintPort {
  return {
    mintForContribution: vi.fn().mockResolvedValue({
      mintEvents: [
        { id: 'mint_1', amount: 100n, budgetSource: 'current_epoch', governanceStatus: 'active', publicRecordId: 'pr_1' },
      ],
      memberBalanceAfter: 100n,
      totalSupplyAfter: 1_100n,
    }),
    ...overrides,
  };
}

function memoryStore(): IdempotencyStore {
  const rows = new Map<string, IdempotencyRow>();
  return {
    find: (endpoint, key) => Promise.resolve(rows.get(`${endpoint} ${key}`) ?? null),
    save: (endpoint, key, requestHash, responseStatus, responseBody) => {
      rows.set(`${endpoint} ${key}`, { requestHash, responseStatus, responseBody });
      return Promise.resolve();
    },
  };
}

function fakeAiClient(): ClaudeClient {
  return { complete: vi.fn().mockResolvedValue('{"matchedRuleName":"Bug fix","suggestedTokenAmount":100}') };
}

function installDeps(overrides: Partial<ContributionsDeps> = {}): ContributionsDeps {
  const d: ContributionsDeps = {
    db: makeDb(),
    mint: makeMint(),
    idempotency: memoryStore(),
    authorizeAdmin: () => true,
    aiClient: fakeAiClient(),
    now: () => new Date('2026-07-23T00:00:00.000Z'),
    ...overrides,
  };
  setDepsForTesting(d);
  return d;
}

// ---- Request builders ----------------------------------------------------

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://t/api/contributions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** A request with a raw (possibly non-JSON) string body. */
function rawReq(raw: string, headers: Record<string, string> = {}): Request {
  return new Request('http://t/api/contributions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: raw,
  });
}

const MEMBER_HEADERS = { 'x-youfen-actor-id': 'm_1' };
const ADMIN_HEADERS = { 'x-youfen-actor-id': 'admin_1' };
const params = (id: string): { params: Promise<{ id: string }> } => ({ params: Promise.resolve({ id }) });

async function json(res: Response): Promise<{ success: boolean; data: unknown; error: { code: string } | null }> {
  return (await res.json()) as { success: boolean; data: unknown; error: { code: string } | null };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  setDepsForTesting(null);
});

// ==========================================================================
// POST /api/contributions
// ==========================================================================

describe('POST /api/contributions route', () => {
  it('403 for an anonymous caller', async () => {
    installDeps();
    const res = await postCreate(req(validBody(), { 'Idempotency-Key': 'k1' }));
    expect(res.status).toBe(403);
    expect((await json(res)).error?.code).toBe('FORBIDDEN');
  });

  it('400 when the Idempotency-Key header is missing (幂等 example 1)', async () => {
    installDeps();
    const res = await postCreate(req(validBody(), MEMBER_HEADERS));
    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('201 for a member, then replays without a second create (幂等 example 2)', async () => {
    const d = installDeps();
    const headers = { ...MEMBER_HEADERS, 'Idempotency-Key': 'k-replay' };
    const first = await postCreate(req(validBody(), headers));
    const second = await postCreate(req(validBody(), headers));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await json(first)).data).toEqual({ contributionId: 'ct_new', status: 'pending' });
    expect(d.db.createContribution).toHaveBeenCalledTimes(1);
  });

  it('400 VALIDATION_ERROR for a malformed JSON body', async () => {
    installDeps();
    const res = await postCreate(rawReq('{ not json', { ...MEMBER_HEADERS, 'Idempotency-Key': 'k2' }));
    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe('VALIDATION_ERROR');
  });
});

// ==========================================================================
// The four :id endpoints
// ==========================================================================

describe('POST /api/contributions/:id/analyze route', () => {
  it('awaits the async param and returns 200 with the analysis', async () => {
    installDeps();
    const res = await postAnalyze(req(undefined, ADMIN_HEADERS), params('ct_1'));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.data as { degraded: boolean }).degraded).toBe(false);
  });

  it('403 when authorizeAdmin denies', async () => {
    installDeps({ authorizeAdmin: () => false });
    const res = await postAnalyze(req(undefined, MEMBER_HEADERS), params('ct_1'));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/contributions/:id/approve route', () => {
  it('200 and persists aiReason on approve', async () => {
    const d = installDeps();
    const res = await postApprove(
      req({ approvedTokenAmount: '80', ruleId: 'rule_1', aiReason: 'ok' }, ADMIN_HEADERS),
      params('ct_1'),
    );
    expect(res.status).toBe(200);
    expect(d.db.approveIfPending).toHaveBeenCalledWith(
      'ct_1',
      expect.objectContaining({ aiReason: 'ok', approvedTokenAmount: 80n, reviewedBy: 'admin_1' }),
    );
  });

  it('400 for a malformed JSON body', async () => {
    installDeps();
    const res = await postApprove(rawReq('nope', ADMIN_HEADERS), params('ct_1'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/contributions/:id/mint route', () => {
  it('201 with jsonSafe bigint balances', async () => {
    installDeps();
    const res = await postMint(req({}, ADMIN_HEADERS), params('ct_1'));
    expect(res.status).toBe(201);
    const data = (await json(res)).data as { memberBalanceAfter: string; totalSupplyAfter: string };
    expect(data.memberBalanceAfter).toBe('100');
    expect(data.totalSupplyAfter).toBe('1100');
  });

  it('409 INSUFFICIENT_BUDGET carries the advancePath hint', async () => {
    const err = Object.assign(new Error('exhausted'), { code: 'INSUFFICIENT_BUDGET' });
    installDeps({ mint: makeMint({ mintForContribution: vi.fn().mockRejectedValue(err) }) });
    const res = await postMint(req({}, ADMIN_HEADERS), params('ct_1'));
    expect(res.status).toBe(409);
    const body = await json(res);
    const details = (body.error as unknown as { details: { advancePath: string } }).details;
    expect(details.advancePath).toBe('POST /api/token-advances');
  });
});

describe('POST /api/contributions/:id/reject route', () => {
  it('200 rejects a pending contribution for an admin', async () => {
    installDeps();
    const res = await postReject(req(undefined, ADMIN_HEADERS), params('ct_1'));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({ contributionId: 'ct_1', status: 'rejected' });
  });

  it('403 when authorizeAdmin denies', async () => {
    installDeps({ authorizeAdmin: () => false });
    const res = await postReject(req(undefined, MEMBER_HEADERS), params('ct_1'));
    expect(res.status).toBe(403);
  });
});

function validBody(): Record<string, unknown> {
  return {
    communityId: 'c_1',
    memberId: 'm_1',
    description: 'Fixed a bug',
    suggestedTokenAmount: '100',
    evidence: ['https://pr/1'],
    submittedBy: 'm_1',
  };
}
