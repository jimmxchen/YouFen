// Pure SIGNER endpoint handlers — member client-held key enrollment / rotation
// (docs/BLOCKCHAIN-DESIGN-v0.7.md §6 endpoints #1-#3, §1 MemberEnrollment /
// KeyRotation typed data, §7 ChainAction state machine).
//
//   POST /api/members/[id]/signer/challenge -> handleSignerChallenge (no chain)
//   POST /api/members/[id]/signer/register  -> handleSignerRegister  (enroll_member)
//   POST /api/members/[id]/signer/rotate    -> handleSignerRotate    (rotate_key)
//
// INVARIANT (§0): the server NEVER signs a member/approver authorization. The
// challenge endpoint only MINTS the EIP-712 typed data (a fresh nonce + deadline)
// and persists it; the register/rotate endpoints RECEIVE the client-produced
// signatures, recover the signer (lib/blockchain/signing/recover), verify the
// role/identity against on-chain state, then queue a ChainAction the relayer will
// broadcast. Authority = the recovered signer, never msg.sender.
//
// AUTHZ: a community admin drives enrollment/rotation on the member's behalf
// (server authorizes "who may create/collect/submit"; the contract authorizes the
// action itself via the embedded signatures). Handlers are PURE — deps + input in,
// ApiResult out — so they are DB-testable with an injected fake runtime.

import { getAddress } from 'ethers';
import { z } from 'zod';

import type { PrismaClient } from '@prisma/client';

import {
  fail,
  hashRequestBody,
  ok,
  parseBody,
  withIdempotency,
  zId,
  type ApiResult,
  type AuthContext,
  type AuthorizeAdminFn,
  type IdempotencyStore,
} from '../core';

import type { BlockchainConfig } from '../../blockchain/types';
import type { GovernanceRuntime } from '../../blockchain/relay/governance-runtime';
import { hashCommunityId } from '../../blockchain/hashing/id-hash';
import { resolveMemberIdHash, freshNonce, deadline } from '../chain-write/context';
import { enrollEnvelope, rotateEnvelope } from '../../blockchain/signing/auth-envelope';
import { recoverEnrollSigner, recoverRotateSigner } from '../../blockchain/signing/recover';
import type { KeyRotation, MemberEnrollment } from '../../blockchain/signing/typed-data';
import { createChainAction } from '../../blockchain/relay/chain-action-service';

// ---- Injected deps ----

/**
 * Deps every signer handler receives. Composed in deps.ts from the chain-write
 * Foundation (`resolveChainWriteDeps`) plus the shared idempotency store + admin
 * policy. `config.pepper` is the ONLY sanctioned member-pepper source.
 */
export interface SignerDeps {
  readonly prisma: PrismaClient;
  readonly runtime: GovernanceRuntime;
  readonly config: BlockchainConfig;
  readonly authorizeAdmin: AuthorizeAdminFn;
  readonly idempotencyStore: IdempotencyStore;
}

// ---- Validation ----

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
/** A challenge is signable for this long; the contract re-checks `deadline`. */
const CHALLENGE_TTL_SECONDS = 15 * 60;

const REGISTER_ENDPOINT = 'POST /api/members/[id]/signer/register';
const ROTATE_ENDPOINT = 'POST /api/members/[id]/signer/rotate';

const zEvmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed 40-hex address');
const zHexSig = z
  .string()
  .regex(/^0x[0-9a-fA-F]{2,}$/, 'must be a 0x-prefixed hex signature');

const challengeSchema = z.object({
  communityId: zId,
  signerAddress: zEvmAddress,
  purpose: z.enum(['enroll', 'rotate']),
});

const registerSchema = z.object({
  communityId: zId,
  signerAddress: zEvmAddress,
  memberSig: zHexSig,
  authSig: zHexSig,
});

const rotateSchema = z.object({
  communityId: zId,
  newSignerAddress: zEvmAddress,
  rotationSigs: z.array(zHexSig).min(1),
});

// ---- small pure helpers ----

/** Checksum an address, or null when it is not a valid EVM address. */
function normalizeAddress(value: string): string | null {
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function isZeroAddress(addr: string): boolean {
  return addr.toLowerCase() === ZERO_ADDRESS;
}

/** A unix-seconds bigint `deadline` is expired once now passes it. */
function isExpired(challengeDeadline: bigint): boolean {
  return challengeDeadline < BigInt(Math.floor(Date.now() / 1000));
}

interface ChallengeLookup {
  readonly communityId: string;
  readonly memberIdHash: string;
  readonly signerAddress: string;
  readonly purpose: 'enroll' | 'rotate';
}

/** Most-recent unconsumed challenge for the (community, member, key, purpose). */
async function findActiveChallenge(prisma: PrismaClient, args: ChallengeLookup) {
  return prisma.signerChallenge.findFirst({
    where: {
      communityId: args.communityId,
      memberIdHash: args.memberIdHash,
      signerAddress: args.signerAddress,
      purpose: args.purpose,
      consumedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** Consume a challenge exactly once (guards the lookup→consume race). */
async function consumeChallenge(prisma: PrismaClient, id: string): Promise<boolean> {
  const res = await prisma.signerChallenge.updateMany({
    where: { id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return res.count === 1;
}

interface PendingSignerInput {
  readonly communityId: string;
  readonly memberId: string;
  readonly memberIdHash: string;
  readonly signerAddress: string;
}

/** Upsert the off-chain MemberSigner projection as `pending` (the indexer flips
 * it to active once the MemberEnrolled / MemberKeyRotated event is folded). */
async function upsertPendingSigner(
  prisma: PrismaClient,
  input: PendingSignerInput,
): Promise<void> {
  await prisma.memberSigner.upsert({
    where: {
      communityId_memberIdHash: {
        communityId: input.communityId,
        memberIdHash: input.memberIdHash,
      },
    },
    create: {
      communityId: input.communityId,
      memberId: input.memberId,
      memberIdHash: input.memberIdHash,
      signerAddress: input.signerAddress,
      status: 'pending',
    },
    update: { signerAddress: input.signerAddress, status: 'pending' },
  });
}

// ---- #1 challenge ----

/**
 * POST /api/members/[id]/signer/challenge — issue a one-time SignerChallenge and
 * return the MemberEnrollment (purpose=enroll) or KeyRotation (purpose=rotate)
 * typed-data envelope the client will sign. Persists the fresh nonce + deadline
 * so register/rotate can reconstruct the exact struct. No chain interaction.
 */
export async function handleSignerChallenge(
  deps: SignerDeps,
  input: { memberId: string; body: unknown; auth: AuthContext },
): Promise<ApiResult> {
  if (input.memberId.length === 0) {
    return fail(400, 'VALIDATION_ERROR', 'memberId path parameter is required');
  }
  const parsed = parseBody(challengeSchema, input.body);
  if (!parsed.ok) return parsed.response;
  const { communityId, signerAddress, purpose } = parsed.data;

  if (!(await deps.authorizeAdmin(input.auth, communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }

  const address = normalizeAddress(signerAddress);
  if (address === null) {
    return fail(400, 'VALIDATION_ERROR', 'signerAddress is not a valid address');
  }

  const communityIdHash = hashCommunityId(communityId);
  const memberIdHash = resolveMemberIdHash(communityId, input.memberId, deps.config.pepper);
  const nonce = freshNonce();
  const challengeDeadline = deadline(CHALLENGE_TTL_SECONDS);

  const envelope =
    purpose === 'enroll'
      ? enrollEnvelope(deps.runtime.domain, {
          communityId: communityIdHash,
          memberIdHash,
          signerAddress: address,
          nonce,
          deadline: challengeDeadline,
        })
      : rotateEnvelope(deps.runtime.domain, {
          communityId: communityIdHash,
          memberIdHash,
          newSignerAddress: address,
          nonce,
          deadline: challengeDeadline,
        });

  const row = await deps.prisma.signerChallenge.create({
    data: {
      communityId,
      memberId: input.memberId,
      memberIdHash,
      signerAddress: address,
      purpose,
      nonce: nonce.toString(10),
      deadline: challengeDeadline,
    },
  });

  return ok(
    {
      challengeId: row.id,
      purpose,
      communityId,
      memberId: input.memberId,
      memberIdHash,
      signerAddress: address,
      deadline: challengeDeadline.toString(10),
      envelope,
    },
    201,
  );
}

// ---- #2 register (enroll) ----

/**
 * POST /api/members/[id]/signer/register — receive `memberSig` (key-possession
 * proof) + `authSig` (approver/owner co-authorization) over the challenge's
 * MemberEnrollment. Recover + verify memberSig == signerAddress and authSig is an
 * on-chain approver, consume the challenge, queue a `enroll_member` ChainAction in
 * `ready_to_submit`, and upsert the MemberSigner as `pending`.
 */
export async function handleSignerRegister(
  deps: SignerDeps,
  input: { memberId: string; body: unknown; auth: AuthContext; idempotencyKey: string | null },
): Promise<ApiResult> {
  if (input.memberId.length === 0) {
    return fail(400, 'VALIDATION_ERROR', 'memberId path parameter is required');
  }
  const parsed = parseBody(registerSchema, input.body);
  if (!parsed.ok) return parsed.response;
  const { communityId, signerAddress, memberSig, authSig } = parsed.data;

  if (!(await deps.authorizeAdmin(input.auth, communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }
  const address = normalizeAddress(signerAddress);
  if (address === null) {
    return fail(400, 'VALIDATION_ERROR', 'signerAddress is not a valid address');
  }

  return withIdempotency(
    deps.idempotencyStore,
    {
      endpoint: REGISTER_ENDPOINT,
      key: input.idempotencyKey,
      requestHash: hashRequestBody({
        communityId,
        memberId: input.memberId,
        signerAddress: address,
        memberSig,
        authSig,
      }),
    },
    async () => {
      const communityIdHash = hashCommunityId(communityId);
      const memberIdHash = resolveMemberIdHash(communityId, input.memberId, deps.config.pepper);

      const challenge = await findActiveChallenge(deps.prisma, {
        communityId,
        memberIdHash,
        signerAddress: address,
        purpose: 'enroll',
      });
      if (challenge === null) {
        return fail(404, 'NOT_FOUND', 'No active enrollment challenge; request a challenge first');
      }
      if (isExpired(challenge.deadline)) {
        return fail(409, 'CHALLENGE_EXPIRED', 'Enrollment challenge has expired; request a new one');
      }

      const enrollment: MemberEnrollment = {
        communityId: communityIdHash,
        memberIdHash,
        signerAddress: address,
        nonce: BigInt(challenge.nonce),
        deadline: challenge.deadline,
      };

      // memberSig must be produced by the very key being enrolled (possession).
      const memberSigner = recoverEnrollSigner(deps.runtime.domain, enrollment, memberSig);
      if (memberSigner === null || memberSigner !== address) {
        return fail(400, 'INVALID_MEMBER_SIGNATURE', 'memberSig does not match the enrolling signer address');
      }

      // authSig must be produced by a current on-chain approver of the community.
      const authSigner = recoverEnrollSigner(deps.runtime.domain, enrollment, authSig);
      if (authSigner === null) {
        return fail(400, 'INVALID_APPROVER_SIGNATURE', 'authSig is not a valid signature');
      }
      const approver = await deps.runtime.reader.isApprover(communityIdHash, authSigner);
      if (!approver) {
        return fail(403, 'ENROLLMENT_NOT_AUTHORIZED', 'authSig is not from a community approver');
      }

      if (!(await consumeChallenge(deps.prisma, challenge.id))) {
        return fail(409, 'CHALLENGE_ALREADY_CONSUMED', 'Enrollment challenge already consumed');
      }

      const action = await createChainAction(deps.prisma, {
        communityId,
        kind: 'enroll_member',
        memberIdHash,
        callData: {
          fn: 'enrollMember',
          args: [
            {
              communityId: communityIdHash,
              memberIdHash,
              signerAddress: address,
              nonce: enrollment.nonce.toString(10),
              deadline: enrollment.deadline.toString(10),
            },
            memberSig,
            authSig,
          ],
        },
        idempotencyKey: `enroll:${communityId}:${memberIdHash}:${challenge.nonce}`,
        initialStatus: 'ready_to_submit',
      });

      await upsertPendingSigner(deps.prisma, {
        communityId,
        memberId: input.memberId,
        memberIdHash,
        signerAddress: address,
      });

      return ok(
        {
          chainActionId: action.id,
          created: action.created,
          kind: 'enroll_member',
          memberIdHash,
          signerAddress: address,
          status: 'ready_to_submit',
          signerStatus: 'pending',
        },
        202,
      );
    },
  );
}

// ---- #3 rotate ----

/**
 * POST /api/members/[id]/signer/rotate — receive `rotationSigs` over the
 * challenge's KeyRotation. MVP authorization (§8): at least one signature must
 * recover to the member's CURRENT on-chain registered key. Consume the challenge,
 * queue a `rotate_key` ChainAction, and upsert the MemberSigner to the new key as
 * `pending`.
 */
export async function handleSignerRotate(
  deps: SignerDeps,
  input: { memberId: string; body: unknown; auth: AuthContext; idempotencyKey: string | null },
): Promise<ApiResult> {
  if (input.memberId.length === 0) {
    return fail(400, 'VALIDATION_ERROR', 'memberId path parameter is required');
  }
  const parsed = parseBody(rotateSchema, input.body);
  if (!parsed.ok) return parsed.response;
  const { communityId, newSignerAddress, rotationSigs } = parsed.data;

  if (!(await deps.authorizeAdmin(input.auth, communityId))) {
    return fail(403, 'FORBIDDEN', 'Admin authorization required');
  }
  const address = normalizeAddress(newSignerAddress);
  if (address === null) {
    return fail(400, 'VALIDATION_ERROR', 'newSignerAddress is not a valid address');
  }

  return withIdempotency(
    deps.idempotencyStore,
    {
      endpoint: ROTATE_ENDPOINT,
      key: input.idempotencyKey,
      requestHash: hashRequestBody({
        communityId,
        memberId: input.memberId,
        newSignerAddress: address,
        rotationSigs,
      }),
    },
    async () => {
      const communityIdHash = hashCommunityId(communityId);
      const memberIdHash = resolveMemberIdHash(communityId, input.memberId, deps.config.pepper);

      const challenge = await findActiveChallenge(deps.prisma, {
        communityId,
        memberIdHash,
        signerAddress: address,
        purpose: 'rotate',
      });
      if (challenge === null) {
        return fail(404, 'NOT_FOUND', 'No active rotation challenge; request a challenge first');
      }
      if (isExpired(challenge.deadline)) {
        return fail(409, 'CHALLENGE_EXPIRED', 'Rotation challenge has expired; request a new one');
      }

      const currentKey = await deps.runtime.reader.memberSignerOf(communityIdHash, memberIdHash);
      if (isZeroAddress(currentKey)) {
        return fail(409, 'MEMBER_NOT_ENROLLED', 'Member has no enrolled signer to rotate from');
      }
      const currentKeyChecksummed = normalizeAddress(currentKey);

      const rotation: KeyRotation = {
        communityId: communityIdHash,
        memberIdHash,
        newSignerAddress: address,
        nonce: BigInt(challenge.nonce),
        deadline: challenge.deadline,
      };

      const authorized =
        currentKeyChecksummed !== null &&
        rotationSigs.some((sig) => {
          const recovered = recoverRotateSigner(deps.runtime.domain, rotation, sig);
          return recovered !== null && recovered === currentKeyChecksummed;
        });
      if (!authorized) {
        return fail(403, 'ROTATION_NOT_AUTHORIZED', 'No rotation signature from the current registered key');
      }

      if (!(await consumeChallenge(deps.prisma, challenge.id))) {
        return fail(409, 'CHALLENGE_ALREADY_CONSUMED', 'Rotation challenge already consumed');
      }

      const action = await createChainAction(deps.prisma, {
        communityId,
        kind: 'rotate_key',
        memberIdHash,
        callData: {
          fn: 'rotateKey',
          args: [
            {
              communityId: communityIdHash,
              memberIdHash,
              newSignerAddress: address,
              nonce: rotation.nonce.toString(10),
              deadline: rotation.deadline.toString(10),
            },
            rotationSigs,
          ],
        },
        idempotencyKey: `rotate:${communityId}:${memberIdHash}:${challenge.nonce}`,
        initialStatus: 'ready_to_submit',
      });

      await upsertPendingSigner(deps.prisma, {
        communityId,
        memberId: input.memberId,
        memberIdHash,
        signerAddress: address,
      });

      return ok(
        {
          chainActionId: action.id,
          created: action.created,
          kind: 'rotate_key',
          memberIdHash,
          newSignerAddress: address,
          status: 'ready_to_submit',
          signerStatus: 'pending',
        },
        202,
      );
    },
  );
}
