// Pure Proposals API handlers (PRD §27). Every handler is a
// (deps, input) => Promise<ApiResult> function with all collaborators injected —
// it imports nothing from the runtime, so it is fully unit-testable with
// structural fakes. Route adapters (route.ts) wire the real deps from deps.ts.
//
// Endpoints:
//   POST /api/proposals                 create (member, Idempotency-Key)
//   POST /api/proposals/:id/start        activate (admin)
//   GET  /api/proposals/:id/snapshot     frozen snapshot (public, DB read)
//   POST /api/proposals/:id/vote         cast vote (member)
//   POST /api/proposals/:id/end          settle result (admin/internal)

import { z } from 'zod';

import type { ProposalCreateInput, ProposalService, ProposalType } from '../../engine/types';
import {
  ok,
  fail,
  mapEngineError,
  parseBody,
  withIdempotency,
  hashRequestBody,
  zBps,
  zBigIntAmount,
  zId,
  type ApiResult,
  type AuthContext,
  type AuthorizeAdminFn,
  type IdempotencyContext,
  type IdempotencyStore,
} from '../core';

// ---- Injected ports (structural subsets of the engine + DB) ----------------

/** The proposal-engine surface the handlers drive (the whole ProposalService). */
export type ProposalEnginePort = Pick<
  ProposalService,
  'create' | 'activate' | 'castVote' | 'end'
>;

/** Membership check: production verifies a MemberTokenBalance row exists. */
export interface MembershipPort {
  isMember(communityId: string, memberId: string): Promise<boolean>;
}

/** The frozen snapshot columns the public GET reads directly from the DB. */
export interface ProposalSnapshotRow {
  readonly id: string;
  readonly communityId: string;
  readonly status: string;
  readonly snapshotAt: Date | null;
  readonly epochIdSnapshot: string | null;
  readonly epochNumberSnapshot: number | null;
  readonly totalSupplySnapshot: bigint | null;
  readonly activeGovernanceSupplySnapshot: bigint | null;
  readonly tokenPolicyVersionSnapshot: number | null;
  readonly snapshotPublicRecordId: string | null;
}

/** Read-only DB port for the public snapshot endpoint. */
export interface SnapshotReaderPort {
  findProposal(id: string): Promise<ProposalSnapshotRow | null>;
  countMembers(proposalId: string): Promise<number>;
  findMemberWeight(proposalId: string, memberId: string): Promise<bigint | null>;
}

/** The full dependency set the five proposal handlers draw from. */
export interface ProposalsDeps {
  readonly engine: ProposalEnginePort;
  readonly membership: MembershipPort;
  readonly snapshot: SnapshotReaderPort;
  readonly idempotency: IdempotencyStore;
  readonly authorizeAdmin: AuthorizeAdminFn;
}

// ---- Request schemas (Zod, validated at the boundary) ----------------------

const PROPOSAL_TYPES = [
  'community_decision',
  'token_policy_change',
  'budget_advance',
  'special_mint',
  'related_party_mint',
  'token_reversal',
] as const satisfies readonly ProposalType[];

const optionSchema = z.object({ id: zId, label: z.string().optional() });

// policyChangePayload is a permissive union: three-bps + optional rules for
// token_policy_change, or advanceRequestId / targetMintEventId for the advance /
// reversal linkage. The engine enforces the exact per-type shape and throws
// VALIDATION_ERROR (-> 400) when a required field is missing.
const policyChangePayloadSchema = z.object({
  monthlyInflationRateBps: zBps.optional(),
  maxAdvanceRateBps: zBps.optional(),
  memberMintCapRateBps: zBps.optional(),
  rules: z.unknown().optional(),
  advanceRequestId: z.string().min(1).optional(),
  targetMintEventId: z.string().min(1).optional(),
});

const createProposalSchema = z.object({
  communityId: zId,
  type: z.enum(PROPOSAL_TYPES),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  options: z.array(optionSchema).min(2),
  minimumVoterCount: z.number().int().min(1).optional(),
  endTime: z.string().datetime().optional(),
  advanceAmount: zBigIntAmount.optional(),
  specialMintRecipientId: z.string().min(1).optional(),
  specialMintAmount: zBigIntAmount.optional(),
  policyChangePayload: policyChangePayloadSchema.optional(),
  relatedPartyNote: z.string().optional(),
});

const voteSchema = z.object({ memberId: zId, optionId: zId });

type CreateProposalBody = z.infer<typeof createProposalSchema>;

const CREATE_ENDPOINT = 'POST /api/proposals';

// ---- Handlers --------------------------------------------------------------

/** Assemble the engine ProposalCreateInput from a validated request body.
 *  description / minimumVoterCount / endTime are carried in metadata for
 *  forward-compatibility; the current engine.create consumes only the subset it
 *  recognises (HANDOFF: persist these once the engine create signature grows). */
function toCreateInput(body: CreateProposalBody, createdBy: string): ProposalCreateInput {
  return {
    communityId: body.communityId,
    title: body.title,
    type: body.type,
    createdBy,
    options: body.options,
    metadata: {
      policyChangePayload: body.policyChangePayload,
      advanceAmount: body.advanceAmount,
      specialMintRecipientId: body.specialMintRecipientId,
      specialMintAmount: body.specialMintAmount,
      relatedPartyNote: body.relatedPartyNote,
      description: body.description,
      minimumVoterCount: body.minimumVoterCount,
      endTime: body.endTime,
    },
  };
}

/**
 * POST /api/proposals — a community member opens a proposal. Membership is
 * checked before any work; the create call is wrapped in Idempotency-Key
 * replay so a retried submit never opens a duplicate proposal.
 */
export async function handleCreateProposal(
  deps: ProposalsDeps,
  input: { auth: AuthContext; body: unknown; idempotencyKey: string | null },
): Promise<ApiResult> {
  const parsed = parseBody(createProposalSchema, input.body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const actorId = input.auth.actorId;
  if (actorId === null) {
    return fail(403, 'FORBIDDEN', 'A member identity is required to create a proposal');
  }
  const member = await deps.membership.isMember(body.communityId, actorId);
  if (!member) {
    return fail(403, 'FORBIDDEN', 'Only community members can create proposals');
  }

  const ctx: IdempotencyContext = {
    endpoint: CREATE_ENDPOINT,
    key: input.idempotencyKey,
    requestHash: hashRequestBody(input.body),
  };
  return withIdempotency(deps.idempotency, ctx, async () => {
    try {
      const { proposalId } = await deps.engine.create(toCreateInput(body, actorId));
      return ok({ proposalId }, 201);
    } catch (error: unknown) {
      return mapEngineError(error);
    }
  });
}

/**
 * POST /api/proposals/:id/start — an admin freezes the dual-Merkle snapshot and
 * opens voting. A re-run on an already-active proposal is a 200 noop.
 */
export async function handleStartProposal(
  deps: ProposalsDeps,
  input: { auth: AuthContext; proposalId: string },
): Promise<ApiResult> {
  const allowed = await deps.authorizeAdmin(input.auth, '');
  if (!allowed) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }
  try {
    const result = await deps.engine.activate(input.proposalId);
    if ('noop' in result) {
      return ok({ idempotent: true });
    }
    return ok({ snapshotRecordId: result.snapshotRecordId });
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}

/**
 * GET /api/proposals/:id/snapshot — public, unauthenticated read of the frozen
 * snapshot columns plus the sealed member count. A not-yet-activated proposal
 * (no snapshotAt) is 409. An optional ?memberId= attaches that member's frozen
 * governance weight (null if outside the snapshot).
 *
 * TODO(HANDOFF): a self-proving merkleProof for the queried memberWeight is not
 * yet returned — computing it requires re-deriving the weights tree from the
 * frozen snapshot rows. Callers can verify weights against weightsMerkleRoot in
 * the proposal_snapshot public record once that path lands.
 */
export async function handleGetSnapshot(
  deps: ProposalsDeps,
  input: { proposalId: string; memberId?: string | null },
): Promise<ApiResult> {
  const proposal = await deps.snapshot.findProposal(input.proposalId);
  if (!proposal) {
    return fail(404, 'NOT_FOUND', `Proposal '${input.proposalId}' not found`);
  }
  if (proposal.snapshotAt === null) {
    return fail(409, 'INVALID_STATUS', 'Proposal has not been activated (no snapshot yet)');
  }

  const memberCount = await deps.snapshot.countMembers(input.proposalId);
  const base = {
    proposalId: proposal.id,
    status: proposal.status,
    snapshotAt: proposal.snapshotAt.toISOString(),
    epochIdSnapshot: proposal.epochIdSnapshot,
    epochNumberSnapshot: proposal.epochNumberSnapshot,
    totalSupplySnapshot: proposal.totalSupplySnapshot,
    activeGovernanceSupplySnapshot: proposal.activeGovernanceSupplySnapshot,
    tokenPolicyVersionSnapshot: proposal.tokenPolicyVersionSnapshot,
    memberCount,
    snapshotPublicRecordId: proposal.snapshotPublicRecordId,
  };

  const memberId = input.memberId ?? null;
  if (memberId !== null && memberId.length > 0) {
    const memberWeight = await deps.snapshot.findMemberWeight(input.proposalId, memberId);
    return ok({ ...base, memberWeight });
  }
  return ok(base);
}

/**
 * POST /api/proposals/:id/vote — a member casts a snapshot-bound vote. A repeat
 * vote is idempotent (200). The engine rejects a member outside the snapshot
 * (FORBIDDEN -> 403) and a closed proposal (INVALID_STATUS -> 409).
 *
 * HANDOFF: the ballot memberId is trusted from the body for now. In production
 * it MUST be bound to the authenticated actor (input.auth.actorId) so a caller
 * cannot vote on another member's behalf.
 */
export async function handleVote(
  deps: ProposalsDeps,
  input: { auth: AuthContext; proposalId: string; body: unknown },
): Promise<ApiResult> {
  const parsed = parseBody(voteSchema, input.body);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await deps.engine.castVote({
      proposalId: input.proposalId,
      memberId: parsed.data.memberId,
      optionId: parsed.data.optionId,
    });
    if (result.idempotent === true) {
      return ok({ idempotent: true });
    }
    return ok({ voteId: result.voteId }, 201);
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}

/**
 * POST /api/proposals/:id/end — an admin or internal caller settles the tally.
 * A proposal that is not yet due is 409; an already-ended proposal is a 200
 * noop. totalVoteWeight is serialized as a decimal string (bigint via jsonSafe).
 */
export async function handleEndProposal(
  deps: ProposalsDeps,
  input: { auth: AuthContext; proposalId: string },
): Promise<ApiResult> {
  const allowed = await deps.authorizeAdmin(input.auth, '');
  if (!allowed) {
    return fail(403, 'FORBIDDEN', 'Admin or internal authorization required');
  }
  try {
    const result = await deps.engine.end(input.proposalId);
    if ('noop' in result) {
      return ok({ idempotent: true });
    }
    return ok({
      winningOptionId: result.winningOptionId,
      voterCount: result.voterCount,
      totalVoteWeight: result.totalVoteWeight,
      quorumMet: result.quorumMet,
      resultRecordId: result.resultRecordId,
    });
  } catch (error: unknown) {
    return mapEngineError(error);
  }
}
