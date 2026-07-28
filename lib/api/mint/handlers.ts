// Pure MINT API handlers (docs/BLOCKCHAIN-DESIGN-v0.7.md §6, endpoints #4-#7 +
// ChainAction state machine §7). Four handlers spanning the mint write vertical:
//
//   POST /api/contributions/:id/mint-request  build the MintAuthorization +
//       EIP-712 envelope the approver(s) sign; persist a SignatureRequest
//       (kind execute_mint). Community-admin. Idempotency-Key required.
//   GET  /api/mint-requests/:id               the request + collected signatures
//       + the eip712 envelope. Community-admin.
//   POST /api/mint-requests/:id/sign          RECEIVE an approver signature;
//       recover the signer, verify it is an approver of the community and is not
//       the recipient, store it; when the threshold is met build the ChainAction
//       (execute_mint) and mark it ready_to_submit.
//   POST /api/mint-requests/:id/submit        idempotent trigger — ensure a
//       ready_to_submit ChainAction exists for this request; return its id +
//       status. The cron submitter (never this handler) broadcasts it.
//
// The SERVER NEVER SIGNS: /sign receives a signature and recovers the signer
// (lib/blockchain/signing/recover); the on-chain contract remains the sole
// authority. Every handler is a (deps, ctx) => Promise<ApiResult> pure function
// so it is fully DB/unit-testable with an injected fake runtime + prisma. All
// amounts (uint256) cross JSON as decimal STRINGS, never JS numbers.

import { z } from 'zod';

import { hashCommunityId, hashProposalId } from '../../blockchain/hashing/id-hash';
import { computeRecordHash, keccakUtf8 } from '../../blockchain/hashing/record-hash';
import type { Hex32, RecordEnvelope } from '../../blockchain/types';
import {
  mintDigest,
  type Eip712Domain,
  type MintAuthorization,
} from '../../blockchain/signing/typed-data';
import { recoverMintSigner } from '../../blockchain/signing/recover';
import { assembleMint } from '../../blockchain/signatures/request-assembler';
import {
  addSignature,
  createSignatureRequest,
  getRequestWithSignatures,
} from '../../blockchain/signatures/signature-request-service';
import {
  createChainAction,
  markReadyToSubmit,
  type ChainCall,
} from '../../blockchain/relay/chain-action-service';

import {
  deadline as deadlineFromTtl,
  freshNonce,
  resolveCommunityContext,
  resolveMemberIdHash,
} from '../chain-write/context';
import { resolveAuthFromHeaders, type HeaderReader } from '../core/auth';
import { withIdempotency, hashRequestBody } from '../core/idempotency';
import { fail, mapEngineError, ok, type ApiResult } from '../core/respond';
import { parseBody, zBigIntAmount } from '../core/validation';

import type { MintDeps } from './deps';

const ZERO32: Hex32 = `0x${'00'.repeat(32)}`;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_TTL_SECONDS = 3600;
/** Community roles whose recipients escalate the approval tier (related party). */
const RELATED_PARTY_ROLES: ReadonlySet<string> = new Set(['owner', 'manager']);

// ---- Request context shapes ----------------------------------------------

export interface MintRequestCtx {
  readonly headers: HeaderReader;
  readonly contributionId: string;
  readonly body: unknown;
  readonly idempotencyKey: string | null;
}

export interface MintRequestGetCtx {
  readonly headers: HeaderReader;
  readonly mintRequestId: string;
}

export interface MintSignCtx {
  readonly headers: HeaderReader;
  readonly mintRequestId: string;
  readonly body: unknown;
}

export interface MintSubmitCtx {
  readonly headers: HeaderReader;
  readonly mintRequestId: string;
  readonly idempotencyKey: string | null;
}

// ---- Request schemas -----------------------------------------------------

const mintRequestSchema = z.object({
  // Both amount legs are optional decimal strings; regularAmount defaults to the
  // contribution's approved (else suggested) amount, advanceAmount to 0.
  regularAmount: zBigIntAmount.optional(),
  advanceAmount: zBigIntAmount.optional(),
  // Override the recipient related-party flag; defaults to the member's role.
  relatedParty: z.boolean().optional(),
  // Plaintext governing proposal id (hashed to bytes32); required when the
  // approval tier escalates to a proposal.
  proposalId: z.string().min(1).optional(),
  ttlSeconds: z.number().int().min(60).max(2_592_000).optional(),
});

const signSchema = z.object({
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, 'signature must be 0x-hex'),
});

// ---- Stored-envelope narrowing -------------------------------------------

/** The JSON-safe EIP-712 envelope persisted on a SignatureRequest. */
interface StoredEnvelope {
  readonly domain: Eip712Domain;
  readonly message: Record<string, string | number | boolean>;
  readonly digest: Hex32;
}

function asStoredEnvelope(typedData: unknown): StoredEnvelope | null {
  if (typedData === null || typeof typedData !== 'object') return null;
  const t = typedData as Record<string, unknown>;
  if (
    typeof t.domain !== 'object' ||
    t.domain === null ||
    typeof t.message !== 'object' ||
    t.message === null ||
    typeof t.digest !== 'string'
  ) {
    return null;
  }
  return {
    domain: t.domain as Eip712Domain,
    message: t.message as Record<string, string | number | boolean>,
    digest: t.digest as Hex32,
  };
}

/** Reconstruct the MintAuthorization struct from a stored JSON-safe message. */
function messageToMintAuth(m: Record<string, string | number | boolean>): MintAuthorization {
  return {
    communityId: String(m.communityId) as Hex32,
    memberIdHash: String(m.memberIdHash) as Hex32,
    contributionId: String(m.contributionId) as Hex32,
    ruleVersion: Number(m.ruleVersion),
    epochNumber: BigInt(m.epochNumber as string | number),
    regularAmount: BigInt(m.regularAmount as string),
    advanceAmount: BigInt(m.advanceAmount as string),
    relatedParty: Boolean(m.relatedParty),
    proposalId: String(m.proposalId) as Hex32,
    evidenceHash: String(m.evidenceHash) as Hex32,
    recordHash: String(m.recordHash) as Hex32,
    nonce: BigInt(m.nonce as string),
    deadline: BigInt(m.deadline as string),
  };
}

/**
 * The ordered executeMint tuple the submitter feeds to encodeFunctionData. All
 * values are JSON-safe (decimal strings for uint256, numbers for uint32/uint64,
 * hex for bytes32, a boolean for bool) so the calldata survives the Json column.
 */
function messageToAuthTuple(
  m: Record<string, string | number | boolean>,
): (string | number | boolean)[] {
  return [
    String(m.communityId),
    String(m.memberIdHash),
    String(m.contributionId),
    Number(m.ruleVersion),
    typeof m.epochNumber === 'number' ? m.epochNumber : String(m.epochNumber),
    String(m.regularAmount),
    String(m.advanceAmount),
    Boolean(m.relatedParty),
    String(m.proposalId),
    String(m.evidenceHash),
    String(m.recordHash),
    String(m.nonce),
    String(m.deadline),
  ];
}

// ---- Evidence / record hashing -------------------------------------------

/** keccak of the off-chain evidence bundle (ZERO32 when there is no evidence). */
function evidenceHashOf(evidence: readonly string[]): Hex32 {
  if (evidence.length === 0) return ZERO32;
  return keccakUtf8(JSON.stringify(evidence));
}

/** The on-chain bytes32 idempotency key derived from the contribution row id. */
function contributionIdHashOf(contributionId: string): Hex32 {
  return keccakUtf8(`youfen:contribution:v1:${contributionId}`);
}

/**
 * Canonical recordHash for this mint authorization (v0.6 canonical pipeline:
 * computeRecordHash over a sorted-key envelope). The fresh nonce makes it unique
 * per authorization so the contract's recordExists guard is never falsely hit.
 */
function mintRecordHash(fields: {
  readonly communityIdHash: Hex32;
  readonly memberIdHash: Hex32;
  readonly contributionIdHash: Hex32;
  readonly ruleVersion: number;
  readonly epochNumber: number;
  readonly regularAmount: bigint;
  readonly advanceAmount: bigint;
  readonly relatedParty: boolean;
  readonly evidenceHash: Hex32;
  readonly nonce: bigint;
}): Hex32 {
  const envelope: RecordEnvelope = {
    schema: 'youfen.record.v1',
    type: fields.advanceAmount > 0n && fields.regularAmount === 0n ? 'advance_mint' : 'token_mint',
    payload: {
      communityIdHash: fields.communityIdHash,
      memberIdHash: fields.memberIdHash,
      contributionId: fields.contributionIdHash,
      ruleVersion: fields.ruleVersion,
      epochNumber: fields.epochNumber,
      regularAmount: fields.regularAmount.toString(10),
      advanceAmount: fields.advanceAmount.toString(10),
      relatedParty: fields.relatedParty,
      evidenceHash: fields.evidenceHash,
      nonce: fields.nonce.toString(10),
    },
  };
  return computeRecordHash(envelope);
}

// ---- Handler 1: POST /api/contributions/:id/mint-request -----------------

/**
 * Build + persist a mint SignatureRequest for a contribution. Loads the
 * Contribution + on-chain community context, resolves the peppered memberIdHash,
 * the canonical recordHash + evidenceHash, assembles the MintAuthorization and
 * its approval requirement (fail-fast: forbidden advance -> 422, unattached
 * required proposal -> 422), and stores a `collecting` SignatureRequest.
 * Community-admin only. Idempotency-Key required (a fresh nonce per call means
 * replays MUST return the stored envelope, not a new one).
 */
export async function handleMintRequest(deps: MintDeps, ctx: MintRequestCtx): Promise<ApiResult> {
  const auth = resolveAuthFromHeaders(ctx.headers, deps.authEnv);

  const contribution = await deps.prisma.contribution.findUnique({
    where: { id: ctx.contributionId },
  });
  if (contribution === null) {
    return fail(404, 'NOT_FOUND', `Contribution '${ctx.contributionId}' not found`);
  }
  if (!(await deps.authorizeAdmin(auth, contribution.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization is required');
  }

  const parsed = parseBody(mintRequestSchema, ctx.body);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  return withIdempotency(
    deps.idempotency,
    {
      endpoint: `POST /api/contributions/${ctx.contributionId}/mint-request`,
      key: ctx.idempotencyKey,
      requestHash: hashRequestBody(ctx.body),
    },
    async () => {
      try {
        const community = await resolveCommunityContext(deps.runtime, contribution.communityId);

        const regularAmount =
          input.regularAmount ??
          contribution.approvedTokenAmount ??
          contribution.suggestedTokenAmount;
        const advanceAmount = input.advanceAmount ?? 0n;

        let relatedParty = input.relatedParty ?? false;
        if (input.relatedParty === undefined) {
          const member = await deps.prisma.member.findUnique({
            where: { id: contribution.memberId },
          });
          relatedParty = member !== null && RELATED_PARTY_ROLES.has(member.role);
        }

        const communityIdHash = hashCommunityId(contribution.communityId);
        const memberIdHash = resolveMemberIdHash(
          contribution.communityId,
          contribution.memberId,
          deps.config.pepper,
        );
        const contributionIdHash = contributionIdHashOf(contribution.id);
        const evidenceHash = evidenceHashOf(contribution.evidence);
        const ruleVersion = community.activePolicyVersion;
        const epochNumber = Number(community.currentEpochNumber);
        const nonce = freshNonce();
        const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
        const authDeadline = deadlineFromTtl(ttl);
        const proposalIdHash = input.proposalId ? hashProposalId(input.proposalId) : undefined;

        const recordHash = mintRecordHash({
          communityIdHash,
          memberIdHash,
          contributionIdHash,
          ruleVersion,
          epochNumber,
          regularAmount,
          advanceAmount,
          relatedParty,
          evidenceHash,
          nonce,
        });

        const assembled = assembleMint({
          domain: community.domain,
          communityId: communityIdHash,
          memberIdHash,
          contributionId: contributionIdHash,
          ruleVersion,
          epochNumber,
          regularAmount,
          advanceAmount,
          relatedParty,
          ...(proposalIdHash !== undefined ? { proposalId: proposalIdHash } : {}),
          evidenceHash,
          recordHash,
          nonce,
          deadline: authDeadline,
          baseMintBudget: community.baseMintBudget,
          epochAdvanceMinted: community.epochAdvanceMinted,
          approverThreshold: community.approverThreshold,
        });

        if (assembled.approval.forbidden) {
          return fail(
            422,
            'ADVANCE_LIMIT_EXCEEDED',
            'The requested advance exceeds the cumulative advance limit and cannot be authorized',
            { reason: assembled.approval.reason },
          );
        }
        if (assembled.approval.proposalRequired && input.proposalId === undefined) {
          return fail(
            422,
            'PROPOSAL_REQUIRED',
            'This mint requires an approved governing proposal; attach proposalId and retry',
            { reason: assembled.approval.reason, tier: assembled.approval.tier },
          );
        }

        const created = await createSignatureRequest(deps.prisma, {
          communityId: contribution.communityId,
          kind: 'execute_mint',
          requiredRole: 'approver',
          requiredCount: assembled.approval.requiredApprovers,
          typedData: assembled.envelope,
          digest: assembled.digest,
          recordHash,
          contributionId: contribution.id,
          proposalId: input.proposalId ?? null,
          memberIdHash,
          nonce: nonce.toString(10),
          deadline: BigInt(authDeadline),
        });

        return ok(
          {
            mintRequestId: created.id,
            created: created.created,
            kind: 'execute_mint',
            digest: assembled.digest,
            recordHash,
            requiredApprovers: assembled.approval.requiredApprovers,
            approvalTier: assembled.approval.tier,
            proposalRequired: assembled.approval.proposalRequired,
            memberIdHash,
            contributionId: contribution.id,
            envelope: assembled.envelope,
          },
          201,
        );
      } catch (error: unknown) {
        return mapEngineError(error);
      }
    },
  );
}

// ---- Handler 2: GET /api/mint-requests/:id -------------------------------

/** The SignatureRequest + its collected signatures + the eip712 envelope. */
export async function handleGetMintRequest(
  deps: MintDeps,
  ctx: MintRequestGetCtx,
): Promise<ApiResult> {
  const auth = resolveAuthFromHeaders(ctx.headers, deps.authEnv);
  const request = await getRequestWithSignatures(deps.prisma, ctx.mintRequestId);
  if (request === null) {
    return fail(404, 'NOT_FOUND', `Mint request '${ctx.mintRequestId}' not found`);
  }
  if (!(await deps.authorizeAdmin(auth, request.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization is required');
  }

  const distinctCount = request.signatures.length;
  return ok({
    id: request.id,
    communityId: request.communityId,
    kind: request.kind,
    status: request.status,
    requiredRole: request.requiredRole,
    requiredCount: request.requiredCount,
    collectedCount: distinctCount,
    ready: distinctCount >= request.requiredCount,
    digest: request.digest,
    recordHash: request.recordHash,
    contributionId: request.contributionId,
    proposalId: request.proposalId,
    memberIdHash: request.memberIdHash,
    nonce: request.nonce,
    deadline: request.deadline,
    envelope: request.typedData,
    signatures: request.signatures.map((s) => ({
      signerAddress: s.signerAddress,
      role: s.role,
      createdAt: s.createdAt,
    })),
  });
}

// ---- Handler 3: POST /api/mint-requests/:id/sign -------------------------

/**
 * Ensure a ready_to_submit ChainAction (execute_mint) exists for a fully-signed
 * mint request. Idempotent on the request's recordHash (ChainAction.recordHash
 * is unique), so a lost race or a submit-after-sign is a no-op. Returns the
 * created/existing ChainAction id.
 */
async function ensureMintChainAction(
  deps: MintDeps,
  requestId: string,
): Promise<{ id: string; status: 'ready_to_submit' | string }> {
  const request = await getRequestWithSignatures(deps.prisma, requestId);
  if (request === null) throw new Error('SIGNATURE_REQUEST_NOT_FOUND');

  const stored = asStoredEnvelope(request.typedData);
  if (stored === null) {
    const err = new Error('Stored mint envelope is malformed') as Error & { code: string };
    err.code = 'INVALID_STATUS';
    throw err;
  }

  const signatures = request.signatures.map((s) => s.signature);
  const authTuple = messageToAuthTuple(stored.message);
  const callData: ChainCall = { fn: 'executeMint', args: [authTuple, signatures] };
  const amount = (
    BigInt(stored.message.regularAmount as string) + BigInt(stored.message.advanceAmount as string)
  ).toString(10);

  const action = await createChainAction(deps.prisma, {
    communityId: request.communityId,
    kind: 'execute_mint',
    signatureRequestId: request.id,
    callData,
    recordHash: request.recordHash,
    contributionId: request.contributionId,
    proposalId: request.proposalId,
    memberIdHash: request.memberIdHash,
    amount,
  });

  // awaiting_signatures -> ready_to_submit (conditional; already-advanced = no-op).
  await markReadyToSubmit(deps.prisma, action.id);
  const row = await deps.prisma.chainAction.findUnique({ where: { id: action.id } });
  return { id: action.id, status: row?.status ?? 'ready_to_submit' };
}

/**
 * Receive an approver signature over a mint request, recover the signer, verify
 * it is a community approver and is not the recipient's registered signer, then
 * store it. When the required distinct signatures are collected, build the
 * execute_mint ChainAction and mark it ready_to_submit. The server never signs.
 */
export async function handleSignMintRequest(deps: MintDeps, ctx: MintSignCtx): Promise<ApiResult> {
  const request = await getRequestWithSignatures(deps.prisma, ctx.mintRequestId);
  if (request === null) {
    return fail(404, 'NOT_FOUND', `Mint request '${ctx.mintRequestId}' not found`);
  }
  if (request.kind !== 'execute_mint') {
    return fail(409, 'INVALID_STATUS', 'This request is not a mint request');
  }
  if (request.status !== 'collecting' && request.status !== 'ready') {
    return fail(409, 'INVALID_STATUS', `Request is '${request.status}' and no longer accepts signatures`);
  }
  // Review fix (mirrors reversal /sign): reject an expired authorization before
  // collecting signatures — otherwise it would be queued and revert on-chain
  // (SIG_EXPIRED), wasting relayer gas and stranding the ChainAction.
  if (request.deadline <= BigInt(Math.floor(Date.now() / 1000))) {
    return fail(409, 'INVALID_STATUS', 'mint authorization has expired');
  }

  const parsed = parseBody(signSchema, ctx.body);
  if (!parsed.ok) return parsed.response;
  const { signature } = parsed.data;

  const stored = asStoredEnvelope(request.typedData);
  if (stored === null) {
    return fail(409, 'INVALID_STATUS', 'Stored mint envelope is malformed');
  }
  const authorization = messageToMintAuth(stored.message);
  // Defensive: the reconstructed struct must reproduce the stored digest.
  if (mintDigest(stored.domain, authorization) !== request.digest) {
    return fail(409, 'INVALID_STATUS', 'Stored mint envelope digest mismatch');
  }

  const signer = recoverMintSigner(stored.domain, authorization, signature);
  if (signer === null) {
    return fail(400, 'INVALID_APPROVER_SIGNATURE', 'Signature does not recover a valid signer');
  }

  const communityIdHash = hashCommunityId(request.communityId);
  // Review fix (#6): wrap the on-chain reader calls so an unreachable/unconfigured
  // RPC returns a structured error, not a raw 500 with a leaked stack.
  try {
    const isApprover = await deps.runtime.reader.isApprover(communityIdHash, signer);
    if (!isApprover) {
      return fail(403, 'NOT_AN_APPROVER', 'Recovered signer is not an approver of this community');
    }

    // Non-self approval: the signer must not be the recipient's registered signer.
    if (request.memberIdHash !== null) {
      const recipient = await deps.runtime.reader.memberSignerOf(communityIdHash, request.memberIdHash);
      if (
        recipient.toLowerCase() !== ZERO_ADDRESS &&
        recipient.toLowerCase() === signer.toLowerCase()
      ) {
        return fail(403, 'SELF_APPROVAL', 'An approver cannot approve their own mint');
      }
    }
  } catch (e: unknown) {
    return mapEngineError(e);
  }

  const result = await addSignature(deps.prisma, request.id, signer, signature, 'approver');

  if (!result.ready) {
    return ok({
      mintRequestId: request.id,
      signerAddress: signer,
      added: result.added,
      ready: false,
      collectedCount: result.distinctCount,
      requiredCount: request.requiredCount,
      remaining: Math.max(0, request.requiredCount - result.distinctCount),
    });
  }

  const action = await ensureMintChainAction(deps, request.id);
  return ok({
    mintRequestId: request.id,
    signerAddress: signer,
    added: result.added,
    ready: true,
    collectedCount: result.distinctCount,
    requiredCount: request.requiredCount,
    chainActionId: action.id,
    chainActionStatus: action.status,
  });
}

// ---- Handler 4: POST /api/mint-requests/:id/submit -----------------------

/**
 * Idempotent trigger: ensure a ready_to_submit execute_mint ChainAction exists
 * for a fully-signed mint request, then return its id + status. Does NOT
 * broadcast — the cron submitter claims ready_to_submit actions and sends them.
 * Community-admin. Idempotency-Key optional (the operation is naturally
 * idempotent via the unique recordHash + conditional state transition).
 */
export async function handleSubmitMintRequest(
  deps: MintDeps,
  ctx: MintSubmitCtx,
): Promise<ApiResult> {
  const auth = resolveAuthFromHeaders(ctx.headers, deps.authEnv);
  const request = await getRequestWithSignatures(deps.prisma, ctx.mintRequestId);
  if (request === null) {
    return fail(404, 'NOT_FOUND', `Mint request '${ctx.mintRequestId}' not found`);
  }
  if (request.kind !== 'execute_mint') {
    return fail(409, 'INVALID_STATUS', 'This request is not a mint request');
  }
  if (!(await deps.authorizeAdmin(auth, request.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization is required');
  }
  // Review fix: do not queue an already-expired authorization for broadcast.
  if (request.deadline <= BigInt(Math.floor(Date.now() / 1000))) {
    return fail(409, 'INVALID_STATUS', 'mint authorization has expired');
  }

  const run = async (): Promise<ApiResult> => {
    // An existing ChainAction wins (idempotent); otherwise the request must have
    // collected its signatures before an action can be created.
    const existing = await deps.prisma.chainAction.findFirst({
      where: { signatureRequestId: request.id, kind: 'execute_mint' },
    });
    if (existing === null && request.signatures.length < request.requiredCount) {
      return fail(
        409,
        'NOT_APPROVED',
        `Mint request has ${request.signatures.length}/${request.requiredCount} signatures; collect the remaining approvals first`,
      );
    }
    try {
      const action = await ensureMintChainAction(deps, request.id);
      return ok(
        { mintRequestId: request.id, chainActionId: action.id, status: action.status },
        202,
      );
    } catch (error: unknown) {
      return mapEngineError(error);
    }
  };

  if (ctx.idempotencyKey === null) return run();
  return withIdempotency(
    deps.idempotency,
    {
      endpoint: `POST /api/mint-requests/${ctx.mintRequestId}/submit`,
      key: ctx.idempotencyKey,
      requestHash: hashRequestBody({ mintRequestId: ctx.mintRequestId }),
    },
    run,
  );
}
