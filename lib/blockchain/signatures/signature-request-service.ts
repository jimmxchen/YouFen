// SignatureRequest service (docs/BLOCKCHAIN-DESIGN-v0.7.md §6, endpoints #4-#10).
// Persists an assembled EIP-712 authorization and collects the required approver
// (or member) signatures. Signature VERIFICATION (recover + role check) is the
// caller's job (API layer, using lib/blockchain/signing/recover) — this service
// only stores verified signatures, dedupes by signer, and flips the request to
// `ready` once the threshold is met. Idempotent on the request digest.

import type { PrismaClient } from '@prisma/client';

export type ActionKind =
  | 'execute_mint'
  | 'execute_reversal'
  | 'create_proposal'
  | 'cast_vote'
  | 'relay_votes'
  | 'finalize_proposal'
  | 'execute_proposal'
  | 'roll_epoch'
  | 'enroll_member'
  | 'rotate_key';

export type SigRole = 'approver' | 'member';

export interface CreateSignatureRequestInput {
  readonly communityId: string;
  readonly kind: ActionKind;
  readonly requiredRole: SigRole;
  readonly requiredCount: number;
  readonly typedData: unknown; // the JSON-safe EIP-712 envelope
  readonly digest: string;
  readonly recordHash?: string | null;
  readonly contributionId?: string | null;
  readonly proposalId?: string | null;
  readonly memberIdHash?: string | null;
  readonly nonce: string; // decimal string (uint256)
  readonly deadline: bigint;
}

export interface CreateResult {
  readonly id: string;
  readonly created: boolean;
}

/** Persist a new SignatureRequest; idempotent on the unique digest. */
export async function createSignatureRequest(
  prisma: PrismaClient,
  input: CreateSignatureRequestInput,
): Promise<CreateResult> {
  const existing = await prisma.signatureRequest.findUnique({ where: { digest: input.digest } });
  if (existing !== null) return { id: existing.id, created: false };

  const row = await prisma.signatureRequest.create({
    data: {
      communityId: input.communityId,
      kind: input.kind,
      requiredRole: input.requiredRole,
      requiredCount: input.requiredCount,
      typedData: input.typedData as never,
      digest: input.digest,
      recordHash: input.recordHash ?? null,
      contributionId: input.contributionId ?? null,
      proposalId: input.proposalId ?? null,
      memberIdHash: input.memberIdHash ?? null,
      nonce: input.nonce,
      deadline: input.deadline,
      status: 'collecting',
    },
  });
  return { id: row.id, created: true };
}

export interface AddSignatureResult {
  readonly added: boolean; // false if this signer already signed (deduped)
  readonly ready: boolean; // threshold met
  readonly distinctCount: number;
}

/**
 * Record a VERIFIED signature (the caller has already recovered `signerAddress`
 * from the request's digest and confirmed the signer's role). Dedupes by signer;
 * flips the request to `ready` when requiredCount distinct signatures are held.
 */
export async function addSignature(
  prisma: PrismaClient,
  requestId: string,
  signerAddress: string,
  signature: string,
  role: SigRole,
): Promise<AddSignatureResult> {
  return prisma.$transaction(async (tx) => {
    const req = await tx.signatureRequest.findUnique({
      where: { id: requestId },
      include: { signatures: true },
    });
    if (req === null) throw new Error('SIGNATURE_REQUEST_NOT_FOUND');

    const lower = signerAddress.toLowerCase();
    const already = req.signatures.some((s) => s.signerAddress.toLowerCase() === lower);
    if (!already) {
      await tx.signature.create({
        data: { signatureRequestId: requestId, signerAddress, signature, role },
      });
    }

    const distinctCount = already ? req.signatures.length : req.signatures.length + 1;
    const ready = distinctCount >= req.requiredCount;
    if (ready && req.status === 'collecting') {
      await tx.signatureRequest.update({ where: { id: requestId }, data: { status: 'ready' } });
    }
    return { added: !already, ready, distinctCount };
  });
}

/** Fetch a request with its collected signatures (for building a ChainAction). */
export async function getRequestWithSignatures(prisma: PrismaClient, requestId: string) {
  return prisma.signatureRequest.findUnique({
    where: { id: requestId },
    include: { signatures: true },
  });
}
