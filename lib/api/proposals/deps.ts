// Dependency resolver for the Proposals API group (conventions §API-endpoint-group).
// resolveProposalsDeps() assembles the real deps from getEngineRuntime() (the
// engine composition root) + getPrisma() (guarded client) + lib/api/core.
// setDepsForTesting(d|null) is the test seam so route tests inject fakes.
//
// Membership, the public snapshot read, and the idempotency store are all thin
// Prisma-backed adapters; the proposal engine itself owns every write and every
// snapshot/ledger invariant.

import { getPrisma } from '../../db/client';
import { getEngineRuntime } from '../../engine/runtime';
import {
  createPrismaIdempotencyStore,
  defaultAuthorizeAdmin,
  resolveAuthFromHeaders,
  type AuthContext,
  type PrismaIdempotencyDb,
} from '../core';

import type {
  MembershipPort,
  ProposalsDeps,
  ProposalSnapshotRow,
  SnapshotReaderPort,
} from './handlers';

// The subset of the Prisma client this resolver touches, typed structurally so
// the module compiles without a hard dependency on the generated client shape.
interface ProposalsPrisma {
  memberTokenBalance: {
    findUnique(args: {
      where: { communityId_memberId: { communityId: string; memberId: string } };
    }): Promise<unknown | null>;
  };
  proposal: {
    findUnique(args: {
      where: { id: string };
      select: Record<string, boolean>;
    }): Promise<ProposalSnapshotRow | null>;
  };
  proposalMemberSnapshot: {
    count(args: { where: { proposalId: string } }): Promise<number>;
    findUnique(args: {
      where: { proposalId_memberId: { proposalId: string; memberId: string } };
    }): Promise<{ activeGovernanceToken: bigint } | null>;
  };
}

const SNAPSHOT_SELECT: Record<string, boolean> = {
  id: true,
  communityId: true,
  status: true,
  snapshotAt: true,
  epochIdSnapshot: true,
  epochNumberSnapshot: true,
  totalSupplySnapshot: true,
  activeGovernanceSupplySnapshot: true,
  tokenPolicyVersionSnapshot: true,
  snapshotPublicRecordId: true,
};

let testDeps: ProposalsDeps | null = null;

/** Test seam: inject the full deps set (or clear with null). */
export function setDepsForTesting(deps: ProposalsDeps | null): void {
  testDeps = deps;
}

/** Derive an AuthContext from a request's headers using the internal-token env. */
export function authFromRequest(req: Request): AuthContext {
  return resolveAuthFromHeaders(req.headers, {
    internalApiToken: process.env.INTERNAL_API_TOKEN ?? null,
    cronSecret: process.env.CRON_SECRET ?? null,
  });
}

function buildMembership(prisma: ProposalsPrisma): MembershipPort {
  return {
    isMember: async (communityId, memberId) => {
      const row = await prisma.memberTokenBalance.findUnique({
        where: { communityId_memberId: { communityId, memberId } },
      });
      return row !== null;
    },
  };
}

function buildSnapshotReader(prisma: ProposalsPrisma): SnapshotReaderPort {
  return {
    findProposal: (id) =>
      prisma.proposal.findUnique({ where: { id }, select: SNAPSHOT_SELECT }),
    countMembers: (proposalId) =>
      prisma.proposalMemberSnapshot.count({ where: { proposalId } }),
    findMemberWeight: async (proposalId, memberId) => {
      const row = await prisma.proposalMemberSnapshot.findUnique({
        where: { proposalId_memberId: { proposalId, memberId } },
      });
      return row ? row.activeGovernanceToken : null;
    },
  };
}

/** Resolve the real Proposals deps, or the test-injected set when present. */
export async function resolveProposalsDeps(): Promise<ProposalsDeps> {
  if (testDeps !== null) {
    return testDeps;
  }

  const runtime = await getEngineRuntime();
  const prisma = getPrisma() as unknown as ProposalsPrisma;

  return {
    engine: runtime.proposal,
    membership: buildMembership(prisma),
    snapshot: buildSnapshotReader(prisma),
    idempotency: createPrismaIdempotencyStore(
      getPrisma() as unknown as PrismaIdempotencyDb,
    ),
    authorizeAdmin: defaultAuthorizeAdmin,
  };
}
