import { describe, expect, it } from 'vitest';

import { createEpochService, type EpochServiceDeps } from './epoch-service';
import { EngineError } from './errors';
import {
  makeFakeBuildEnvelope,
  makeFakeEngineDb,
  makeFakeRecordsPort,
  type FakeEngineDb,
} from './testing/fake-engine-db';
import type { EngineDelegate, EngineTx, PolicyActivationPort } from './types';

const FIXED_NOW = new Date('2026-07-23T00:00:00.000Z');
const EPOCH1_END = new Date('2026-02-01T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Test doubles / helpers
// ---------------------------------------------------------------------------

interface FakePolicyActivation extends PolicyActivationPort {
  readonly calls: Array<{ communityId: string; nextEpochNumber: number }>;
}

type ActivationBehavior = (
  tx: EngineTx,
  communityId: string,
  nextEpochNumber: number,
) => Promise<{ monthlyInflationRateBps: number; chainRecordIds: string[] } | null>;

function makeFakePolicyActivation(behavior?: ActivationBehavior): FakePolicyActivation {
  const calls: Array<{ communityId: string; nextEpochNumber: number }> = [];
  return {
    calls,
    activatePendingVersion: async (tx, communityId, nextEpochNumber) => {
      calls.push({ communityId, nextEpochNumber });
      return behavior ? behavior(tx, communityId, nextEpochNumber) : null;
    },
  };
}

/** Wrap the fake's $executeRaw to record every normalized raw statement. */
function recordExecuteRaw(db: FakeEngineDb): string[] {
  const calls: string[] = [];
  const orig = db.$executeRaw;
  (db as unknown as { $executeRaw: EngineTx['$executeRaw'] }).$executeRaw = async (
    strings,
    ...values
  ) => {
    calls.push(strings.join(' ? ').replace(/\s+/g, ' ').trim());
    return orig(strings, ...values);
  };
  return calls;
}

function makeP2002(): Error {
  const err = new Error('Unique constraint failed') as Error & { code: string };
  err.code = 'P2002';
  return err;
}

interface Harness {
  db: FakeEngineDb;
  records: ReturnType<typeof makeFakeRecordsPort>;
  policyActivation: FakePolicyActivation;
  deps: EpochServiceDeps;
}

function harness(policyActivation?: FakePolicyActivation): Harness {
  const db = makeFakeEngineDb();
  const records = makeFakeRecordsPort();
  const buildEnvelope = makeFakeBuildEnvelope();
  const activation = policyActivation ?? makeFakePolicyActivation();
  const deps: EpochServiceDeps = {
    db,
    records,
    buildEnvelope,
    policyActivation: activation,
    now: () => FIXED_NOW,
  };
  return { db, records, policyActivation: activation, deps };
}

/** Seed a community with a token state + policy + one active epoch #1. */
function seedCommunity(
  db: FakeEngineDb,
  opts: {
    communityId: string;
    currentTotalSupply?: bigint;
    inflationRateBps?: number;
    maxAdvanceRateBps?: number;
    epochDurationDays?: number;
    epoch?: Record<string, unknown>;
  },
): void {
  const communityId = opts.communityId;
  db.seedCommunity({ id: communityId });
  db.seedState({
    communityId,
    currentTotalSupply: opts.currentTotalSupply ?? 100_000n,
    ledgerSeq: 0n,
  });
  db.seedPolicy({
    communityId,
    monthlyInflationRateBps: opts.inflationRateBps ?? 1000,
    maxAdvanceRateBps: opts.maxAdvanceRateBps ?? 2000,
    memberMintCapRateBps: 500,
    epochDurationDays: opts.epochDurationDays ?? 30,
  });
  db.seedEpoch({
    communityId,
    epochNumber: 1,
    status: 'active',
    openingSupply: 90_000n,
    baseMintBudget: 9_000n,
    advanceDebtFromPreviousEpoch: 0n,
    effectiveRegularBudget: 9_000n,
    maxAdvanceAmount: 1_800n,
    regularMintedAmount: 3_000n,
    advancedMintedAmount: 0n,
    unusedRegularBudget: 0n,
    inflationRateBps: 1000,
    endTime: EPOCH1_END,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...opts.epoch,
  });
}

function epochById(db: FakeEngineDb, id: string): Record<string, unknown> {
  const row = db.rows('tokenEpoch').find((r) => r.id === id);
  if (!row) throw new Error(`epoch ${id} not found in fake`);
  return row;
}

function epochByNumber(db: FakeEngineDb, communityId: string, n: number): Record<string, unknown> {
  const row = db
    .rows('tokenEpoch')
    .find((r) => r.communityId === communityId && r.epochNumber === n);
  if (!row) throw new Error(`epoch #${n} not found in fake`);
  return row;
}

// ---------------------------------------------------------------------------
// closeEpoch — normal switch
// ---------------------------------------------------------------------------

describe('createEpochService.closeEpoch — normal switch', () => {
  it('derives the next-epoch budget and voids unused regular budget (no roll-over)', async () => {
    const { db, deps } = harness();
    seedCommunity(db, { communityId: 'c1', currentTotalSupply: 100_000n });
    const current = epochByNumber(db, 'c1', 1);

    const svc = createEpochService(deps);
    const result = await svc.closeEpoch(current.id as string);

    expect('noop' in result).toBe(false);
    if ('noop' in result) throw new Error('unexpected noop');

    const next = epochById(db, result.nextEpochId);
    // openingSupply = state supply; base = 100000 * 1000/10000 = 10000.
    expect(next.openingSupply).toBe(100_000n);
    expect(next.baseMintBudget).toBe(10_000n);
    // advanceDebt = 0 -> effective = base; maxAdvance = base * 2000/10000 = 2000.
    expect(next.advanceDebtFromPreviousEpoch).toBe(0n);
    expect(next.effectiveRegularBudget).toBe(10_000n);
    expect(next.maxAdvanceAmount).toBe(2_000n);
    expect(next.status).toBe('active');
    expect(next.regularMintedAmount).toBe(0n);
    expect(next.advancedMintedAmount).toBe(0n);
    // Unused budget is NOT rolled into the next epoch.
    expect(next.unusedRegularBudget).toBe(0n);
    // startTime chains off the closing epoch's endTime; endTime = +30 days.
    expect((next.startTime as Date).getTime()).toBe(EPOCH1_END.getTime());
    expect((next.endTime as Date).getTime()).toBe(
      EPOCH1_END.getTime() + 30 * 86_400_000,
    );

    // Closing epoch: 'closed', unused = 9000 - 3000 = 6000, summary backfilled.
    const closed = epochById(db, current.id as string);
    expect(closed.status).toBe('closed');
    expect(closed.unusedRegularBudget).toBe(6_000n);
    expect(closed.closedAt).toEqual(FIXED_NOW);
    expect(closed.publicRecordId).toBe('rec_1');
  });

  it('return value carries communityId + nextEpochId + summary chainRecordIds', async () => {
    const { db, deps } = harness();
    seedCommunity(db, { communityId: 'c1' });
    const current = epochByNumber(db, 'c1', 1);

    const svc = createEpochService(deps);
    const result = await svc.closeEpoch(current.id as string);
    if ('noop' in result) throw new Error('unexpected noop');

    expect(result.communityId).toBe('c1');
    expect(typeof result.nextEpochId).toBe('string');
    expect(result.chainRecordIds).toEqual(['rec_1']);
  });

  it('creates an on-chain epoch_summary pending record for the closing epoch', async () => {
    const { db, records, deps } = harness();
    seedCommunity(db, { communityId: 'c1' });
    const current = epochByNumber(db, 'c1', 1);

    const svc = createEpochService(deps);
    await svc.closeEpoch(current.id as string);

    expect(records.created).toHaveLength(1);
    expect(records.created[0].id).toBe('rec_1');
    expect(records.created[0].status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// Debt roll-over conservation
// ---------------------------------------------------------------------------

describe('createEpochService.closeEpoch — debt carry-over conservation', () => {
  it('carries unrepaid prior debt without evaporation and conserves across two switches', async () => {
    const { db, deps } = harness();
    // opening supply constant at 10000 -> every base = 10000 * 1000/10000 = 1000.
    seedCommunity(db, {
      communityId: 'c1',
      currentTotalSupply: 10_000n,
      inflationRateBps: 1000,
      epoch: {
        baseMintBudget: 1_000n,
        advanceDebtFromPreviousEpoch: 1_500n,
        // current epoch effective was max(0, 1000 - 1500) = 0.
        effectiveRegularBudget: 0n,
        regularMintedAmount: 0n,
        advancedMintedAmount: 0n,
      },
    });
    const svc = createEpochService(deps);

    const first = epochByNumber(db, 'c1', 1);
    const r1 = await svc.closeEpoch(first.id as string);
    if ('noop' in r1) throw new Error('unexpected noop');

    // Epoch #2: base 1000, carried = max(0, 1500 - 1000) = 500 -> advanceDebt 500.
    const e2 = epochById(db, r1.nextEpochId);
    expect(e2.baseMintBudget).toBe(1_000n);
    expect(e2.advanceDebtFromPreviousEpoch).toBe(500n);
    expect(e2.effectiveRegularBudget).toBe(500n); // max(0, 1000 - 500)

    // Second switch: base 1000, carried = max(0, 500 - 1000) = 0 -> debt cleared.
    const r2 = await svc.closeEpoch(r1.nextEpochId);
    if ('noop' in r2) throw new Error('unexpected noop');
    const e3 = epochById(db, r2.nextEpochId);
    expect(e3.advanceDebtFromPreviousEpoch).toBe(0n);
    expect(e3.effectiveRegularBudget).toBe(1_000n);
    // Conservation: 1000 (epoch1 base) + 500 (epoch2 servicing) = 1500 original debt.
  });

  it('writes an advance_debt_repayment DB-only record only when debt > 0', async () => {
    const { db, deps } = harness();
    seedCommunity(db, {
      communityId: 'c1',
      currentTotalSupply: 10_000n,
      epoch: {
        baseMintBudget: 1_000n,
        advanceDebtFromPreviousEpoch: 1_500n,
        effectiveRegularBudget: 0n,
      },
    });
    const svc = createEpochService(deps);
    const first = epochByNumber(db, 'c1', 1);
    await svc.closeEpoch(first.id as string);

    const dbOnly = db
      .rows('publicRecord')
      .filter((r) => r.chainEligible === false);
    const types = dbOnly.map((r) => r.recordType);
    expect(types).toContain('epoch_budget_created');
    expect(types).toContain('advance_debt_repayment');
    const debtRec = dbOnly.find((r) => r.recordType === 'advance_debt_repayment');
    // payload debt string is carried into the canonicalized envelope.
    expect(debtRec?.envelopeJson).toContain('500');
  });

  it('omits advance_debt_repayment when advanceDebt == 0', async () => {
    const { db, deps } = harness();
    seedCommunity(db, { communityId: 'c1' }); // debt 0, no new advances
    const svc = createEpochService(deps);
    const current = epochByNumber(db, 'c1', 1);
    await svc.closeEpoch(current.id as string);

    const dbOnly = db.rows('publicRecord').filter((r) => r.chainEligible === false);
    const types = dbOnly.map((r) => r.recordType);
    expect(types).toContain('epoch_budget_created');
    expect(types).not.toContain('advance_debt_repayment');
  });
});

// ---------------------------------------------------------------------------
// Governance activation (balance layer + event layer)
// ---------------------------------------------------------------------------

describe('createEpochService.closeEpoch — governance activation', () => {
  it('rolls pending governance into active (total conserved, pending zeroed) via sql.ts', async () => {
    const { db, deps } = harness();
    seedCommunity(db, { communityId: 'c1' });
    db.seedBalance({
      communityId: 'c1',
      memberId: 'm1',
      activeGovernanceBalance: 100n,
      pendingGovernanceBalance: 40n,
    });
    db.seedBalance({
      communityId: 'c1',
      memberId: 'm2',
      activeGovernanceBalance: 0n,
      pendingGovernanceBalance: 10n,
    });
    const sqlCalls = recordExecuteRaw(db);

    const svc = createEpochService(deps);
    const current = epochByNumber(db, 'c1', 1);
    await svc.closeEpoch(current.id as string);

    const balances = db.rows('memberTokenBalance');
    const m1 = balances.find((b) => b.memberId === 'm1');
    const m2 = balances.find((b) => b.memberId === 'm2');
    // total (active + pending) conserved; pending zeroed.
    expect(m1?.activeGovernanceBalance).toBe(140n);
    expect(m1?.pendingGovernanceBalance).toBe(0n);
    expect(m2?.activeGovernanceBalance).toBe(10n);
    expect(m2?.pendingGovernanceBalance).toBe(0n);

    // Activation went through sql.ts activatePendingGovernance (raw statement).
    const flipped = sqlCalls.some(
      (c) =>
        c.includes('"MemberTokenBalance"') &&
        c.includes('"activeGovernanceBalance"') &&
        c.includes('"pendingGovernanceBalance"') &&
        c.includes('SET'),
    );
    expect(flipped).toBe(true);
  });

  it('event layer flips only mint events whose activationEpoch == the opening epoch', async () => {
    // Red-team ruling: the event layer is filtered by activationEpoch; the
    // balance layer flips whole rows. We assert the filter ONLY at the event
    // layer (the balance layer makes no per-activationEpoch claim).
    const { db, deps } = harness();
    seedCommunity(db, { communityId: 'c1' });
    // Closing epoch is #1 -> next opening epoch is #2.
    await (db.tokenMintEvent as EngineDelegate).create({
      data: {
        id: 'me_due',
        communityId: 'c1',
        memberId: 'm1',
        governanceStatus: 'pending',
        governanceActivationEpoch: 2,
      },
    });
    await (db.tokenMintEvent as EngineDelegate).create({
      data: {
        id: 'me_future',
        communityId: 'c1',
        memberId: 'm1',
        governanceStatus: 'pending',
        governanceActivationEpoch: 3,
      },
    });

    const svc = createEpochService(deps);
    const current = epochByNumber(db, 'c1', 1);
    await svc.closeEpoch(current.id as string);

    const events = db.rows('tokenMintEvent');
    const due = events.find((e) => e.id === 'me_due');
    const future = events.find((e) => e.id === 'me_future');
    expect(due?.governanceStatus).toBe('active');
    expect(future?.governanceStatus).toBe('pending');
  });

  it('resets tokensEarnedCurrentEpoch to zero for every member', async () => {
    const { db, deps } = harness();
    seedCommunity(db, { communityId: 'c1' });
    db.seedBalance({ communityId: 'c1', memberId: 'm1', tokensEarnedCurrentEpoch: 777n });
    db.seedBalance({ communityId: 'c1', memberId: 'm2', tokensEarnedCurrentEpoch: 12n });

    const svc = createEpochService(deps);
    const current = epochByNumber(db, 'c1', 1);
    await svc.closeEpoch(current.id as string);

    const balances = db.rows('memberTokenBalance');
    for (const b of balances) {
      expect(b.tokensEarnedCurrentEpoch).toBe(0n);
    }
  });
});

// ---------------------------------------------------------------------------
// Pending policy activation
// ---------------------------------------------------------------------------

describe('createEpochService.closeEpoch — pending policy activation', () => {
  it('applies an activated policy version to the next epoch budget and appends its chain records', async () => {
    const activation = makeFakePolicyActivation(async (tx, communityId) => {
      // Simulate the pending version flipping the effective inflation rate.
      await tx.communityTokenPolicy.update({
        where: { communityId },
        data: { monthlyInflationRateBps: 2000 },
      });
      return { monthlyInflationRateBps: 2000, chainRecordIds: ['pv_rec_1'] };
    });
    const { db, records, deps } = harness(activation);
    seedCommunity(db, {
      communityId: 'c1',
      currentTotalSupply: 100_000n,
      inflationRateBps: 1000,
    });

    const svc = createEpochService(deps);
    const current = epochByNumber(db, 'c1', 1);
    const result = await svc.closeEpoch(current.id as string);
    if ('noop' in result) throw new Error('unexpected noop');

    // base now uses the activated 2000 bps -> 100000 * 2000/10000 = 20000.
    const next = epochById(db, result.nextEpochId);
    expect(next.baseMintBudget).toBe(20_000n);
    expect(next.inflationRateBps).toBe(2000);

    // Activation chain records are appended after the summary record.
    expect(result.chainRecordIds).toEqual(['rec_1', 'pv_rec_1']);
    expect(activation.calls).toEqual([{ communityId: 'c1', nextEpochNumber: 2 }]);
    // Both chain records are enqueued (summary + policy version).
    expect(records.submissions).toEqual(['rec_1', 'pv_rec_1']);
  });
});

// ---------------------------------------------------------------------------
// requestSubmission ordering / timing
// ---------------------------------------------------------------------------

describe('createEpochService.closeEpoch — submission timing', () => {
  it('fires requestSubmission only after the transaction commits, in chainRecordId order', async () => {
    const { db, records, deps } = harness();
    seedCommunity(db, { communityId: 'c1' });

    // Assert no submissions happen during createPendingRecord (inside the tx).
    const originalCreate = records.createPendingRecord;
    (records as unknown as { createPendingRecord: typeof records.createPendingRecord }).createPendingRecord =
      async (tx, input) => {
        expect(records.submissions).toEqual([]); // nothing enqueued mid-tx
        return originalCreate(tx, input);
      };

    const svc = createEpochService(deps);
    const current = epochByNumber(db, 'c1', 1);
    await svc.closeEpoch(current.id as string);

    expect(records.submissions).toEqual(['rec_1']);
  });
});

// ---------------------------------------------------------------------------
// Idempotency / status guards / concurrency
// ---------------------------------------------------------------------------

describe('createEpochService.closeEpoch — guards', () => {
  it('is an idempotent noop when the epoch is already closed', async () => {
    const { db, records, deps } = harness();
    seedCommunity(db, { communityId: 'c1', epoch: { status: 'closed' } });
    const current = epochByNumber(db, 'c1', 1);

    const svc = createEpochService(deps);
    const result = await svc.closeEpoch(current.id as string);

    expect(result).toEqual({ noop: true });
    // No new epoch, no records, no submissions.
    expect(db.rows('tokenEpoch')).toHaveLength(1);
    expect(records.created).toHaveLength(0);
    expect(records.submissions).toHaveLength(0);
  });

  it('throws INVALID_STATUS for a non-active, non-closed epoch', async () => {
    const { db, deps } = harness();
    seedCommunity(db, { communityId: 'c1', epoch: { status: 'closing' } });
    const current = epochByNumber(db, 'c1', 1);

    const svc = createEpochService(deps);
    await expect(svc.closeEpoch(current.id as string)).rejects.toMatchObject({
      code: 'INVALID_STATUS',
    });
  });

  it('throws NOT_FOUND for an unknown epoch id', async () => {
    const { deps } = harness();
    const svc = createEpochService(deps);
    await expect(svc.closeEpoch('missing')).rejects.toBeInstanceOf(EngineError);
    await expect(svc.closeEpoch('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('maps a P2002 on next-epoch creation to CONFLICT and rolls back the close', async () => {
    const { db, deps } = harness();
    seedCommunity(db, { communityId: 'c1' });
    // A competing epoch #2 already exists -> create() collides on [communityId, epochNumber].
    db.seedEpoch({ communityId: 'c1', epochNumber: 2, status: 'closed' });
    const current = epochByNumber(db, 'c1', 1);

    const svc = createEpochService(deps);
    await expect(svc.closeEpoch(current.id as string)).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    // Rollback: the closing epoch is still 'active'.
    const stillOpen = epochById(db, current.id as string);
    expect(stillOpen.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// createNextEpoch
// ---------------------------------------------------------------------------

describe('createEpochService.createNextEpoch', () => {
  it('returns the existing active epoch without creating a new one', async () => {
    const { db, deps } = harness();
    seedCommunity(db, { communityId: 'c1' });
    const existing = epochByNumber(db, 'c1', 1);

    const svc = createEpochService(deps);
    const result = await svc.createNextEpoch('c1');

    expect(result).toEqual({ epochId: existing.id, created: false });
    expect(db.rows('tokenEpoch')).toHaveLength(1);
  });

  it('bootstraps epoch #1 from state supply + policy when none exists', async () => {
    const { db, deps } = harness();
    db.seedCommunity({ id: 'c1' });
    db.seedState({ communityId: 'c1', currentTotalSupply: 50_000n, ledgerSeq: 0n });
    db.seedPolicy({
      communityId: 'c1',
      monthlyInflationRateBps: 1000,
      maxAdvanceRateBps: 2000,
      memberMintCapRateBps: 500,
      epochDurationDays: 30,
    });

    const svc = createEpochService(deps);
    const result = await svc.createNextEpoch('c1');

    expect(result.created).toBe(true);
    const epoch = epochById(db, result.epochId);
    expect(epoch.epochNumber).toBe(1);
    expect(epoch.status).toBe('active');
    expect(epoch.openingSupply).toBe(50_000n);
    expect(epoch.baseMintBudget).toBe(5_000n); // 50000 * 1000/10000
    expect(epoch.advanceDebtFromPreviousEpoch).toBe(0n);
    expect(epoch.effectiveRegularBudget).toBe(5_000n);
    expect(epoch.maxAdvanceAmount).toBe(1_000n); // 5000 * 2000/10000
    expect((epoch.startTime as Date).getTime()).toBe(FIXED_NOW.getTime());
  });

  it('on a P2002 race re-reads and returns the concurrently-created epoch (created:false)', async () => {
    const { db, deps } = harness();
    db.seedCommunity({ id: 'c1' });
    db.seedState({ communityId: 'c1', currentTotalSupply: 0n, ledgerSeq: 0n });
    db.seedPolicy({ communityId: 'c1', epochDurationDays: 30 });

    // Instrument tokenEpoch.create to simulate a competitor committing epoch #1
    // first (then raising P2002) on the very first create call.
    const original = (db.tokenEpoch as EngineDelegate).create.bind(db.tokenEpoch);
    let raced = false;
    (db as unknown as { tokenEpoch: EngineDelegate }).tokenEpoch = {
      ...db.tokenEpoch,
      create: async (args: unknown) => {
        if (!raced) {
          raced = true;
          db.seedEpoch({ id: 'winner', communityId: 'c1', epochNumber: 1, status: 'active' });
          throw makeP2002();
        }
        return original(args);
      },
    };

    const svc = createEpochService(deps);
    const result = await svc.createNextEpoch('c1');

    expect(result).toEqual({ epochId: 'winner', created: false });
  });
});
