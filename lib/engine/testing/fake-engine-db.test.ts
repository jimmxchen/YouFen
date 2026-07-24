import { describe, expect, it } from 'vitest';

import type { EngineTx } from '../types';
import {
  makeFakeBuildEnvelope,
  makeFakeEngineDb,
  makeFakeRecordsPort,
} from './fake-engine-db';

describe('fake delegates', () => {
  it('create assigns an id and returns a clone (no shared reference)', async () => {
    const db = makeFakeEngineDb();
    const created = (await db.community.create({ data: { slug: 's', name: 'N' } })) as {
      id: string;
      name: string;
    };
    expect(created.id).toBeTruthy();
    created.name = 'MUTATED';
    const fetched = (await db.community.findUnique({ where: { id: created.id } })) as {
      name: string;
    };
    expect(fetched.name).toBe('N');
  });

  it('findFirst / findMany filter by where', async () => {
    const db = makeFakeEngineDb();
    db.seedMember({ id: 'm1', communityId: 'c1', role: 'owner' });
    db.seedMember({ id: 'm2', communityId: 'c1', role: 'member' });
    db.seedMember({ id: 'm3', communityId: 'c2', role: 'member' });
    const first = (await db.member.findFirst({ where: { communityId: 'c1', role: 'member' } })) as {
      id: string;
    };
    expect(first.id).toBe('m2');
    const many = (await db.member.findMany({ where: { communityId: 'c1' } })) as unknown[];
    expect(many).toHaveLength(2);
  });

  it('update supports scalar set and increment', async () => {
    const db = makeFakeEngineDb();
    db.seedState({ communityId: 'c1', currentTotalSupply: 100n, ledgerSeq: 0n });
    await db.communityTokenState.update({
      where: { communityId: 'c1' },
      data: { currentTotalSupply: { increment: 25n } },
    });
    expect(db.rows('communityTokenState')[0].currentTotalSupply).toBe(125n);
  });

  it('update on a missing row rejects with Prisma P2025 (not P2002)', async () => {
    const db = makeFakeEngineDb();
    // A genuine not-found update must surface as P2025 so callers that use
    // isP2002 to detect unique violations (ALREADY_MINTED/CONFLICT) do not
    // misclassify a missing row as a duplicate.
    await expect(
      db.communityTokenState.update({
        where: { communityId: 'nope' },
        data: { currentTotalSupply: { increment: 1n } },
      }),
    ).rejects.toMatchObject({ code: 'P2025' });
  });

  it('updateMany returns a count', async () => {
    const db = makeFakeEngineDb();
    db.seedMember({ id: 'm1', communityId: 'c1' });
    db.seedMember({ id: 'm2', communityId: 'c1' });
    const res = (await db.member.updateMany({
      where: { communityId: 'c1' },
      data: { role: 'archived' },
    })) as { count: number };
    expect(res.count).toBe(2);
  });

  it('findMany supports the in / notIn / not / gte / lte / gt / lt operators', async () => {
    const db = makeFakeEngineDb();
    db.seedEpoch({ id: 'e1', communityId: 'c1', epochNumber: 1 });
    db.seedEpoch({ id: 'e2', communityId: 'c1', epochNumber: 2 });
    db.seedEpoch({ id: 'e3', communityId: 'c1', epochNumber: 3 });

    const inHit = (await db.tokenEpoch.findMany({ where: { id: { in: ['e1', 'e3'] } } })) as {
      id: string;
    }[];
    expect(inHit.map((r) => r.id).sort()).toEqual(['e1', 'e3']);

    const notInHit = (await db.tokenEpoch.findMany({
      where: { id: { notIn: ['e1', 'e3'] } },
    })) as { id: string }[];
    expect(notInHit.map((r) => r.id)).toEqual(['e2']);

    const notHit = (await db.tokenEpoch.findMany({ where: { id: { not: 'e2' } } })) as {
      id: string;
    }[];
    expect(notHit.map((r) => r.id).sort()).toEqual(['e1', 'e3']);

    const gteHit = (await db.tokenEpoch.findMany({ where: { epochNumber: { gte: 2 } } })) as {
      epochNumber: number;
    }[];
    expect(gteHit.map((r) => r.epochNumber).sort()).toEqual([2, 3]);

    const rangeHit = (await db.tokenEpoch.findMany({
      where: { epochNumber: { gt: 1, lt: 3 } },
    })) as { epochNumber: number }[];
    expect(rangeHit.map((r) => r.epochNumber)).toEqual([2]);
  });

  it('findMany/findFirst honor orderBy and take', async () => {
    const db = makeFakeEngineDb();
    db.seedEpoch({ id: 'e1', communityId: 'c1', epochNumber: 1 });
    db.seedEpoch({ id: 'e2', communityId: 'c1', epochNumber: 3 });
    db.seedEpoch({ id: 'e3', communityId: 'c1', epochNumber: 2 });

    const desc = (await db.tokenEpoch.findMany({
      where: { communityId: 'c1' },
      orderBy: { epochNumber: 'desc' },
      take: 2,
    })) as { epochNumber: number }[];
    expect(desc.map((r) => r.epochNumber)).toEqual([3, 2]);

    const firstDesc = (await db.tokenEpoch.findFirst({
      where: { communityId: 'c1' },
      orderBy: { epochNumber: 'desc' },
    })) as { epochNumber: number };
    expect(firstDesc.epochNumber).toBe(3);
  });

  it('a nested composite-unique locator still matches (not confused with operators)', async () => {
    const db = makeFakeEngineDb();
    db.seedBalance({ communityId: 'c1', memberId: 'm1', totalBalance: 42n });
    const hit = (await db.memberTokenBalance.findUnique({
      where: { communityId_memberId: { communityId: 'c1', memberId: 'm1' } },
    })) as { totalBalance: bigint } | null;
    expect(hit?.totalBalance).toBe(42n);
  });

  it('createMany returns a count and inserts all rows', async () => {
    const db = makeFakeEngineDb();
    const res = (await db.contribution.createMany({
      data: [
        { id: 'x1', communityId: 'c1', description: 'a', suggestedTokenAmount: 1n, submittedBy: 'u' },
        { id: 'x2', communityId: 'c1', description: 'b', suggestedTokenAmount: 2n, submittedBy: 'u' },
      ],
    })) as { count: number };
    expect(res.count).toBe(2);
    expect(db.rows('contribution')).toHaveLength(2);
  });
});

describe('fake transaction snapshot/rollback', () => {
  it('rolls every table back when the fn throws', async () => {
    const db = makeFakeEngineDb();
    db.seedCommunity({ id: 'c1' });
    await expect(
      db.$transaction(async (tx: EngineTx) => {
        await tx.member.create({ data: { id: 'm1', communityId: 'c1', displayName: 'X' } });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(db.rows('member')).toHaveLength(0);
    expect(db.rows('community')).toHaveLength(1);
  });

  it('commits when the fn resolves', async () => {
    const db = makeFakeEngineDb();
    await db.$transaction(async (tx: EngineTx) => {
      await tx.member.create({ data: { id: 'm1', communityId: 'c1', displayName: 'X' } });
    });
    expect(db.rows('member')).toHaveLength(1);
  });
});

describe('fake P2002 unique constraints', () => {
  const dup = async (fn: () => Promise<unknown>): Promise<void> => {
    await expect(fn()).rejects.toMatchObject({ code: 'P2002' });
  };

  it('tokenMintEvent [contributionId, budgetSource]', async () => {
    const db = makeFakeEngineDb();
    const data = { communityId: 'c1', memberId: 'm', epochId: 'e', epochNumber: 1, mintType: 'contribution', budgetSource: 'current_epoch', amount: 1n, memberBalanceBefore: 0n, memberBalanceAfter: 1n, totalSupplyBefore: 0n, totalSupplyAfter: 1n, tokenPolicyVersion: 1, reason: 'r', approvedBy: 'a', contributionId: 'con1', createdAt: new Date() };
    await db.tokenMintEvent.create({ data: { ...data, id: 'a' } });
    await dup(() => db.tokenMintEvent.create({ data: { ...data, id: 'b' } }));
  });

  it('tokenMintEvent null contributionId does not collide', async () => {
    const db = makeFakeEngineDb();
    const data = { communityId: 'c1', memberId: 'm', epochId: 'e', epochNumber: 1, mintType: 'initial_allocation', budgetSource: 'current_epoch', amount: 1n, memberBalanceBefore: 0n, memberBalanceAfter: 1n, totalSupplyBefore: 0n, totalSupplyAfter: 1n, tokenPolicyVersion: 1, reason: 'r', approvedBy: 'a', contributionId: null, createdAt: new Date() };
    await db.tokenMintEvent.create({ data: { ...data, id: 'a' } });
    await expect(db.tokenMintEvent.create({ data: { ...data, id: 'b' } })).resolves.toBeTruthy();
  });

  it('vote [proposalId, memberId]', async () => {
    const db = makeFakeEngineDb();
    const data = { proposalId: 'p1', memberId: 'm1', optionId: 'approve', totalTokenBalanceSnapshot: 1n, activeGovernanceBalanceSnapshot: 1n, totalSupplySnapshot: 1n, governancePercentageSnapshot: 1 };
    await db.vote.create({ data: { ...data, id: 'a' } });
    await dup(() => db.vote.create({ data: { ...data, id: 'b' } }));
  });

  it('proposalMemberSnapshot [proposalId, memberId]', async () => {
    const db = makeFakeEngineDb();
    const data = { proposalId: 'p1', memberId: 'm1', activeGovernanceToken: 1n };
    await db.proposalMemberSnapshot.create({ data: { ...data, id: 'a' } });
    await dup(() => db.proposalMemberSnapshot.create({ data: { ...data, id: 'b' } }));
  });

  it('publicRecord recordHash', async () => {
    const db = makeFakeEngineDb();
    const data = { communityId: 'c1', recordType: 'token_mint', status: 'pending', envelopeJson: '{}', recordHash: '0xabc', sourceTable: 'T', sourceId: 's' };
    await db.publicRecord.create({ data: { ...data, id: 'a' } });
    await dup(() => db.publicRecord.create({ data: { ...data, id: 'b' } }));
  });

  it('memberTokenBalance [communityId, memberId]', async () => {
    const db = makeFakeEngineDb();
    db.seedBalance({ communityId: 'c1', memberId: 'm1' });
    await dup(() => db.memberTokenBalance.create({ data: { communityId: 'c1', memberId: 'm1', totalBalance: 0n, activeGovernanceBalance: 0n, pendingGovernanceBalance: 0n, tokensEarnedCurrentEpoch: 0n, tokensEarnedLifetime: 0n, tokensReversedLifetime: 0n } }));
  });

  it('tokenPolicyVersion [policyId, version]', async () => {
    const db = makeFakeEngineDb();
    const data = { policyId: 'pol1', version: 1, effectiveEpoch: 1, monthlyInflationRateBps: 0, maxAdvanceRateBps: 0, memberMintCapRateBps: 0, rules: [] };
    await db.tokenPolicyVersion.create({ data: { ...data, id: 'a' } });
    await dup(() => db.tokenPolicyVersion.create({ data: { ...data, id: 'b' } }));
  });

  it('tokenEpoch [communityId, epochNumber]', async () => {
    const db = makeFakeEngineDb();
    db.seedEpoch({ id: 'e1', communityId: 'c1', epochNumber: 1 });
    await dup(() => db.tokenEpoch.create({ data: { id: 'e2', communityId: 'c1', epochNumber: 1, openingSupply: 0n, baseMintBudget: 0n, advanceDebtFromPreviousEpoch: 0n, effectiveRegularBudget: 0n, maxAdvanceAmount: 0n, regularMintedAmount: 0n, advancedMintedAmount: 0n, unusedRegularBudget: 0n, inflationRateBps: 0, status: 'upcoming' } }));
  });

  it('idempotencyKey [endpoint, key]', async () => {
    const db = makeFakeEngineDb();
    const data = { endpoint: '/x', key: 'k', requestHash: 'h', responseStatus: 200, responseBody: '{}' };
    await db.idempotencyKey.create({ data: { ...data, id: 'a' } });
    await dup(() => db.idempotencyKey.create({ data: { ...data, id: 'b' } }));
  });

  it('tokenReversalEvent originalMintEventId', async () => {
    const db = makeFakeEngineDb();
    const data = { communityId: 'c1', memberId: 'm1', originalMintEventId: 'me1', amount: 1n, reason: 'entry_error', totalBalanceAfter: 0n, totalSupplyAfter: 0n, approvedBy: 'a' };
    await db.tokenReversalEvent.create({ data: { ...data, id: 'a' } });
    await dup(() => db.tokenReversalEvent.create({ data: { ...data, id: 'b' } }));
  });

  it('communityTokenPolicy communityId', async () => {
    const db = makeFakeEngineDb();
    db.seedPolicy({ communityId: 'c1' });
    await dup(() =>
      db.communityTokenPolicy.create({
        data: { communityId: 'c1', tokenName: 'T', tokenSymbol: 'T', initialSupply: 0n, currentTotalSupply: 0n, epochDurationDays: 30, monthlyInflationRateBps: 0, maxAdvanceRateBps: 0, memberMintCapRateBps: 0, policyVersion: 1, effectiveEpoch: 1, rules: [] },
      }),
    );
  });

  it('communityTokenState communityId', async () => {
    const db = makeFakeEngineDb();
    db.seedState({ communityId: 'c1' });
    await dup(() => db.communityTokenState.create({ data: { communityId: 'c1', currentTotalSupply: 0n, ledgerSeq: 0n } }));
  });
});

describe('fake seed duplicate throws synchronously (P2002)', () => {
  it('seedPolicy twice on same community', () => {
    const db = makeFakeEngineDb();
    db.seedPolicy({ communityId: 'c1' });
    expect(() => db.seedPolicy({ communityId: 'c1' })).toThrow(/Unique constraint/);
  });
});

describe('fake raw SQL guard', () => {
  it('throws a clear error for an unregistered statement', async () => {
    const db = makeFakeEngineDb();
    await expect(db.$executeRaw`DELETE FROM "Member" WHERE "id" = ${'m1'}`).rejects.toThrow(
      /Unregistered SQL statement in fake-engine-db/,
    );
  });

  it('throws for an unregistered $queryRaw statement', async () => {
    const db = makeFakeEngineDb();
    await expect(
      db.$queryRaw`SELECT * FROM "Community" WHERE "id" = ${'c1'}`,
    ).rejects.toThrow(/Unregistered SQL statement/);
  });
});

describe('fake ports', () => {
  it('makeFakeRecordsPort logs submission order and stores created records', async () => {
    const port = makeFakeRecordsPort();
    const tx = makeFakeEngineDb();
    const a = await port.createPendingRecord(tx, {
      recordType: 'token_mint',
      sourceTable: 'T',
      sourceId: 's1',
      communityId: 'c1',
      envelope: {},
      recordHash: '0x01',
    });
    await port.requestSubmission(a.id);
    expect(port.submissions).toEqual([a.id]);
    expect(port.created[0].recordHash).toBe('0x01');
    expect(await port.getById(a.id)).toMatchObject({ id: a.id, status: 'pending' });
  });

  it('makeFakeBuildEnvelope returns deterministic increasing hashes', () => {
    const build = makeFakeBuildEnvelope();
    const h1 = build({ kind: 'token_mint', mintEvent: {} as never });
    const h2 = build({ kind: 'token_mint', mintEvent: {} as never });
    expect(h1.recordHash).not.toBe(h2.recordHash);
    expect(h1.recordHash.startsWith('0x')).toBe(true);
  });
});
