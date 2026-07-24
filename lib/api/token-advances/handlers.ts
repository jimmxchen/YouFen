// Pure Token-Advances API handlers (PRD §27, conventions §API-endpoint-group).
// Every handler is a (deps, input) => Promise<ApiResult> function with all
// collaborators injected — it imports nothing from the runtime, so it is fully
// unit-testable with structural fakes. Route adapters wire real deps.
//
// Five endpoints:
//   POST /api/token-advances                     -> handleCreateAdvance (idempotent)
//   GET  /api/token-advances/:id                 -> handleGetAdvance     (db read)
//   POST /api/token-advances/:id/second-approve  -> handleSecondApprove
//   POST /api/token-advances/:id/create-proposal -> handleCreateProposal
//   POST /api/token-advances/:id/execute         -> handleExecuteAdvance

import { z } from 'zod';

import type {
  AdvanceRequestInput,
  AdvanceRequestSummary,
  MintOutcome,
  ProposalCreateInput,
} from '../../engine/types';
import {
  fail,
  hashRequestBody,
  mapEngineError,
  ok,
  parseBody,
  requireVerifiedActor,
  withIdempotency,
  zBigIntAmount,
  zId,
  type ApiResult,
  type AuthContext,
  type AuthorizeAdminFn,
  type IdempotencyStore,
} from '../core';

// ---- Injected ports (structural subsets of the engine services) ----

/** The advance-service surface the handlers touch. */
export interface AdvanceEnginePort {
  createRequest(input: AdvanceRequestInput): Promise<AdvanceRequestSummary>;
  secondApprove(id: string, approverId: string): Promise<AdvanceRequestSummary>;
  attachProposal(id: string, proposalId: string): Promise<AdvanceRequestSummary>;
  execute(input: {
    requestId: string;
    memberId?: string;
    evidenceUrls?: string[];
  }): Promise<MintOutcome>;
}

/** The proposal-service surface the create-proposal handler touches. */
export interface ProposalCreatePort {
  create(input: ProposalCreateInput): Promise<{ proposalId: string }>;
}

/** A structural view of a persisted TokenAdvanceRequest row (bigints as bigint). */
export interface AdvanceRequestRow {
  readonly id: string;
  readonly communityId: string;
  readonly epochId: string;
  readonly memberId: string;
  readonly requestedAmount: bigint;
  readonly approvedAmount: bigint | null;
  readonly advanceRateBps: number;
  readonly reason: string;
  readonly status: string;
  readonly relatedParty: boolean;
  readonly requestedBy: string;
  readonly secondApprovedBy: string | null;
  readonly proposalId: string | null;
  readonly publicRecordId: string | null;
  readonly createdAt: Date;
}

/** Direct db read for detail + read-back (conventions: GET is a plain db read). */
export interface AdvanceReadPort {
  findById(id: string): Promise<AdvanceRequestRow | null>;
}

/** The dependency bundle every advance handler receives. */
export interface AdvanceDeps {
  readonly advance: AdvanceEnginePort;
  readonly proposal: ProposalCreatePort;
  readonly reader: AdvanceReadPort;
  readonly authorizeAdmin: AuthorizeAdminFn;
  readonly idempotencyStore: IdempotencyStore;
}

// ---- Helpers ----

const ADVANCE_ENDPOINT = 'POST /api/token-advances';

type ApprovalPath = 'dual_admin' | 'community_proposal';

/** Map the created request status onto its approval path (PRD §27). */
function approvalPathFor(status: string): ApprovalPath {
  return status === 'pending_proposal' ? 'community_proposal' : 'dual_admin';
}

/** Read the `code` off an engine-shaped error, if present. */
function engineCodeOf(e: unknown): string | null {
  if (e instanceof Error && 'code' in e) {
    const code = (e as Error & { code: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Internal server error';
}

/** Zod schema for the create-advance body (conventions §data-and-types). */
const createBodySchema = z.object({
  communityId: zId,
  memberId: zId,
  requestedAmount: zBigIntAmount.refine((v) => v > 0n, {
    message: 'requestedAmount must be greater than 0',
  }),
  reason: z.string().min(1).max(1000),
  contributionIds: z.array(zId).optional(),
  relatedParty: z.boolean().optional(),
  isSpecialNoContribution: z.boolean().optional(),
});

/** Zod schema for the execute body (both fields optional). */
const executeBodySchema = z.object({
  memberId: zId.optional(),
  evidenceUrls: z.array(z.string()).optional(),
});

/**
 * POST /api/token-advances — create a request (idempotent). Validates the body,
 * enforces admin authz, requires an actor identity (requestedBy), then runs the
 * engine create under the Idempotency-Key. ADVANCE_RATE_EXCEEDED and
 * ROLLING_ADVANCE_FORBIDDEN surface as 409 with an explanatory `details.reason`.
 */
export async function handleCreateAdvance(
  deps: AdvanceDeps,
  input: { body: unknown; auth: AuthContext; idempotencyKey: string | null },
): Promise<ApiResult> {
  const parsed = parseBody(createBodySchema, input.body);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  if (!(await deps.authorizeAdmin(input.auth, data.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }
  const actorId = input.auth.actorId;
  if (actorId === null) {
    return fail(401, 'UNAUTHORIZED', 'Actor identity is required to create an advance request');
  }

  return withIdempotency(
    deps.idempotencyStore,
    {
      endpoint: ADVANCE_ENDPOINT,
      key: input.idempotencyKey,
      requestHash: hashRequestBody(jsonForHash(data)),
    },
    async () => {
      try {
        const created = await deps.advance.createRequest({
          communityId: data.communityId,
          memberId: data.memberId,
          amount: data.requestedAmount,
          requestedBy: actorId,
          reason: data.reason,
          contributionIds: data.contributionIds,
          isSpecialNoContribution: data.isSpecialNoContribution,
        });
        const row = await deps.reader.findById(created.requestId);
        return ok(
          {
            advanceRequestId: created.requestId,
            status: created.status,
            advanceRateBps: row?.advanceRateBps ?? 0,
            approvalPath: approvalPathFor(created.status),
          },
          201,
        );
      } catch (e: unknown) {
        const code = engineCodeOf(e);
        if (code === 'ADVANCE_RATE_EXCEEDED' || code === 'ROLLING_ADVANCE_FORBIDDEN') {
          return fail(409, code, messageOf(e), { reason: messageOf(e) });
        }
        return mapEngineError(e);
      }
    },
  );
}

/** Build a hash-stable, bigint-free view of the create body for idempotency. */
function jsonForHash(data: z.infer<typeof createBodySchema>): Record<string, unknown> {
  return {
    communityId: data.communityId,
    memberId: data.memberId,
    requestedAmount: data.requestedAmount.toString(),
    reason: data.reason,
    contributionIds: data.contributionIds ?? null,
    relatedParty: data.relatedParty ?? null,
    isSpecialNoContribution: data.isSpecialNoContribution ?? null,
  };
}

/**
 * GET /api/token-advances/:id — admin, direct db read. bigints are serialized to
 * strings by ok()/jsonSafe. 404 when the request does not exist.
 */
export async function handleGetAdvance(
  deps: AdvanceDeps,
  input: { id: string; auth: AuthContext },
): Promise<ApiResult> {
  const row = await deps.reader.findById(input.id);
  if (row === null) {
    return fail(404, 'NOT_FOUND', `Advance request '${input.id}' not found`);
  }
  if (!(await deps.authorizeAdmin(input.auth, row.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }
  return ok({
    advanceRequestId: row.id,
    communityId: row.communityId,
    epochId: row.epochId,
    memberId: row.memberId,
    requestedAmount: row.requestedAmount,
    approvedAmount: row.approvedAmount,
    advanceRateBps: row.advanceRateBps,
    reason: row.reason,
    status: row.status,
    relatedParty: row.relatedParty,
    requestedBy: row.requestedBy,
    secondApprovedBy: row.secondApprovedBy,
    proposalId: row.proposalId,
    publicRecordId: row.publicRecordId,
    createdAt: row.createdAt.toISOString(),
  });
}

/**
 * POST /api/token-advances/:id/second-approve — the distinct-admin second
 * approval. Self-approval (approver === requester) surfaces as 403 FORBIDDEN;
 * a non pending_second_approval status as 409; an already-approved replay by the
 * same admin is idempotent 200.
 */
export async function handleSecondApprove(
  deps: AdvanceDeps,
  input: { id: string; auth: AuthContext },
): Promise<ApiResult> {
  const row = await deps.reader.findById(input.id);
  if (row === null) {
    return fail(404, 'NOT_FOUND', `Advance request '${input.id}' not found`);
  }
  if (!(await deps.authorizeAdmin(input.auth, row.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }
  // Separation of duties (auth.ts §SEPARATION OF DUTIES): the distinct second
  // approver MUST be a credential-bound (verified) principal, never a forgeable
  // x-youfen-actor-id header. Without this a single shared-token operator could
  // second-approve their own request under a different header value and still
  // pass the engine's distinct-approver check (advance-service.ts:159/275).
  let actorId: string;
  try {
    actorId = requireVerifiedActor(input.auth);
  } catch (e: unknown) {
    return mapEngineError(e);
  }
  try {
    const summary = await deps.advance.secondApprove(input.id, actorId);
    return ok({ advanceRequestId: input.id, status: summary.status }, 200);
  } catch (e: unknown) {
    return mapEngineError(e);
  }
}

/**
 * POST /api/token-advances/:id/create-proposal — attach a community proposal to a
 * pending_proposal advance. An already-attached proposal is reused (200); only a
 * pending_proposal request may create one (INVALID_STATUS -> 409 otherwise).
 */
export async function handleCreateProposal(
  deps: AdvanceDeps,
  input: { id: string; auth: AuthContext },
): Promise<ApiResult> {
  const row = await deps.reader.findById(input.id);
  if (row === null) {
    return fail(404, 'NOT_FOUND', `Advance request '${input.id}' not found`);
  }
  if (!(await deps.authorizeAdmin(input.auth, row.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }
  if (row.proposalId !== null) {
    return ok({ proposalId: row.proposalId }, 200);
  }
  if (row.status !== 'pending_proposal') {
    return fail(409, 'INVALID_STATUS', `cannot create a proposal from status '${row.status}'`);
  }
  const actorId = input.auth.actorId;
  if (actorId === null) {
    return fail(401, 'UNAUTHORIZED', 'Actor identity is required to create a proposal');
  }
  try {
    const { proposalId } = await deps.proposal.create({
      communityId: row.communityId,
      title: `Budget advance approval for request ${input.id}`,
      type: 'budget_advance',
      createdBy: actorId,
      options: [{ id: 'approve' }, { id: 'reject' }],
      metadata: {
        advanceAmount: row.requestedAmount,
        policyChangePayload: { advanceRequestId: input.id },
      },
    });
    await deps.advance.attachProposal(input.id, proposalId);
    return ok({ proposalId }, 201);
  } catch (e: unknown) {
    return mapEngineError(e);
  }
}

/**
 * POST /api/token-advances/:id/execute — perform the advance mint. Idempotent via
 * the engine's advanceRequestId re-lookup: replaying an already-executed request
 * returns 200 with `idempotent: true`. Missing approval surfaces as 403
 * APPROVAL_REQUIRED (message names the required path); a non-approved status 409.
 */
export async function handleExecuteAdvance(
  deps: AdvanceDeps,
  input: { id: string; body: unknown; auth: AuthContext },
): Promise<ApiResult> {
  const parsed = parseBody(executeBodySchema, input.body);
  if (!parsed.ok) return parsed.response;

  const row = await deps.reader.findById(input.id);
  if (row === null) {
    return fail(404, 'NOT_FOUND', `Advance request '${input.id}' not found`);
  }
  if (!(await deps.authorizeAdmin(input.auth, row.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }
  const wasExecuted = row.status === 'executed';
  try {
    const outcome = await deps.advance.execute({
      requestId: input.id,
      memberId: parsed.data.memberId,
      evidenceUrls: parsed.data.evidenceUrls,
    });
    return ok(
      {
        advanceRequestId: input.id,
        ...(wasExecuted ? { idempotent: true } : {}),
        mintEvents: outcome.mintEvents,
        memberBalanceAfter: outcome.memberBalanceAfter,
        totalSupplyAfter: outcome.totalSupplyAfter,
      },
      200,
    );
  } catch (e: unknown) {
    const code = engineCodeOf(e);
    if (code === 'PROPOSAL_REQUIRED') {
      return fail(
        403,
        'APPROVAL_REQUIRED',
        'This advance requires a recorded community proposal before it can be executed',
      );
    }
    if (code === 'SECOND_APPROVER_REQUIRED') {
      return fail(
        403,
        'APPROVAL_REQUIRED',
        'This advance requires a second, distinct admin approval before it can be executed',
      );
    }
    return mapEngineError(e);
  }
}
