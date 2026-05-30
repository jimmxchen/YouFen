// ID → bytes32 hashing (BLOCKCHAIN-DESIGN §4.3, PRD §28.4 privacy). Pure and
// IO-free: the pepper is always an explicit argument, never read from env here.
//
// Domains are prefixed so the four id spaces can never collide. Communities are
// public entities, hashed without salt so any third party can recompute them.
// Members are peppered so on-chain hashes cannot be dictionary-enumerated back
// to real identities; the pepper only protects the hash → member direction.

import { CanonicalizationError } from '../errors';
import type { Hex32 } from '../types';

import { keccakUtf8 } from './record-hash';

/** Reject empty identifier / pepper arguments at the boundary. */
function requireNonEmpty(value: string, name: string): void {
  if (value.length === 0) {
    throw new CanonicalizationError(`${name} must be a non-empty string`);
  }
}

/** keccak256(utf8(`youfen:community:v1:${id}`)) — no pepper, recomputable. */
export function hashCommunityId(communityId: string): Hex32 {
  requireNonEmpty(communityId, 'communityId');
  return keccakUtf8(`youfen:community:v1:${communityId}`);
}

/** keccak256(utf8(`youfen:member:v1:${cid}:${mid}:${pepper}`)). */
export function hashMemberId(
  communityId: string,
  memberId: string,
  pepper: string,
): Hex32 {
  requireNonEmpty(communityId, 'communityId');
  requireNonEmpty(memberId, 'memberId');
  requireNonEmpty(pepper, 'pepper');
  return keccakUtf8(`youfen:member:v1:${communityId}:${memberId}:${pepper}`);
}

/** keccak256(utf8(`youfen:proposal:v1:${id}`)) — no pepper. */
export function hashProposalId(proposalId: string): Hex32 {
  requireNonEmpty(proposalId, 'proposalId');
  return keccakUtf8(`youfen:proposal:v1:${proposalId}`);
}

/** keccak256(utf8(`youfen:option:v1:${proposalId}:${optionId}`)) — no pepper. */
export function hashOptionId(proposalId: string, optionId: string): Hex32 {
  requireNonEmpty(proposalId, 'proposalId');
  requireNonEmpty(optionId, 'optionId');
  return keccakUtf8(`youfen:option:v1:${proposalId}:${optionId}`);
}
