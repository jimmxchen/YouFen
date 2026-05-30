import { describe, expect, it } from 'vitest';

import {
  lockActiveEpoch,
  lockBalance,
  lockEpochById,
  lockMintEvent,
  lockState,
} from './db-locks';
import { makeFakeEngineDb } from './testing/fake-engine-db';

describe('lockActiveEpoch', () => {
  it('returns the active epoch with bigint fields normalized', async () => {
    const db = makeFakeEngineDb();
    db.seedEpoch({ id: 'e0', communityId: 'c1', status: 'closed', openingSupply: 1n });
    db.seedEpoch({ id: 'e1', communityId: 'c1', status: 'active', openingSupply: 500n, epochNumber: 2 });
    const row = await lockActiveEpoch(db, 'c1');
    expect(row?.id).toBe('e1');
    expect(row?.status).toBe('active');
    expect(row?.openingSupply).toBe(500n);
    expect(typeof row?.openingSupply).toBe('bigint');
    expect(row?.epochNumber).toBe(2);
    expect(typeof row?.epochNumber).toBe('number');
  });

  it('returns null when no active epoch exists', async () => {
    const db = makeFakeEngineDb();
    db.seedEpoch({ id: 'e0', communityId: 'c1', status: 'closed' });
    expect(await lockActiveEpoch(db, 'c1')).toBeNull();
  });
});

describe('lockEpochById', () => {
  it('locks by id regardless of status', async () => {
    const db = makeFakeEngineDb();
    db.seedEpoch({ id: 'e1', communityId: 'c1', status: 'closing', maxAdvanceAmount: 42n });
    const row = await lockEpochById(db, 'e1');
    expect(row?.id).toBe('e1');
    expect(row?.status).toBe('closing');
    expect(row?.maxAdvanceAmount).toBe(42n);
  });

  it('returns null for an unknown id', async () => {
    const db = makeFakeEngineDb();
    expect(await lockEpochById(db, 'nope')).toBeNull();
  });
});

describe('lockBalance', () => {
  it('returns the member balance row normalized to BalanceRow', async () => {
    const db = makeFakeEngineDb();
    db.seedBalance({
      communityId: 'c1',
      memberId: 'm1',
      totalBalance: 100n,
      activeGovernanceBalance: 80n,
      pendingGovernanceBalance: 20n,
      tokensEarnedCurrentEpoch: 30n,
      tokensEarnedLifetime: 5n,
      tokensReversedLifetime: 2n,
    });
    const row = await lockBalance(db, 'c1', 'm1');
    expect(row?.totalBalance).toBe(100n);
    expect(row?.tokensEarnedCurrentEpoch).toBe(30n);
    expect(row?.tokensEarnedLifetime).toBe(5n);
    expect(row?.tokensReversedLifetime).toBe(2n);
  });

  it('returns null when the member has no balance', async () => {
    const db = makeFakeEngineDb();
    expect(await lockBalance(db, 'c1', 'ghost')).toBeNull();
  });
});

describe('lockState', () => {
  it('returns the state row with bigint supply + ledgerSeq', async () => {
    const db = makeFakeEngineDb();
    db.seedState({ communityId: 'c1', currentTotalSupply: 1000n, ledgerSeq: 7n });
    const row = await lockState(db, 'c1');
    expect(row?.currentTotalSupply).toBe(1000n);
    expect(row?.ledgerSeq).toBe(7n);
    expect(typeof row?.ledgerSeq).toBe('bigint');
  });

  it('returns null when no state row exists', async () => {
    const db = makeFakeEngineDb();
    expect(await lockState(db, 'c1')).toBeNull();
  });
});

describe('lockMintEvent', () => {
  it('returns the mint event normalized to MintEventRow', async () => {
    const db = makeFakeEngineDb();
    await db.tokenMintEvent.create({
      data: {
        id: 'me1',
        communityId: 'c1',
        memberId: 'm1',
        epochId: 'e1',
        epochNumber: 1,
        mintType: 'contribution',
        budgetSource: 'current_epoch',
        amount: 250n,
        governanceActivationEpoch: null,
        governanceStatus: 'active',
        memberBalanceBefore: 0n,
        memberBalanceAfter: 250n,
        totalSupplyBefore: 1000n,
        totalSupplyAfter: 1250n,
        tokenPolicyVersion: 1,
        reason: 'work',
        approvedBy: 'admin',
        advanceRequestId: null,
        publicRecordId: null,
        ledgerSeq: 9,
        createdAt: new Date('2026-07-23T00:00:00Z'),
      },
    });
    const row = await lockMintEvent(db, 'me1');
    expect(row?.amount).toBe(250n);
    expect(row?.totalSupplyAfter).toBe(1250n);
    expect(row?.ledgerSeq).toBe(9);
    expect(row?.governanceActivationEpoch).toBeNull();
    expect(row?.advanceRequestId).toBeNull();
  });

  it('returns null for an unknown mint event id', async () => {
    const db = makeFakeEngineDb();
    expect(await lockMintEvent(db, 'nope')).toBeNull();
  });
});
