// Reversal-request endpoints (docs/BLOCKCHAIN-DESIGN-v0.7.md §6 #8-#10, §2 step 7,
// §7 ChainAction state machine). The server authorises WHO may create/collect/
// submit; the contract authorises the ACTION itself via the approver EIP-712
// signatures carried inside the calldata. The server NEVER signs — the `sign`
// endpoint RECEIVES an approver signature, recovers it (signing/recover), verifies
// the on-chain approver role, then stores it (signatures/signature-request-service).
//
// Pure handlers: (deps + ctx) -> ApiResult. Routes stay thin. Every collaborator
// (prisma, runtime.reader, config.pepper, idempotencyStore) is injected via
// ReversalDeps, so each handler is unit/DB-testable with a fake runtime.

import { z } from 'zod';

import {
  defaultAuthorizeAdmin,
  fail,
  hashRequestBody,
  mapEngineError,
  ok,
  parseBody,
  resolveAuthFromHeaders,
  withIdempotency,
  zBigIntAmount,
  zId,
  type ApiResult,
  type HeaderReader,
} from '../core';

import {
  deadline,
  freshNonce,
  resolveCommunityContext,
  resolveMemberIdHash,
} from '../chain-write/context';
import type { ReversalDeps } from './deps';

import { hashProposalId } from '../../blockchain/hashing/id-hash';
import { computeRecordHash } from '../../blockchain/hashing/record-hash';
import type { Hex32, RecordEnvelope } from '../../blockchain/types';
import { reversalEnvelope, type Eip712Envelope } from '../../blockchain/signing/auth-envelope';
import { recoverReversalSigner } from '../../blockchain/signing/recover';
import type { ReversalAuthorization } from '../../blockchain/signing/typed-data';
import {
  addSignature,
  createSignatureRequest,
  getRequestWithSignatures,
} from '../../blockchain/signatures/signature-request-service';
import {
  createChainAction,
  markReadyToSubmit,
} from '../../blockchain/relay/chain-action-service';
import type { PrismaClient } from '@prisma/client';

const ZERO32: Hex32 = `0x${'00'.repeat(32)}`;
const HEX32_RE = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE_RE = /^0x[0-9a-fA-F]{130}$/;
// Approvers have a week to collect signatures before the authorization expires.
const REVERSAL_TTL_SECONDS = 7 * 24 * 60 * 60;
const CREATE_ENDPOINT = 'POST /api/reversal-requests';

const zHex32 = z.string().regex(HEX32_RE, 'must be a 0x-prefixed 32-byte hex string');

const createBodySchema = z.object({
  communityId: zId,
  memberId: zId,
  originalRecordHash: zHex32,
  amount: zBigIntAmount.refine((v) => v > 0n, { message: 'amount must be greater than 0' }),
  evidenceHash: zHex32,
  proposalId: zId.optional(),
});

const signBodySchema = z.object({
  signature: z.string().regex(SIGNATURE_RE, 'must be a 0x-prefixed 65-byte signature'),
});

type CreateBody = z.infer<typeof createBodySchema>;

/** Stable, bigint-free view of the create body for the Idempotency-Key request hash. */
function jsonForHash(data: CreateBody): Record<string, unknown> {
  return {
    communityId: data.communityId,
    memberId: data.memberId,
    originalRecordHash: data.originalRecordHash,
    amount: data.amount.toString(10),
    evidenceHash: data.evidenceHash,
    proposalId: data.proposalId ?? null,
  };
}

/**
 * The reversal record hash bound into (and signed as part of) the authorization.
 * Derived only from the fields the approver signs, so it is deterministic and
 * unique per authorization (fresh nonce). computeRecordHash canonicalizes the
 * envelope; every uint256 crosses as a decimal string so nothing overflows a JS
 * number in the preimage.
 */
function reversalRecordHash(fields: {
  readonly communityIdHash: Hex32;
  readonly memberIdHash: Hex32;
  readonly originalRecordHash: Hex32;
  readonly amount: bigint;
  readonly proposalId: Hex32;
  readonly evidenceHash: Hex32;
  readonly nonce: bigint;
  readonly deadline: bigint;
}): Hex32 {
  const envelope: RecordEnvelope = {
    schema: 'youfen.record.v1',
    type: 'token_reversal',
    payload: {
      amount: fields.amount.toString(10),
      communityIdHash: fields.communityIdHash,
      deadline: fields.deadline.toString(10),
      evidenceHash: fields.evidenceHash,
      memberIdHash: fields.memberIdHash,
      nonce: fields.nonce.toString(10),
      originalRecordHash: fields.originalRecordHash,
      proposalId: fields.proposalId,
    },
  };
  return computeRecordHash(envelope);
}

/**
 * Fail-fast mirror of the contract's reversal proposal gate: a valid governing
 * proposal is an approved (`recorded` + winner `approve`) `token_reversal`
 * proposal for this community. The contract remains the sole authority; this
 * only decides the off-chain signature floor.
 */
async function isValidReversalProposal(
  prisma: PrismaClient,
  communityId: string,
  proposalId: string,
): Promise<boolean> {
  const row = await prisma.proposal.findUnique({ where: { id: proposalId } });
  return (
    row !== null &&
    row.communityId === communityId &&
    row.type === 'token_reversal' &&
    row.status === 'recorded' &&
    row.winningOptionId === 'approve'
  );
}

/** A stored SignatureRequest row's typed-data is the JSON-safe EIP-712 envelope. */
function envelopeOf(request: { readonly typedData: unknown }): Eip712Envelope {
  return request.typedData as unknown as Eip712Envelope;
}

/** Rebuild the signed ReversalAuthorization from the stored envelope message. */
function authorizationFromMessage(
  message: Record<string, string | number | boolean>,
): ReversalAuthorization {
  return {
    communityId: String(message.communityId) as Hex32,
    memberIdHash: String(message.memberIdHash) as Hex32,
    originalRecordHash: String(message.originalRecordHash) as Hex32,
    amount: BigInt(String(message.amount)),
    proposalId: String(message.proposalId) as Hex32,
    evidenceHash: String(message.evidenceHash) as Hex32,
    recordHash: String(message.recordHash) as Hex32,
    nonce: BigInt(String(message.nonce)),
    deadline: BigInt(String(message.deadline)),
  };
}

interface EnsureActionResult {
  readonly chainActionId: string;
  readonly status: string;
}

/**
 * Idempotently create the `execute_reversal` ChainAction from a ready request and
 * move it to `ready_to_submit`. callData is `{ fn:'executeReversal', args:[tuple,
 * sigs] }`; the tuple mirrors the ABI struct order with every uint256 as a decimal
 * string so the persisted JSON round-trips and ethers can re-encode it. Idempotent
 * on the unique recordHash (createChainAction) + the conditional transition.
 */
async function ensureReversalChainAction(
  prisma: PrismaClient,
  request: {
    readonly id: string;
    readonly communityId: string;
    readonly recordHash: string | null;
    readonly proposalId: string | null;
    readonly memberIdHash: string | null;
    readonly typedData: unknown;
  },
): Promise<EnsureActionResult> {
  const message = envelopeOf(request).message;
  const full = await getRequestWithSignatures(prisma, request.id);
  const sigs = (full?.signatures ?? []).map((s) => s.signature);

  const reversalTuple = {
    communityId: String(message.communityId),
    memberIdHash: String(message.memberIdHash),
    originalRecordHash: String(message.originalRecordHash),
    amount: String(message.amount),
    proposalId: String(message.proposalId),
    evidenceHash: String(message.evidenceHash),
    recordHash: String(message.recordHash),
    nonce: String(message.nonce),
    deadline: String(message.deadline),
  };

  const created = await createChainAction(prisma, {
    communityId: request.communityId,
    kind: 'execute_reversal',
    signatureRequestId: request.id,
    callData: { fn: 'executeReversal', args: [reversalTuple, sigs] },
    recordHash: request.recordHash,
    proposalId: request.proposalId,
    memberIdHash: request.memberIdHash,
    amount: String(message.amount),
  });
  await markReadyToSubmit(prisma, created.id);
  const action = await prisma.chainAction.findUnique({ where: { id: created.id } });
  return { chainActionId: created.id, status: action?.status ?? 'ready_to_submit' };
}

// ---- #8 POST /api/reversal-requests ----------------------------------------

/**
 * Create a reversal SignatureRequest. Admin-gated + idempotent. Builds the
 * ReversalAuthorization the approver(s) will sign and returns its EIP-712 envelope.
 * requiredCount = max(approverThreshold, 2) — a dual-approver reversal — UNLESS a
 * valid `token_reversal` proposal is attached, which lowers the floor to
 * max(approverThreshold, 1). An attached-but-invalid proposal is rejected fast.
 */
export async function handleCreateReversalRequest(
  deps: ReversalDeps,
  input: { readonly headers: HeaderReader; readonly body: unknown; readonly idempotencyKey: string | null },
): Promise<ApiResult> {
  const auth = resolveAuthFromHeaders(input.headers, deps.authEnv);
  const parsed = parseBody(createBodySchema, input.body);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;

  if (!(await defaultAuthorizeAdmin(auth, data.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }

  return withIdempotency(
    deps.idempotencyStore,
    { endpoint: CREATE_ENDPOINT, key: input.idempotencyKey, requestHash: hashRequestBody(jsonForHash(data)) },
    async () => {
      try {
        const ctx = await resolveCommunityContext(deps.runtime, data.communityId);
        const memberIdHash = resolveMemberIdHash(data.communityId, data.memberId, deps.config.pepper);

        let proposalBytes32: Hex32 = ZERO32;
        let storedProposalId: string | null = null;
        let hasProposal = false;
        if (data.proposalId !== undefined) {
          hasProposal = await isValidReversalProposal(deps.prisma, data.communityId, data.proposalId);
          if (!hasProposal) {
            return fail(
              403,
              'PROPOSAL_REQUIRED',
              'proposalId must reference an approved token_reversal proposal for this community',
            );
          }
          proposalBytes32 = hashProposalId(data.proposalId);
          storedProposalId = data.proposalId;
        }

        const requiredCount = hasProposal
          ? Math.max(ctx.approverThreshold, 1)
          : Math.max(ctx.approverThreshold, 2);

        const nonce = freshNonce();
        const dl = deadline(REVERSAL_TTL_SECONDS);
        const recordHash = reversalRecordHash({
          communityIdHash: ctx.communityIdHash,
          memberIdHash,
          originalRecordHash: data.originalRecordHash as Hex32,
          amount: data.amount,
          proposalId: proposalBytes32,
          evidenceHash: data.evidenceHash as Hex32,
          nonce,
          deadline: dl,
        });

        const authorization: ReversalAuthorization = {
          communityId: ctx.communityIdHash,
          memberIdHash,
          originalRecordHash: data.originalRecordHash as Hex32,
          amount: data.amount,
          proposalId: proposalBytes32,
          evidenceHash: data.evidenceHash as Hex32,
          recordHash,
          nonce,
          deadline: dl,
        };
        const envelope = reversalEnvelope(ctx.domain, authorization);

        const created = await createSignatureRequest(deps.prisma, {
          communityId: data.communityId,
          kind: 'execute_reversal',
          requiredRole: 'approver',
          requiredCount,
          typedData: envelope,
          digest: envelope.digest,
          recordHash,
          proposalId: storedProposalId,
          memberIdHash,
          nonce: nonce.toString(10),
          deadline: dl,
        });

        return ok(
          {
            reversalRequestId: created.id,
            status: created.created ? 'collecting' : 'existing',
            requiredRole: 'approver',
            requiredCount,
            proposalId: storedProposalId,
            digest: envelope.digest,
            recordHash,
            envelope,
          },
          created.created ? 201 : 200,
        );
      } catch (e: unknown) {
        return mapEngineError(e);
      }
    },
  );
}

// ---- #9 POST /api/reversal-requests/:id/sign -------------------------------

/**
 * Collect one approver signature. The signature IS the authorization: recover the
 * signer over the stored authorization, verify it is an on-chain approver, then
 * store it (deduped by signer). When the threshold is met the request flips to
 * `ready` and the `execute_reversal` ChainAction is created + queued.
 */
export async function handleSignReversalRequest(
  deps: ReversalDeps,
  input: { readonly id: string; readonly headers: HeaderReader; readonly body: unknown },
): Promise<ApiResult> {
  const parsed = parseBody(signBodySchema, input.body);
  if (!parsed.ok) return parsed.response;

  const request = await getRequestWithSignatures(deps.prisma, input.id);
  if (request === null || request.kind !== 'execute_reversal') {
    return fail(404, 'NOT_FOUND', `Reversal request '${input.id}' not found`);
  }
  if (request.status !== 'collecting' && request.status !== 'ready') {
    return fail(409, 'INVALID_STATUS', `reversal request is '${request.status}', not open for signing`);
  }
  if (request.deadline <= BigInt(Math.floor(Date.now() / 1000))) {
    return fail(409, 'INVALID_STATUS', 'reversal authorization has expired');
  }

  const envelope = envelopeOf(request);
  const authorization = authorizationFromMessage(envelope.message);
  const signer = recoverReversalSigner(envelope.domain, authorization, parsed.data.signature);
  if (signer === null) {
    return fail(400, 'VALIDATION_ERROR', 'signature could not be recovered');
  }

  // Review fix (#6): wrap the on-chain reads so an unreachable RPC returns a
  // structured error instead of a raw 500.
  let approver: boolean;
  let recipient: string | null = null;
  try {
    approver = await deps.runtime.reader.isApprover(authorization.communityId, signer);
    if (request.memberIdHash !== null) {
      recipient = await deps.runtime.reader.memberSignerOf(authorization.communityId, request.memberIdHash);
    }
  } catch (e: unknown) {
    return mapEngineError(e);
  }
  if (!approver) {
    return fail(403, 'FORBIDDEN', 'recovered signer is not an approver for this community');
  }
  // Non-self approval (review fix #3, mirrors mint /sign): the signer must not be
  // the reversal target's own registered key, or the on-chain
  // _countDistinctApprovers reverts SELF_APPROVAL — griefing the correction of
  // the member's own tokens.
  if (recipient !== null && !/^0x0{40}$/i.test(recipient) && recipient.toLowerCase() === signer.toLowerCase()) {
    return fail(403, 'SELF_APPROVAL', 'An approver cannot approve a reversal of their own tokens');
  }

  try {
    const result = await addSignature(deps.prisma, input.id, signer, parsed.data.signature, 'approver');
    const ensured = result.ready ? await ensureReversalChainAction(deps.prisma, request) : null;
    return ok({
      reversalRequestId: input.id,
      signer,
      added: result.added,
      ready: result.ready,
      distinctCount: result.distinctCount,
      requiredCount: request.requiredCount,
      ...(ensured !== null
        ? { chainActionId: ensured.chainActionId, chainActionStatus: ensured.status }
        : {}),
    });
  } catch (e: unknown) {
    return mapEngineError(e);
  }
}

// ---- #10 POST /api/reversal-requests/:id/submit ----------------------------

/**
 * Queue the reversal for the relayer. Admin-gated. Ensures the `execute_reversal`
 * ChainAction exists and is at `ready_to_submit`, returning its id + status. Does
 * not broadcast — the internal chain-actions/submit cron does. Idempotent: an
 * already-created / already-advanced action is returned as-is; a request that has
 * not met its signature threshold yields 409 NOT_APPROVED.
 */
export async function handleSubmitReversalRequest(
  deps: ReversalDeps,
  input: { readonly id: string; readonly headers: HeaderReader },
): Promise<ApiResult> {
  const auth = resolveAuthFromHeaders(input.headers, deps.authEnv);
  const request = await getRequestWithSignatures(deps.prisma, input.id);
  if (request === null || request.kind !== 'execute_reversal') {
    return fail(404, 'NOT_FOUND', `Reversal request '${input.id}' not found`);
  }
  if (!(await defaultAuthorizeAdmin(auth, request.communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }

  const existing = await deps.prisma.chainAction.findFirst({
    where: { signatureRequestId: input.id, kind: 'execute_reversal' },
  });
  if (existing !== null) {
    await markReadyToSubmit(deps.prisma, existing.id);
    const fresh = await deps.prisma.chainAction.findUnique({ where: { id: existing.id } });
    return ok({
      reversalRequestId: input.id,
      chainActionId: existing.id,
      status: fresh?.status ?? existing.status,
    });
  }

  if (request.status !== 'ready') {
    return fail(409, 'NOT_APPROVED', 'reversal has not collected the required approver signatures');
  }
  const ensured = await ensureReversalChainAction(deps.prisma, request);
  return ok({ reversalRequestId: input.id, chainActionId: ensured.chainActionId, status: ensured.status });
}
