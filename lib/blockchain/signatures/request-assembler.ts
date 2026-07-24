// Mint request assembler (docs/BLOCKCHAIN-DESIGN-v0.7.md §6, endpoint #4). Pure:
// given the resolved mint fields + epoch budget context, it builds the frozen
// MintAuthorization, the JSON-safe signing envelope the approver signs, and the
// off-chain approval requirement (how many signatures / whether a proposal is
// needed) so the caller can fail fast before assembling a doomed request.
//
// It does NOT talk to the chain or DB — the API layer resolves memberIdHash
// (peppered), recordHash (canonical), and the epoch context, then calls this.

import type { Hex32 } from '../types';

import { mintEnvelope, type Eip712Envelope } from '../signing/auth-envelope';
import { type Eip712Domain, type MintAuthorization } from '../signing/typed-data';

import { resolveMintApproval, cumulativeAdvanceBps, type MintApprovalRequirement } from './threshold';

const ZERO32: Hex32 = `0x${'00'.repeat(32)}`;

export interface MintAssemblyInput {
  readonly domain: Eip712Domain;
  readonly communityId: Hex32;
  readonly memberIdHash: Hex32;
  readonly contributionId: Hex32;
  readonly ruleVersion: number;
  readonly epochNumber: number;
  readonly regularAmount: bigint;
  readonly advanceAmount: bigint;
  readonly relatedParty: boolean;
  readonly proposalId?: Hex32;
  readonly evidenceHash: Hex32;
  readonly recordHash: Hex32;
  readonly nonce: bigint;
  /** absolute unix-seconds expiry the approver signs. */
  readonly deadline: number | bigint;
  // epoch budget context (from the on-chain epoch / a fresh projection) for approval resolution
  readonly baseMintBudget: bigint;
  readonly epochAdvanceMinted: bigint;
  readonly approverThreshold: number;
}

export interface AssembledMint {
  readonly authorization: MintAuthorization;
  readonly envelope: Eip712Envelope;
  readonly digest: Hex32;
  readonly approval: MintApprovalRequirement;
}

/** Build the MintAuthorization + envelope + approval requirement. */
export function assembleMint(input: MintAssemblyInput): AssembledMint {
  const authorization: MintAuthorization = {
    communityId: input.communityId,
    memberIdHash: input.memberIdHash,
    contributionId: input.contributionId,
    ruleVersion: input.ruleVersion,
    epochNumber: input.epochNumber,
    regularAmount: input.regularAmount,
    advanceAmount: input.advanceAmount,
    relatedParty: input.relatedParty,
    proposalId: input.proposalId ?? ZERO32,
    evidenceHash: input.evidenceHash,
    recordHash: input.recordHash,
    nonce: input.nonce,
    deadline: input.deadline,
  };

  const cumBps = cumulativeAdvanceBps(input.epochAdvanceMinted, input.advanceAmount, input.baseMintBudget);
  const approval = resolveMintApproval({
    advanceAmount: input.advanceAmount,
    cumulativeAdvanceBps: cumBps,
    relatedParty: input.relatedParty,
    approverThreshold: input.approverThreshold,
  });

  const envelope = mintEnvelope(input.domain, authorization);
  return { authorization, envelope, digest: envelope.digest, approval };
}
