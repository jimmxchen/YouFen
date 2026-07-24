// Proposal payload builders (BLOCKCHAIN-DESIGN §1, §4.4). Pure and IO-free.
// Two records share one ProposalData row: the pre-vote snapshot and the result.

import { TerminalError } from '../errors';
import { hashCommunityId, hashOptionId, hashProposalId } from '../hashing/id-hash';
import type { BuiltRecord, Hex32, ProposalData } from '../types';

import { finalizeBuilt, toPayloadInt, unixSeconds } from './build-mint-payload';

/**
 * Build a proposal_snapshot BuiltRecord. Every snapshot field must be present;
 * a null means the proposal has not been snapshotted and cannot be recorded.
 */
export function buildProposalSnapshotPayload(
  proposal: ProposalData,
  _pepper: string,
): BuiltRecord {
  const {
    epochNumberSnapshot,
    totalSupplySnapshot,
    activeGovernanceSupplySnapshot,
    tokenPolicyVersionSnapshot,
    snapshotAt,
  } = proposal;

  if (
    epochNumberSnapshot === null ||
    totalSupplySnapshot === null ||
    activeGovernanceSupplySnapshot === null ||
    tokenPolicyVersionSnapshot === null ||
    snapshotAt === null
  ) {
    throw new TerminalError(
      'SNAPSHOT_INCOMPLETE: proposal snapshot fields must all be present',
    );
  }

  const communityIdHash = hashCommunityId(proposal.communityId);

  const payload: Record<string, string | number | boolean> = {
    activeGovernanceSupplySnapshot: toPayloadInt(activeGovernanceSupplySnapshot),
    communityIdHash,
    epochNumber: epochNumberSnapshot,
    policyVersion: tokenPolicyVersionSnapshot,
    proposalId: proposal.id,
    snapshotAt: unixSeconds(snapshotAt),
    totalSupplySnapshot: toPayloadInt(totalSupplySnapshot),
  };

  // weightsMerkleRoot (individual verifiability) is additive: present -> enter
  // payload + chainArgs; absent -> omit the key so pre-existing snapshot
  // preimages stay byte-identical (frozen-contract rule).
  const hasWeightsRoot =
    proposal.weightsMerkleRoot !== undefined &&
    proposal.weightsMerkleRoot !== null;
  if (hasWeightsRoot) {
    payload.weightsMerkleRoot = proposal.weightsMerkleRoot as string;
  }

  const chainArgsHead: readonly (Hex32 | bigint | number)[] = [
    communityIdHash,
    hashProposalId(proposal.id),
    epochNumberSnapshot,
    totalSupplySnapshot,
    activeGovernanceSupplySnapshot,
    tokenPolicyVersionSnapshot,
    // weightsMerkleRoot is the last arg before the trailing recordHash.
    ...(hasWeightsRoot ? [proposal.weightsMerkleRoot as Hex32] : []),
  ];

  return finalizeBuilt('proposal_snapshot', payload, chainArgsHead);
}

/**
 * Build a proposal_result BuiltRecord. The result fields must all be present;
 * a null means voting has not concluded and the result cannot be recorded.
 */
export function buildProposalResultPayload(
  proposal: ProposalData,
  _pepper: string,
): BuiltRecord {
  const { endedAt, winningOptionId, voterCount, totalVoteWeight } = proposal;

  if (
    endedAt === null ||
    winningOptionId === null ||
    voterCount === null ||
    totalVoteWeight === null
  ) {
    throw new TerminalError(
      'RESULT_INCOMPLETE: proposal result fields must all be present',
    );
  }

  const communityIdHash = hashCommunityId(proposal.communityId);
  const winningOptionIdHash = hashOptionId(proposal.id, winningOptionId);

  const payload: Record<string, string | number | boolean> = {
    communityIdHash,
    endedAt: unixSeconds(endedAt),
    proposalId: proposal.id,
    totalVoteWeight: toPayloadInt(totalVoteWeight),
    voterCount,
    winningOptionIdHash,
  };

  // votesMerkleRoot (individual verifiability) is additive: present -> enter
  // payload + chainArgs; absent -> omit the key so pre-existing result
  // preimages stay byte-identical (frozen-contract rule).
  const hasVotesRoot =
    proposal.votesMerkleRoot !== undefined && proposal.votesMerkleRoot !== null;
  if (hasVotesRoot) {
    payload.votesMerkleRoot = proposal.votesMerkleRoot as string;
  }

  const chainArgsHead: readonly (Hex32 | bigint | number)[] = [
    communityIdHash,
    hashProposalId(proposal.id),
    winningOptionIdHash,
    voterCount,
    totalVoteWeight,
    // votesMerkleRoot is the last arg before the trailing recordHash.
    ...(hasVotesRoot ? [proposal.votesMerkleRoot as Hex32] : []),
  ];

  return finalizeBuilt('proposal_result', payload, chainArgsHead);
}
