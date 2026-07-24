// Frozen EIP-712 typed-data for YouFenGovernance v0.7 (docs/BLOCKCHAIN-DESIGN-v0.7.md §1).
//
// This module is the OFF-CHAIN half of the Phase-0 freeze artifact: the field
// lists below are byte-identical to the contract typehashes in
// contracts/YouFenGovernance.sol. The golden-vector test
// (contracts/test/typed-data-golden.test.ts) asserts that the digest this module
// produces equals the on-chain `hashMintAuthorization()` — if this file and the
// contract ever drift, that test fails. Do NOT reorder or rename a field.
//
// Domain: name="YouFen", version="0.7", chainId (1439 on Injective testnet),
// verifyingContract = the deployed YouFenGovernance address.

import { TypedDataEncoder, type TypedDataDomain, type TypedDataField } from 'ethers';

import type { Hex32 } from '../types';

export const EIP712_DOMAIN_NAME = 'YouFen';
export const EIP712_DOMAIN_VERSION = '0.7';

export interface Eip712Domain extends TypedDataDomain {
  readonly name: string;
  readonly version: string;
  readonly chainId: number;
  readonly verifyingContract: string;
}

/** Build the frozen domain for a given chain + deployed contract address. */
export function buildDomain(chainId: number, verifyingContract: string): Eip712Domain {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };
}

// ---- frozen field lists (order == contract typehash; see §1) ----

export const MINT_TYPES: Record<string, TypedDataField[]> = {
  MintAuthorization: [
    { name: 'communityId', type: 'bytes32' },
    { name: 'memberIdHash', type: 'bytes32' },
    { name: 'contributionId', type: 'bytes32' },
    { name: 'ruleVersion', type: 'uint32' },
    { name: 'epochNumber', type: 'uint64' },
    { name: 'regularAmount', type: 'uint256' },
    { name: 'advanceAmount', type: 'uint256' },
    { name: 'relatedParty', type: 'bool' },
    { name: 'proposalId', type: 'bytes32' },
    { name: 'evidenceHash', type: 'bytes32' },
    { name: 'recordHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export const REVERSAL_TYPES: Record<string, TypedDataField[]> = {
  ReversalAuthorization: [
    { name: 'communityId', type: 'bytes32' },
    { name: 'memberIdHash', type: 'bytes32' },
    { name: 'originalRecordHash', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'proposalId', type: 'bytes32' },
    { name: 'evidenceHash', type: 'bytes32' },
    { name: 'recordHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export const VOTE_TYPES: Record<string, TypedDataField[]> = {
  VoteAuthorization: [
    { name: 'communityId', type: 'bytes32' },
    { name: 'proposalId', type: 'bytes32' },
    { name: 'memberIdHash', type: 'bytes32' },
    { name: 'optionId', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export const ENROLL_TYPES: Record<string, TypedDataField[]> = {
  MemberEnrollment: [
    { name: 'communityId', type: 'bytes32' },
    { name: 'memberIdHash', type: 'bytes32' },
    { name: 'signerAddress', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export const ROTATE_TYPES: Record<string, TypedDataField[]> = {
  KeyRotation: [
    { name: 'communityId', type: 'bytes32' },
    { name: 'memberIdHash', type: 'bytes32' },
    { name: 'newSignerAddress', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export const PROPOSAL_TYPES: Record<string, TypedDataField[]> = {
  ProposalCreation: [
    { name: 'communityId', type: 'bytes32' },
    { name: 'proposalId', type: 'bytes32' },
    { name: 'kind', type: 'uint8' },
    { name: 'optionsHash', type: 'bytes32' },
    { name: 'endTime', type: 'uint64' },
    { name: 'minVoterCount', type: 'uint32' },
    { name: 'targetMemberIdHash', type: 'bytes32' },
    { name: 'pInflationRateBps', type: 'uint32' },
    { name: 'pMaxAdvanceRateBps', type: 'uint32' },
    { name: 'pMemberMintCapRateBps', type: 'uint32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

// ---- struct shapes (uint256 -> bigint; uint32/uint64 accept number|bigint) ----

export interface MintAuthorization {
  communityId: Hex32;
  memberIdHash: Hex32;
  contributionId: Hex32;
  ruleVersion: number;
  epochNumber: number | bigint;
  regularAmount: bigint;
  advanceAmount: bigint;
  relatedParty: boolean;
  proposalId: Hex32;
  evidenceHash: Hex32;
  recordHash: Hex32;
  nonce: bigint;
  deadline: number | bigint;
}

export interface ReversalAuthorization {
  communityId: Hex32;
  memberIdHash: Hex32;
  originalRecordHash: Hex32;
  amount: bigint;
  proposalId: Hex32;
  evidenceHash: Hex32;
  recordHash: Hex32;
  nonce: bigint;
  deadline: number | bigint;
}

export interface VoteAuthorization {
  communityId: Hex32;
  proposalId: Hex32;
  memberIdHash: Hex32;
  optionId: Hex32;
  nonce: bigint;
  deadline: number | bigint;
}

export interface MemberEnrollment {
  communityId: Hex32;
  memberIdHash: Hex32;
  signerAddress: string;
  nonce: bigint;
  deadline: number | bigint;
}

export interface KeyRotation {
  communityId: Hex32;
  memberIdHash: Hex32;
  newSignerAddress: string;
  nonce: bigint;
  deadline: number | bigint;
}

// ---- digest helpers (full EIP-712 digest: keccak(\x19\x01 ‖ domainSep ‖ hashStruct)) ----

export function mintDigest(domain: Eip712Domain, a: MintAuthorization): Hex32 {
  return TypedDataEncoder.hash(domain, MINT_TYPES, a) as Hex32;
}
export function reversalDigest(domain: Eip712Domain, a: ReversalAuthorization): Hex32 {
  return TypedDataEncoder.hash(domain, REVERSAL_TYPES, a) as Hex32;
}
export function voteDigest(domain: Eip712Domain, v: VoteAuthorization): Hex32 {
  return TypedDataEncoder.hash(domain, VOTE_TYPES, v) as Hex32;
}
export function enrollDigest(domain: Eip712Domain, a: MemberEnrollment): Hex32 {
  return TypedDataEncoder.hash(domain, ENROLL_TYPES, a) as Hex32;
}
export function rotateDigest(domain: Eip712Domain, a: KeyRotation): Hex32 {
  return TypedDataEncoder.hash(domain, ROTATE_TYPES, a) as Hex32;
}

/** The domain separator alone (matches the contract's cached `_domainSeparator`). */
export function domainSeparator(domain: Eip712Domain): Hex32 {
  return TypedDataEncoder.hashDomain(domain) as Hex32;
}
