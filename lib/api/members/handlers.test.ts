import { describe, it, expect } from 'vitest';

import type { AuthContext } from '../core/auth';

import {
  defaultAuthorizeMember,
  handleEpochDetail,
  handleTokenBalance,
  handleTokenHistory,
  type EpochRow,
  type MemberBalanceRow,
  type MembersDeps,
  type MembersReader,
  type MintEventRow,
  type ReversalEventRow,
} from './handlers';

// ---- Fakes ----

function balanceRow(overrides: Partial<MemberBalanceRow> = {}): MemberBalanceRow {
  return {
    id: 'b1',
    communityId: 'c1',
    memberId: 'm1',
    totalBalance: 100n,
    activeGovernanceBalance: 40n,
    pendingGovernanceBalance: 10n,
    tokensEarnedCurrentEpoch: 20n,
    tokensEarnedLifetime: 120n,
    tokensReversedLifetime: 5n,
    lastContributionAt: new Date('2026-07-01T00:00:00.000Z'),
    lastMintAt: new Date('2026-07-10T00:00:00.000Z'),
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    ...overrides,
  };
}

function mintRow(id: string, at: string, over: Partial<MintEventRow> = {}): MintEventRow {
  return {
    id,
    amount: 50n,
    mintType: 'contribution',
    budgetSource: 'current_epoch',
    governanceStatus: 'active',
    memberBalanceBefore: 50n,
    memberBalanceAfter: 100n,
    ownershipPercentageBefore: 0.05,
    ownershipPercentageAfter: 0.1,
    reason: 'good work',
    publicRecordId: 'rec_' + id,
    createdAt: new Date(at),
    ...over,
  };
}

function reversalRow(id: string, at: string): ReversalEventRow {
  return {
    id,
    amount: 20n,
    reason: 'entry_error',
    totalBalanceAfter: 80n,
    activeGovernanceBalanceAfter: 20n,
    pendingGovernanceBalanceAfter: 10n,
    totalSupplyAfter: 980n,
    publicRecordId: 'rec_' + id,
    createdAt: new Date(at),
  };
}

function epochRow(over: Partial<EpochRow> = {}): EpochRow {
  return {
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
    ...over,
  };
}

interface FakeState {
  balance: MemberBalanceRow | null;
  supply: bigint | null;
  activeGovernanceTotal: bigint;
  mints: MintEventRow[];
  reversals: ReversalEventRow[];
  epoch: EpochRow | null;
}

function makeReader(state: FakeState): MembersReader {
  return {
    getBalance: async () => state.balance,
    getTokenState: async () =>
      state.supply === null ? null : { currentTotalSupply: state.supply },
    sumActiveGovernance: async () => state.activeGovernanceTotal,
    listMintEvents: async () => state.mints,
    listReversalEvents: async () => state.reversals,
    getEpoch: async () => state.epoch,
  };
}

function makeDeps(state: Partial<FakeState> = {}): { deps: MembersDeps; state: FakeState } {
  const full: FakeState = {
    balance: balanceRow(),
    supply: 1000n,
    activeGovernanceTotal: 200n,
    mints: [],
    reversals: [],
    epoch: epochRow(),
    ...state,
  };
  return { deps: { reader: makeReader(full), authorizeMember: defaultAuthorizeMember }, state: full };
}

// A trusted principal: authenticated internal/service caller (valid Bearer token).
const internal: AuthContext = { actorId: 'm1', isAdmin: false, isInternal: true };
// A caller asserting to *be* m1 via the spoofable x-youfen-actor-id header only:
// not admin, not internal. This is the IDOR vector and must be denied.
const spoofedSelf: AuthContext = { actorId: 'm1', isAdmin: false, isInternal: false };
const other: AuthContext = { actorId: 'm2', isAdmin: false, isInternal: false };
const admin: AuthContext = { actorId: 'admin1', isAdmin: true, isInternal: false };
const anon: AuthContext = { actorId: null, isAdmin: false, isInternal: false };

// ---- token-balance ----

describe('handleTokenBalance', () => {
  it('returns balances plus derived percentages for a trusted internal caller', async () => {
    const { deps } = makeDeps();
    const res = await handleTokenBalance(deps, { memberId: 'm1', ctx: internal });

    expect(res.status).toBe(200);
    const d = res.body.data as Record<string, unknown>;
    expect(d.totalBalance).toBe('100');
    expect(d.activeGovernanceBalance).toBe('40');
    // ownership = 100/1000, governance = 40/200
    expect(d.ownershipPercentage).toBeCloseTo(0.1);
    expect(d.governancePercentage).toBeCloseTo(0.2);
  });

  it('allows an admin to read any member', async () => {
    const { deps } = makeDeps();
    const res = await handleTokenBalance(deps, { memberId: 'm1', ctx: admin });
    expect(res.status).toBe(200);
  });

  it('forbids a different member (403)', async () => {
    const { deps } = makeDeps();
    const res = await handleTokenBalance(deps, { memberId: 'm1', ctx: other });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('forbids a caller whose only claim to be the member is the spoofable actor header (IDOR, 403)', async () => {
    const { deps } = makeDeps();
    const res = await handleTokenBalance(deps, { memberId: 'm1', ctx: spoofedSelf });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });

  it('forbids an anonymous caller (403)', async () => {
    const { deps } = makeDeps();
    const res = await handleTokenBalance(deps, { memberId: 'm1', ctx: anon });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the member has no balance row', async () => {
    const { deps } = makeDeps({ balance: null });
    const res = await handleTokenBalance(deps, { memberId: 'm1', ctx: internal });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });

  it('handles zero supply without dividing by zero', async () => {
    const { deps } = makeDeps({ supply: 0n, activeGovernanceTotal: 0n });
    const res = await handleTokenBalance(deps, { memberId: 'm1', ctx: internal });
    const d = res.body.data as Record<string, unknown>;
    expect(d.ownershipPercentage).toBe(0);
    expect(d.governancePercentage).toBe(0);
  });

  it('recomputes derived percentages at query time (no persistence)', async () => {
    const state: FakeState = {
      balance: balanceRow({ totalBalance: 100n }),
      supply: 1000n,
      activeGovernanceTotal: 200n,
      mints: [],
      reversals: [],
      epoch: null,
    };
    const deps: MembersDeps = {
      reader: makeReader(state),
      authorizeMember: defaultAuthorizeMember,
    };

    const first = await handleTokenBalance(deps, { memberId: 'm1', ctx: internal });
    expect((first.body.data as Record<string, unknown>).ownershipPercentage).toBeCloseTo(0.1);

    // Supply halves elsewhere; the very next read reflects it immediately.
    state.supply = 500n;
    const second = await handleTokenBalance(deps, { memberId: 'm1', ctx: internal });
    expect((second.body.data as Record<string, unknown>).ownershipPercentage).toBeCloseTo(0.2);
  });
});

// ---- token-history ----

describe('handleTokenHistory', () => {
  it('merges mint + reversal events sorted by createdAt desc', async () => {
    const { deps } = makeDeps({
      mints: [
        mintRow('mA', '2026-07-01T00:00:00.000Z'),
        mintRow('mB', '2026-07-05T00:00:00.000Z'),
      ],
      reversals: [reversalRow('rA', '2026-07-03T00:00:00.000Z')],
    });
    const res = await handleTokenHistory(deps, { memberId: 'm1', ctx: internal, page: 1, limit: 20 });

    expect(res.status).toBe(200);
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.id)).toEqual(['mB', 'rA', 'mA']);
    expect(rows[0].kind).toBe('mint');
    expect(rows[1].kind).toBe('reversal');
    expect(res.body.meta).toEqual({ total: 3, page: 1, limit: 20 });
    // bigint amounts serialized to strings
    expect(rows[0].amount).toBe('50');
  });

  it('paginates the merged stream', async () => {
    const { deps } = makeDeps({
      mints: [
        mintRow('m1', '2026-07-01T00:00:00.000Z'),
        mintRow('m2', '2026-07-02T00:00:00.000Z'),
        mintRow('m3', '2026-07-03T00:00:00.000Z'),
      ],
      reversals: [reversalRow('r1', '2026-07-04T00:00:00.000Z')],
    });
    const res = await handleTokenHistory(deps, { memberId: 'm1', ctx: internal, page: 2, limit: 2 });
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(res.body.meta).toEqual({ total: 4, page: 2, limit: 2 });
    // desc: r1, m3, m2, m1 -> page 2 (limit 2) => m2, m1
    expect(rows.map((r) => r.id)).toEqual(['m2', 'm1']);
  });

  it('forbids a different member (403)', async () => {
    const { deps } = makeDeps();
    const res = await handleTokenHistory(deps, { memberId: 'm1', ctx: other, page: 1, limit: 20 });
    expect(res.status).toBe(403);
  });

  it('forbids a spoofed-actor caller from reading a member ledger (IDOR, 403)', async () => {
    const { deps } = makeDeps();
    const res = await handleTokenHistory(deps, {
      memberId: 'm1',
      ctx: spoofedSelf,
      page: 1,
      limit: 20,
    });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('FORBIDDEN');
  });
});

// ---- epoch detail ----

describe('handleEpochDetail', () => {
  it('returns the full §24.2 field set including publicRecordId', async () => {
    const { deps } = makeDeps();
    const res = await handleEpochDetail(deps, { epochId: 'e1' });
    expect(res.status).toBe(200);
    const d = res.body.data as Record<string, unknown>;
    expect(d.epochNumber).toBe(3);
    expect(d.openingSupply).toBe('1000');
    expect(d.baseMintBudget).toBe('50');
    expect(d.status).toBe('active');
    expect(d.publicRecordId).toBe('rec_e1');
  });

  it('returns 404 for an unknown epoch', async () => {
    const { deps } = makeDeps({ epoch: null });
    const res = await handleEpochDetail(deps, { epochId: 'ghost' });
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});
