// ProposalCreation (§1) signing helpers for the governance-proposal endpoint
// group. The signing layer (lib/blockchain/signing) ships recover helpers for
// mint / reversal / vote / enroll / rotate, but ProposalCreation is only used by
// the createProposal flow, so its optionsHash derivation + signer recovery live
// here alongside the sole consumer (activate). Both mirror the contract byte for
// byte:
//   optionsHash = keccak256(abi.encode(bytes32[] optionIds))   (createProposal)
//   digest      = _hashTypedData(PROPOSAL_TYPEHASH struct)      (nonce 0, deadline = endTime)
// so a signature this module accepts is the same one executeMint/createProposal
// verifies on-chain. Pure + IO-free — no chain, no DB.

import { AbiCoder, getAddress, keccak256, verifyTypedData } from 'ethers';

import { PROPOSAL_TYPES, type Eip712Domain } from '../../blockchain/signing/typed-data';
import type { Hex32 } from '../../blockchain/types';

/**
 * The frozen ProposalCreation struct the creator (an approver) signs. Field
 * order/types are byte-identical to contracts/YouFenGovernance.sol's
 * `ProposalCreation` and to PROPOSAL_TYPES. `nonce` is always 0 and `deadline`
 * always equals `endTime` (§8: proposalId uniqueness is the single-creation
 * guard, so the creator authorization needs no separate nonce/deadline).
 */
export interface ProposalCreationStruct {
  readonly communityId: Hex32;
  readonly proposalId: Hex32;
  readonly kind: number;
  readonly optionsHash: Hex32;
  readonly endTime: bigint;
  readonly minVoterCount: number;
  readonly targetMemberIdHash: Hex32;
  readonly pInflationRateBps: number;
  readonly pMaxAdvanceRateBps: number;
  readonly pMemberMintCapRateBps: number;
  readonly nonce: bigint;
  readonly deadline: bigint;
}

const coder = AbiCoder.defaultAbiCoder();

/** optionsHash = keccak256(abi.encode(bytes32[] optionIds)) — matches the contract. */
export function computeOptionsHash(optionIds: readonly Hex32[]): Hex32 {
  return keccak256(coder.encode(['bytes32[]'], [optionIds])) as Hex32;
}

/**
 * Recover the checksummed ProposalCreation signer, or null when the signature is
 * malformed / does not match the struct (mirrors the contract's ecrecover, which
 * yields address(0) then reverts NOT_AN_APPROVER). The caller then verifies the
 * recovered address is an approver via runtime.reader.isApprover.
 */
export function recoverProposalCreationSigner(
  domain: Eip712Domain,
  struct: ProposalCreationStruct,
  signature: string,
): string | null {
  try {
    return getAddress(verifyTypedData(domain, PROPOSAL_TYPES, struct, signature));
  } catch {
    return null;
  }
}
