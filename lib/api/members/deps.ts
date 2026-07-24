// Real-dependency resolver for the members read endpoints + public epoch detail
// (W5-5). Builds a key-free MembersReader over a shared Prisma client and pairs it
// with the default self-or-admin policy. Route adapters call resolveMembersDeps();
// tests inject a fake via setDepsForTesting.

import { getPrisma } from '../../db/client';

import {
  defaultAuthorizeMember,
  type EpochRow,
  type MemberBalanceRow,
  type MembersDeps,
  type MembersReader,
  type MintEventRow,
  type ReversalEventRow,
} from './handlers';

// Structural subset of the Prisma delegates the reader touches. Typed loosely so
// this module compiles against the generated client without leaking its full types.
interface PrismaLike {
  memberTokenBalance: {
    findFirst(args: unknown): Promise<unknown>;
    aggregate(args: unknown): Promise<{ _sum: { activeGovernanceBalance: bigint | null } }>;
  };
  communityTokenState: {
    findUnique(args: unknown): Promise<{ currentTotalSupply: bigint } | null>;
  };
  tokenMintEvent: { findMany(args: unknown): Promise<unknown[]> };
  tokenReversalEvent: { findMany(args: unknown): Promise<unknown[]> };
  tokenEpoch: { findUnique(args: unknown): Promise<unknown> };
}

/** Build a MembersReader backed by Prisma. */
export function createMembersReader(prisma: PrismaLike): MembersReader {
  return {
    getBalance: async (memberId) =>
      (await prisma.memberTokenBalance.findFirst({
        where: { memberId },
      })) as MemberBalanceRow | null,
    getTokenState: (communityId) =>
      prisma.communityTokenState.findUnique({ where: { communityId } }),
    sumActiveGovernance: async (communityId) => {
      const agg = await prisma.memberTokenBalance.aggregate({
        where: { communityId },
        _sum: { activeGovernanceBalance: true },
      });
      return agg._sum.activeGovernanceBalance ?? 0n;
    },
    listMintEvents: async (memberId) =>
      (await prisma.tokenMintEvent.findMany({
        where: { memberId },
        orderBy: { createdAt: 'desc' },
      })) as MintEventRow[],
    listReversalEvents: async (memberId) =>
      (await prisma.tokenReversalEvent.findMany({
        where: { memberId },
        orderBy: { createdAt: 'desc' },
      })) as ReversalEventRow[],
    getEpoch: async (epochId) =>
      (await prisma.tokenEpoch.findUnique({ where: { id: epochId } })) as EpochRow | null,
  };
}

let override: MembersDeps | null = null;

/** Test seam: inject fake deps (or clear with null). */
export function setDepsForTesting(deps: MembersDeps | null): void {
  override = deps;
}

/** Resolve the real members deps (Prisma-backed reader + default self-or-admin policy). */
export function resolveMembersDeps(): MembersDeps {
  if (override !== null) {
    return override;
  }
  const prisma = getPrisma() as unknown as PrismaLike;
  return {
    reader: createMembersReader(prisma),
    authorizeMember: defaultAuthorizeMember,
  };
}
