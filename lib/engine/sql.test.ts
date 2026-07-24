import { describe, expect, it } from 'vitest';

import {
  activatePendingGovernance,
  endProposalIfDue,
  incrementAdvancedMintedGuarded,
  incrementRegularMintedGuarded,
  transitionProposalStatus,
} from './sql';
import { makeFakeEngineDb } from './testing/fake-engine-db';

describe('incrementRegularMintedGuarded', () => {
  it('applies and returns 1 when within budget', async () => {
    const db = makeFakeEngineDb();
    db.seedEpoch({ id: 'e1', communityId: 'c1', effectiveRegularBudget: 100n, regularMintedAmount: 40n });
    const n = await incrementRegularMintedGuarded(db, 'e1', 60n);
    expect(n).toBe(1);
    expect(db.rows('tokenEpoch')[0].regularMintedAmount).toBe(100n);
  });

  it('returns 0 (guard blocks) when it would exceed budget', async () => {
    const db = makeFakeEngineDb();
    db.seedEpoch({ id: 'e1', communityId: 'c1', effectiveRegularBudget: 100n, regularMintedAmount: 40n });
    const n = await incrementRegularMintedGuarded(db, 'e1', 61n);
    expect(n).toBe(0);
    expect(db.rows('tokenEpoch')[0].regularMintedAmount).toBe(40n);
  });

  it('returns 0 when the epoch id is unknown', async () => {
    const db = makeFakeEngineDb();
    expect(await incrementRegularMintedGuarded(db, 'nope', 1n)).toBe(0);
  });
});

describe('incrementAdvancedMintedGuarded', () => {
  it('applies and returns 1 when within maxAdvanceAmount', async () => {
    const db = makeFakeEngineDb();
    db.seedEpoch({ id: 'e1', communityId: 'c1', maxAdvanceAmount: 50n, advancedMintedAmount: 10n });
    expect(await incrementAdvancedMintedGuarded(db, 'e1', 40n)).toBe(1);
    expect(db.rows('tokenEpoch')[0].advancedMintedAmount).toBe(50n);
  });

  it('returns 0 when exceeding maxAdvanceAmount', async () => {
    const db = makeFakeEngineDb();
    db.seedEpoch({ id: 'e1', communityId: 'c1', maxAdvanceAmount: 50n, advancedMintedAmount: 10n });
    expect(await incrementAdvancedMintedGuarded(db, 'e1', 41n)).toBe(0);
    expect(db.rows('tokenEpoch')[0].advancedMintedAmount).toBe(10n);
  });
});

describe('activatePendingGovernance', () => {
  it('rolls pending into active only for rows with pending > 0', async () => {
    const db = makeFakeEngineDb();
    db.seedBalance({ communityId: 'c1', memberId: 'm1', activeGovernanceBalance: 5n, pendingGovernanceBalance: 3n });
    db.seedBalance({ communityId: 'c1', memberId: 'm2', activeGovernanceBalance: 7n, pendingGovernanceBalance: 0n });
    db.seedBalance({ communityId: 'c2', memberId: 'm3', activeGovernanceBalance: 1n, pendingGovernanceBalance: 9n });
    const n = await activatePendingGovernance(db, 'c1');
    expect(n).toBe(1);
    const m1 = db.rows('memberTokenBalance').find((r) => r.memberId === 'm1');
    expect(m1?.activeGovernanceBalance).toBe(8n);
    expect(m1?.pendingGovernanceBalance).toBe(0n);
    // Other community untouched.
    const m3 = db.rows('memberTokenBalance').find((r) => r.memberId === 'm3');
    expect(m3?.pendingGovernanceBalance).toBe(9n);
  });
});

describe('transitionProposalStatus', () => {
  it('CAS succeeds when current status matches', async () => {
    const db = makeFakeEngineDb();
    db.proposal.create({ data: { id: 'p1', communityId: 'c1', title: 't', status: 'active' } });
    expect(await transitionProposalStatus(db, 'p1', 'active', 'ended')).toBe(1);
    expect(db.rows('proposal')[0].status).toBe('ended');
  });

  it('CAS returns 0 when current status does not match', async () => {
    const db = makeFakeEngineDb();
    db.proposal.create({ data: { id: 'p1', communityId: 'c1', title: 't', status: 'draft' } });
    expect(await transitionProposalStatus(db, 'p1', 'active', 'ended')).toBe(0);
    expect(db.rows('proposal')[0].status).toBe('draft');
  });
});

describe('endProposalIfDue', () => {
  it('ends an active proposal when endTime is due', async () => {
    const db = makeFakeEngineDb();
    const now = new Date('2026-07-23T00:00:00Z');
    db.proposal.create({
      data: { id: 'p1', communityId: 'c1', title: 't', status: 'active', endTime: new Date('2026-07-22T00:00:00Z') },
    });
    expect(await endProposalIfDue(db, 'p1', now)).toBe(1);
    expect(db.rows('proposal')[0].status).toBe('ended');
  });

  it('does nothing when not yet due', async () => {
    const db = makeFakeEngineDb();
    const now = new Date('2026-07-23T00:00:00Z');
    db.proposal.create({
      data: { id: 'p1', communityId: 'c1', title: 't', status: 'active', endTime: new Date('2026-07-24T00:00:00Z') },
    });
    expect(await endProposalIfDue(db, 'p1', now)).toBe(0);
    expect(db.rows('proposal')[0].status).toBe('active');
  });

  it('does nothing when not active', async () => {
    const db = makeFakeEngineDb();
    const now = new Date('2026-07-23T00:00:00Z');
    db.proposal.create({
      data: { id: 'p1', communityId: 'c1', title: 't', status: 'draft', endTime: new Date('2026-07-22T00:00:00Z') },
    });
    expect(await endProposalIfDue(db, 'p1', now)).toBe(0);
  });
});
