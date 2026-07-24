// Pure context helpers shared by every chain-write endpoint group (§6 write
// endpoints). These turn caller-supplied plaintext ids into the on-chain bytes32
// keys + the frozen EIP-712 domain that the request-assembler / signature layer
// expects, and mint the fresh nonce + deadline every authorization carries.
//
// IO boundary: resolveCommunityContext reads the deployed contract through
// runtime.reader (no DB, no signing); the rest are CPU-only. hashCommunityId is
// the on-chain communityId bytes32 key; hashMemberId (peppered) is the member
// key. Both come from lib/blockchain/hashing/id-hash so off-chain and on-chain
// agree byte-for-byte.

import { randomBytes } from 'node:crypto';

import { hashCommunityId, hashMemberId } from '../../blockchain/hashing/id-hash';
import type { Hex32 } from '../../blockchain/types';
import type { Eip712Domain } from '../../blockchain/signing/typed-data';
import type { GovernanceRuntime } from '../../blockchain/relay/governance-runtime';

/**
 * The on-chain view a write handler needs before it can assemble an
 * authorization: the community's bytes32 key, its approver threshold + active
 * policy version, the live epoch number, that epoch's base mint budget and
 * cumulative advance-minted (the split-order / advance-rate gate inputs), and
 * the frozen EIP-712 domain to sign against.
 */
export interface CommunityContext {
  readonly communityIdHash: Hex32;
  readonly approverThreshold: number;
  readonly activePolicyVersion: number;
  readonly currentEpochNumber: bigint;
  readonly baseMintBudget: bigint;
  readonly epochAdvanceMinted: bigint;
  readonly domain: Eip712Domain;
}

/** Throw an engine-shaped error (mapEngineError maps `code` → HTTP status). */
function engineError(code: string, message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  throw err;
}

/**
 * Read the on-chain community + its current epoch into a CommunityContext.
 * Throws NOT_FOUND (→404) when the community does not exist on-chain. The
 * plaintext `communityId` is hashed with hashCommunityId to derive the bytes32
 * key used for every read and for the authorization's `communityId` field.
 */
export async function resolveCommunityContext(
  runtime: GovernanceRuntime,
  communityId: string,
): Promise<CommunityContext> {
  const communityIdHash = hashCommunityId(communityId);
  const community = await runtime.reader.communities(communityIdHash);
  if (!community.exists) {
    engineError('NOT_FOUND', `Community not found on-chain: ${communityId}`);
  }
  const epoch = await runtime.reader.getEpoch(communityIdHash, community.currentEpochNumber);
  return {
    communityIdHash,
    approverThreshold: community.approverThreshold,
    activePolicyVersion: community.activePolicyVersion,
    currentEpochNumber: community.currentEpochNumber,
    baseMintBudget: epoch.baseMintBudget,
    epochAdvanceMinted: epoch.advanceMinted,
    domain: runtime.domain,
  };
}

/**
 * Derive the peppered member bytes32 key. The pepper comes from
 * BlockchainConfig.pepper (never read from env here) so hashing stays pure and
 * matches the on-chain memberIdHash.
 */
export function resolveMemberIdHash(
  communityId: string,
  memberId: string,
  pepper: string,
): Hex32 {
  return hashMemberId(communityId, memberId, pepper);
}

/**
 * A cryptographically-random uint256 nonce as bigint. Every EIP-712
 * authorization carries a per-signer nonce (contract usedNonce set); a random
 * 256-bit value makes collisions negligible without a DB round-trip.
 */
export function freshNonce(): bigint {
  return BigInt('0x' + randomBytes(32).toString('hex'));
}

/**
 * An absolute unix-seconds deadline `ttlSeconds` from now, as bigint (the
 * uint256 `deadline` field). The contract rejects an authorization once
 * block.timestamp passes this value.
 */
export function deadline(ttlSeconds: number): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + ttlSeconds);
}
