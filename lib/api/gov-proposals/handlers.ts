// Governance PROPOSAL endpoints (docs/BLOCKCHAIN-DESIGN-v0.7.md §6 #11-#15).
// Governance is member-signed votes + approver-created proposals: the SERVER
// NEVER signs. "activate" RECEIVES the approver's ProposalCreation signature and
// recovers/verifies the approver; "vote-authorization" returns the typed data a
// member signs (no chain, no DB); "votes-relay" RECEIVES member vote signatures,
// recovers each and keeps only those matching the on-chain memberSigner
// (skip-invalid, mirroring the contract). All chain-touching endpoints queue a
// ChainAction (status ready_to_submit) for the pull-based relay submitter — the
// confirmed effect lands only when the indexer folds the resulting event.
//
// Handlers are PURE (deps + ctx in → ApiResult out). Routes stay thin.

import { z } from 'zod';

import {
  fail,
  mapEngineError,
  ok,
  parseBody,
  resolveAuthFromHeaders,
  withIdempotency,
  hashRequestBody,
  type ApiResult,
  type HeaderReader,
} from '../core';
import {
  resolveCommunityContext,
  resolveMemberIdHash,
  freshNonce,
  deadline,
} from '../chain-write/context';
import { hashCommunityId, hashOptionId, hashProposalId } from '../../blockchain/hashing/id-hash';
import { recoverVoteSigner } from '../../blockchain/signing/recover';
import { voteEnvelope } from '../../blockchain/signing/auth-envelope';
import type { VoteAuthorization } from '../../blockchain/signing/typed-data';
import { createChainAction } from '../../blockchain/relay/chain-action-service';
import type { Hex32 } from '../../blockchain/types';

import type { GovProposalsDeps } from './deps';
import {
  computeOptionsHash,
  recoverProposalCreationSigner,
  type ProposalCreationStruct,
} from './proposal-signing';

const ZERO32: Hex32 = `0x${'00'.repeat(32)}`;
const ZERO_ADDRESS = /^0x0{40}$/i;

/** Default validity window a member's vote authorization is signable for (7 days). */
const VOTE_AUTH_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Every governance endpoint takes the route's proposal id + the raw JSON body. */
export interface GovProposalCtx {
  readonly headers: HeaderReader;
  readonly proposalId: string;
  readonly body: unknown;
}

// ---- shared field schemas (uint widths matched to the contract) ----
const zUint8 = z.number().int().min(0).max(255);
const zUint32 = z.number().int().min(0).max(4_294_967_295);
const zUint64 = z.coerce.bigint().nonnegative();
const zId = z.string().min(1);
const zHex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte hex');
const zHexSig = z.string().regex(/^0x[0-9a-fA-F]+$/, 'must be a 0x-prefixed hex string');
const zDecimal = z.string().regex(/^\d+$/, 'must be a decimal string');

const activateSchema = z.object({
  communityId: zId,
  kind: zUint8,
  // option LABELS (plaintext); hashed server-side via hashOptionId — the client
  // hashes them the same (unpeppered) way to derive the optionsHash it signs.
  optionIds: z.array(zId).min(2),
  endTime: zUint64, // unix seconds (uint64)
  minVoterCount: zUint32.default(0),
  // peppered member hash the client already holds (from enrollment); the server
  // cannot derive it without the pepper, so it is passed through verbatim.
  targetMemberIdHash: zHex32.optional(),
  pInflationRateBps: zUint32.default(0),
  pMaxAdvanceRateBps: zUint32.default(0),
  pMemberMintCapRateBps: zUint32.default(0),
  creatorSig: zHexSig,
});

const voteAuthSchema = z.object({
  communityId: zId,
  memberId: zId,
  optionId: zId, // option LABEL (plaintext)
  ttlSeconds: z.number().int().min(60).max(31_536_000).optional(),
});

const votesRelaySchema = z.object({
  communityId: zId,
  votes: z
    .array(
      z.object({
        voteAuthorization: z.object({
          communityId: zHex32,
          proposalId: zHex32,
          memberIdHash: zHex32,
          optionId: zHex32,
          nonce: zDecimal,
          deadline: zDecimal,
        }),
        signature: zHexSig,
      }),
    )
    .min(1),
});

const communityOnlySchema = z.object({ communityId: zId });

// ---- shared guards ----

/** Gate a mutating endpoint on community-admin / internal authorization. */
function guardAdmin(deps: GovProposalsDeps, headers: HeaderReader): ApiResult | null {
  const auth = resolveAuthFromHeaders(headers, deps.authEnv);
  if (!auth.isAdmin) {
    return fail(403, 'FORBIDDEN', 'Community admin or internal authorization required');
  }
  return null;
}

function idempotencyKey(headers: HeaderReader): string | null {
  const k = headers.get('idempotency-key');
  return k !== null && k.length > 0 ? k : null;
}

/**
 * Real ChainAction status for the response. A freshly-created action is
 * ready_to_submit; an idempotent re-hit (created:false) may already be further
 * along (submitting/verified/reverted), so re-read the persisted status rather
 * than reporting a stale literal.
 */
async function currentActionStatus(
  deps: GovProposalsDeps,
  action: { id: string; created: boolean },
): Promise<string> {
  if (action.created) return 'ready_to_submit';
  const row = await deps.prisma.chainAction.findUnique({
    where: { id: action.id },
    select: { status: true },
  });
  return row?.status ?? 'ready_to_submit';
}

// ---- #11 activate: approver-signed ProposalCreation → create_proposal ----

/** POST /api/proposals/:id/activate — queue createProposal from an approver's signature. */
export async function handleActivateProposal(
  deps: GovProposalsDeps,
  ctx: GovProposalCtx,
): Promise<ApiResult> {
  const denied = guardAdmin(deps, ctx.headers);
  if (denied !== null) return denied;

  const parsed = parseBody(activateSchema, ctx.body);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;

  return withIdempotency(
    deps.idempotency,
    {
      endpoint: 'proposals.activate',
      key: idempotencyKey(ctx.headers),
      requestHash: hashRequestBody(ctx.body),
    },
    async () => {
      let community;
      try {
        community = await resolveCommunityContext(deps.runtime, b.communityId);
      } catch (e: unknown) {
        return mapEngineError(e);
      }

      const proposalIdHash = hashProposalId(ctx.proposalId);
      const optionIds = b.optionIds.map((label) => hashOptionId(ctx.proposalId, label));
      const optionsHash = computeOptionsHash(optionIds);
      const targetMemberIdHash: Hex32 = (b.targetMemberIdHash ?? ZERO32) as Hex32;
      // Defaulted uint32 fields (0 when omitted); coalesced so the value is a
      // plain number rather than the number|undefined the schema output infers.
      const minVoterCount = b.minVoterCount ?? 0;
      const pInflationRateBps = b.pInflationRateBps ?? 0;
      const pMaxAdvanceRateBps = b.pMaxAdvanceRateBps ?? 0;
      const pMemberMintCapRateBps = b.pMemberMintCapRateBps ?? 0;

      const struct: ProposalCreationStruct = {
        communityId: community.communityIdHash,
        proposalId: proposalIdHash,
        kind: b.kind,
        optionsHash,
        endTime: b.endTime,
        minVoterCount,
        targetMemberIdHash,
        pInflationRateBps,
        pMaxAdvanceRateBps,
        pMemberMintCapRateBps,
        nonce: 0n, // §8: proposalId uniqueness is the single-creation guard
        deadline: b.endTime, // creator deadline == voting end
      };

      const signer = recoverProposalCreationSigner(community.domain, struct, b.creatorSig);
      if (signer === null) {
        return fail(400, 'INVALID_APPROVER_SIGNATURE', 'creatorSig is not a valid ProposalCreation signature');
      }
      let approver: boolean;
      try {
        approver = await deps.runtime.reader.isApprover(community.communityIdHash, signer);
      } catch (e: unknown) {
        return mapEngineError(e);
      }
      if (!approver) {
        return fail(403, 'NOT_AN_APPROVER', 'ProposalCreation signer is not an approver of this community');
      }

      const action = await createChainAction(deps.prisma, {
        communityId: b.communityId,
        kind: 'create_proposal',
        callData: {
          fn: 'createProposal',
          args: [
            proposalIdHash,
            community.communityIdHash,
            b.kind,
            optionIds,
            b.endTime.toString(10),
            minVoterCount,
            targetMemberIdHash,
            pInflationRateBps,
            pMaxAdvanceRateBps,
            pMemberMintCapRateBps,
            b.creatorSig,
          ],
        },
        proposalId: proposalIdHash,
        memberIdHash: targetMemberIdHash === ZERO32 ? null : targetMemberIdHash,
        idempotencyKey: `create_proposal:${proposalIdHash}`,
        initialStatus: 'ready_to_submit',
      });

      return ok(
        {
          chainActionId: action.id,
          created: action.created,
          proposalId: proposalIdHash,
          kind: 'create_proposal',
          status: await currentActionStatus(deps, action),
          creator: signer,
        },
        202,
      );
    },
  );
}

// ---- #12 vote-authorization: typed data for the member to sign (no chain) ----

/** POST /api/proposals/:id/vote-authorization — build the VoteAuthorization envelope. */
export async function handleVoteAuthorization(
  deps: GovProposalsDeps,
  ctx: GovProposalCtx,
): Promise<ApiResult> {
  // SECURITY (review fix): the response includes the PEPPERED memberIdHash for a
  // caller-supplied plaintext memberId. Left open, this turns the secret
  // RECORD_HASH_PEPPER into a public forward oracle (memberId → memberIdHash),
  // reversing the on-chain anonymization (all balances/votes/records are keyed by
  // memberIdHash only). Gate it behind admin/internal until member auth is wired.
  // HANDOFF: once NextAuth is in place, bind the caller to the member's OWN
  // authenticated session in the route and require memberId == that member (drop
  // the admin gate), plus per-caller rate limiting as defense in depth.
  const denied = guardAdmin(deps, ctx.headers);
  if (denied !== null) return denied;

  const parsed = parseBody(voteAuthSchema, ctx.body);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;

  const authorization: VoteAuthorization = {
    communityId: hashCommunityId(b.communityId),
    proposalId: hashProposalId(ctx.proposalId),
    memberIdHash: resolveMemberIdHash(b.communityId, b.memberId, deps.config.pepper),
    optionId: hashOptionId(ctx.proposalId, b.optionId),
    nonce: freshNonce(),
    deadline: deadline(b.ttlSeconds ?? VOTE_AUTH_TTL_SECONDS),
  };

  return ok(voteEnvelope(deps.runtime.domain, authorization));
}

// ---- #13 votes-relay: recover member sigs, keep valid, queue relay_votes ----

/** POST /api/proposals/:id/votes-relay — batch-relay member votes (skip-invalid). */
export async function handleVotesRelay(
  deps: GovProposalsDeps,
  ctx: GovProposalCtx,
): Promise<ApiResult> {
  const denied = guardAdmin(deps, ctx.headers);
  if (denied !== null) return denied;

  const parsed = parseBody(votesRelaySchema, ctx.body);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;

  return withIdempotency(
    deps.idempotency,
    {
      endpoint: 'proposals.votes-relay',
      key: idempotencyKey(ctx.headers),
      requestHash: hashRequestBody(ctx.body),
    },
    async () => {
      const proposalIdHash = hashProposalId(ctx.proposalId).toLowerCase();
      const communityIdHash = hashCommunityId(b.communityId);

      const tuples: string[][] = [];
      const sigs: string[] = [];
      let dropped = 0;

      try {
      for (const item of b.votes) {
        const va = item.voteAuthorization;
        // structural: the batch belongs to THIS proposal + community
        if (
          va.proposalId.toLowerCase() !== proposalIdHash ||
          va.communityId.toLowerCase() !== communityIdHash.toLowerCase()
        ) {
          dropped += 1;
          continue;
        }
        const v: VoteAuthorization = {
          communityId: va.communityId as Hex32,
          proposalId: va.proposalId as Hex32,
          memberIdHash: va.memberIdHash as Hex32,
          optionId: va.optionId as Hex32,
          nonce: BigInt(va.nonce),
          deadline: BigInt(va.deadline),
        };
        const signer = recoverVoteSigner(deps.runtime.domain, v, item.signature);
        if (signer === null) {
          dropped += 1;
          continue;
        }
        const memberSigner = await deps.runtime.reader.memberSignerOf(communityIdHash, va.memberIdHash);
        // must equal the member's registered client key (0x0 = unenrolled → drop)
        if (ZERO_ADDRESS.test(memberSigner) || memberSigner.toLowerCase() !== signer.toLowerCase()) {
          dropped += 1;
          continue;
        }
        tuples.push([va.communityId, va.proposalId, va.memberIdHash, va.optionId, va.nonce, va.deadline]);
        sigs.push(item.signature);
      }
      } catch (e: unknown) {
        return mapEngineError(e);
      }

      if (tuples.length === 0) {
        return fail(400, 'NO_VALID_VOTES', 'No vote passed signer == memberSigner verification');
      }

      const action = await createChainAction(deps.prisma, {
        communityId: b.communityId,
        kind: 'relay_votes',
        callData: { fn: 'relayVotes', args: [tuples, sigs] },
        proposalId: hashProposalId(ctx.proposalId),
        idempotencyKey: `relay_votes:${proposalIdHash}:${hashRequestBody(tuples)}`,
        initialStatus: 'ready_to_submit',
      });

      return ok(
        {
          chainActionId: action.id,
          created: action.created,
          proposalId: hashProposalId(ctx.proposalId),
          kind: 'relay_votes',
          status: await currentActionStatus(deps, action),
          includedVotes: tuples.length,
          droppedVotes: dropped,
        },
        202,
      );
    },
  );
}

// ---- #14 finalize + #15 execute: permissionless single-arg chain actions ----

async function queueSingleArgProposalAction(
  deps: GovProposalsDeps,
  ctx: GovProposalCtx,
  kind: 'finalize_proposal' | 'execute_proposal',
  fn: 'finalizeProposal' | 'executeProposal',
  endpoint: string,
): Promise<ApiResult> {
  const denied = guardAdmin(deps, ctx.headers);
  if (denied !== null) return denied;

  const parsed = parseBody(communityOnlySchema, ctx.body);
  if (!parsed.ok) return parsed.response;
  const b = parsed.data;

  return withIdempotency(
    deps.idempotency,
    { endpoint, key: idempotencyKey(ctx.headers), requestHash: hashRequestBody(ctx.body) },
    async () => {
      const proposalIdHash = hashProposalId(ctx.proposalId);
      const action = await createChainAction(deps.prisma, {
        communityId: b.communityId,
        kind,
        callData: { fn, args: [proposalIdHash] },
        proposalId: proposalIdHash,
        idempotencyKey: `${kind}:${proposalIdHash}`,
        initialStatus: 'ready_to_submit',
      });
      return ok(
        {
          chainActionId: action.id,
          created: action.created,
          proposalId: proposalIdHash,
          kind,
          status: await currentActionStatus(deps, action),
        },
        202,
      );
    },
  );
}

/** POST /api/proposals/:id/finalize — queue finalizeProposal(proposalId). */
export function handleFinalizeProposal(
  deps: GovProposalsDeps,
  ctx: GovProposalCtx,
): Promise<ApiResult> {
  return queueSingleArgProposalAction(
    deps,
    ctx,
    'finalize_proposal',
    'finalizeProposal',
    'proposals.finalize',
  );
}

/** POST /api/proposals/:id/execute — queue executeProposal(proposalId). */
export function handleExecuteProposal(
  deps: GovProposalsDeps,
  ctx: GovProposalCtx,
): Promise<ApiResult> {
  return queueSingleArgProposalAction(
    deps,
    ctx,
    'execute_proposal',
    'executeProposal',
    'proposals.execute',
  );
}
