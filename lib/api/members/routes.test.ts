import { describe, it, expect, afterEach, beforeEach } from 'vitest';

import { GET as getBalance } from '../../../app/api/members/[id]/token-balance/route';
import { GET as getHistory } from '../../../app/api/members/[id]/token-history/route';
import { GET as getEpoch } from '../../../app/api/token-epochs/[id]/route';

import { setDepsForTesting } from './deps';
import {
  defaultAuthorizeMember,
  type EpochRow,
  type MemberBalanceRow,
  type MembersDeps,
  type MembersReader,
} from './handlers';

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

const balance: MemberBalanceRow = {
  id: 'b1',
  communityId: 'c1',
  memberId: 'm1',
  totalBalance: 100n,
  activeGovernanceBalance: 40n,
  pendingGovernanceBalance: 10n,
  tokensEarnedCurrentEpoch: 20n,
  tokensEarnedLifetime: 120n,
  tokensReversedLifetime: 5n,
  lastContributionAt: null,
  lastMintAt: null,
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-10T00:00:00.000Z'),
};

const epoch: EpochRow = {
  id: 'e1',
  communityId: 'c1',
  epochNumber: 3,
  openingSupply: 1000n,
  inflationRateBps: 500,
  baseMintBudget: 50n,
  advanceDebtFromPreviousEpoch: 5n,
  effectiveRegularBudget: 45n,
  maxAdvanceAmount: 10n,
  regularMintedAmount: 30n,
  advancedMintedAmount: 8n,
  unusedRegularBudget: 15n,
  status: 'active',
  startTime: new Date('2026-07-01T00:00:00.000Z'),
  endTime: new Date('2026-08-01T00:00:00.000Z'),
  closedAt: null,
  publicRecordId: 'rec_e1',
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
};

function reader(over: Partial<MembersReader> = {}): MembersReader {
  return {
    getBalance: async () => balance,
    getTokenState: async () => ({ currentTotalSupply: 1000n }),
    sumActiveGovernance: async () => 200n,
    listMintEvents: async () => [],
    listReversalEvents: async () => [],
    getEpoch: async () => epoch,
    ...over,
  };
}

function install(over: Partial<MembersReader> = {}): void {
  const deps: MembersDeps = { reader: reader(over), authorizeMember: defaultAuthorizeMember };
  setDepsForTesting(deps);
}

// A trusted internal/service principal authenticates with a Bearer token matching
// INTERNAL_API_TOKEN; that is what the route adapter checks. The unauthenticated
// x-youfen-actor-id header alone must NOT grant access (IDOR).
const INTERNAL_TOKEN = 'test-internal-token';
const authedHeaders = (actorId?: string): Record<string, string> => ({
  authorization: `Bearer ${INTERNAL_TOKEN}`,
  ...(actorId ? { 'x-youfen-actor-id': actorId } : {}),
});

let priorInternalToken: string | undefined;
beforeEach(() => {
  priorInternalToken = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = INTERNAL_TOKEN;
});

afterEach(() => {
  setDepsForTesting(null);
  if (priorInternalToken === undefined) {
    delete process.env.INTERNAL_API_TOKEN;
  } else {
    process.env.INTERNAL_API_TOKEN = priorInternalToken;
  }
});

describe('GET /api/members/[id]/token-balance route', () => {
  it('passes the 200 envelope through for a trusted internal caller (Bearer token)', async () => {
    install();
    const res = await getBalance(
      new Request('http://t/api/members/m1/token-balance', {
        headers: authedHeaders('m1'),
      }),
      ctx('m1'),
    );
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.success).toBe(true);
    expect(b.data.ownershipPercentage).toBeCloseTo(0.1);
  });

  it('returns 403 for a different actor', async () => {
    install();
    const res = await getBalance(
      new Request('http://t/api/members/m1/token-balance', {
        headers: { 'x-youfen-actor-id': 'someone-else' },
      }),
      ctx('m1'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when only the unauthenticated x-youfen-actor-id header is set (IDOR)', async () => {
    install();
    const res = await getBalance(
      new Request('http://t/api/members/m1/token-balance', {
        headers: { 'x-youfen-actor-id': 'm1' },
      }),
      ctx('m1'),
    );
    expect(res.status).toBe(403);
    const b = await res.json();
    expect(b.error?.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/members/[id]/token-history route', () => {
  it('passes page/limit through and returns meta', async () => {
    install();
    const res = await getHistory(
      new Request('http://t/api/members/m1/token-history?page=1&limit=5', {
        headers: authedHeaders('m1'),
      }),
      ctx('m1'),
    );
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.meta).toEqual({ total: 0, page: 1, limit: 5 });
  });
});

describe('GET /api/token-epochs/[id] route', () => {
  it('is public and returns the epoch detail', async () => {
    install();
    const res = await getEpoch(new Request('http://t/api/token-epochs/e1'), ctx('e1'));
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.data.epochNumber).toBe(3);
    expect(b.data.openingSupply).toBe('1000');
  });

  it('returns 404 for a missing epoch', async () => {
    install({ getEpoch: async () => null });
    const res = await getEpoch(new Request('http://t/api/token-epochs/ghost'), ctx('ghost'));
    expect(res.status).toBe(404);
  });
});
