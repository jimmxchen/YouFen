// keccak256 Merkle tree for individual verifiability (T3). Pure and IO-free.
//
// Keccak-256 comes exclusively from ethers (Ethereum Keccak-256) — Node's crypto
// 'sha3-256' is NIST SHA3 and produces different digests; never use it here.
//
// ---- Leaf encoding (canonical spec — one form, on-chain reproducible) --------
// Leaves are hashed with abi.encodePacked (ethers `solidityPacked`) so the exact
// same leaf can be recomputed in Solidity as keccak256(abi.encodePacked(...)):
//   snapshot leaf : keccak256(abi.encodePacked(bytes32 memberIdHash, uint256 weight))
//   vote leaf     : keccak256(abi.encodePacked(bytes32 memberIdHash,
//                                              bytes32 optionIdHash, uint256 weight))
// weight is a bigint (all amounts are bigint) encoded as uint256.
//
// ---- Internal nodes (sorted pair — direction-proof-free) ---------------------
// A parent is keccak256(min(a,b) || max(a,b)) over the two 32-byte children
// (OpenZeppelin MerkleProof convention). Sorting each pair means a proof is just
// the list of sibling hashes; no left/right direction bits are needed.
//
// ---- Degenerate trees --------------------------------------------------------
//   empty tree  -> root = bytes32(0)
//   single leaf -> root = the leaf itself (its proof is the empty array)

import { concat, keccak256, solidityPacked } from 'ethers';

import { CanonicalizationError } from '../errors';
import type { Hex32 } from '../types';

/** The all-zero bytes32; the canonical root of an empty Merkle tree. */
export const ZERO_ROOT =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex32;

const HEX32_RE = /^0x[0-9a-f]{64}$/;

/** Validate a lowercase 0x-prefixed 32-byte hex string at the boundary. */
function requireHex32(value: string, name: string): Hex32 {
  if (typeof value !== 'string' || !HEX32_RE.test(value)) {
    throw new CanonicalizationError(
      `${name} must be a lowercase 0x-prefixed 32-byte hex string`,
    );
  }
  return value as Hex32;
}

/** Validate a non-negative uint256 weight (amounts are always bigint). */
function requireWeight(weight: bigint, name: string): bigint {
  if (typeof weight !== 'bigint') {
    throw new CanonicalizationError(`${name} must be a bigint`);
  }
  if (weight < 0n) {
    throw new CanonicalizationError(`${name} must be a non-negative uint256`);
  }
  return weight;
}

/**
 * Snapshot leaf = keccak256(abi.encodePacked(memberIdHash, weight)).
 * Commits one member's frozen voting weight so they can self-prove inclusion.
 */
export function hashSnapshotLeaf(memberIdHash: Hex32, weight: bigint): Hex32 {
  const member = requireHex32(memberIdHash, 'memberIdHash');
  const w = requireWeight(weight, 'weight');
  return keccak256(
    solidityPacked(['bytes32', 'uint256'], [member, w]),
  ) as Hex32;
}

/**
 * Vote leaf = keccak256(abi.encodePacked(memberIdHash, optionIdHash, weight)).
 * Commits one counted ballot so the voter can self-prove it entered the tally.
 */
export function hashVoteLeaf(
  memberIdHash: Hex32,
  optionIdHash: Hex32,
  weight: bigint,
): Hex32 {
  const member = requireHex32(memberIdHash, 'memberIdHash');
  const option = requireHex32(optionIdHash, 'optionIdHash');
  const w = requireWeight(weight, 'weight');
  return keccak256(
    solidityPacked(['bytes32', 'bytes32', 'uint256'], [member, option, w]),
  ) as Hex32;
}

/** Parent of two nodes: keccak256(min||max) — sorted so proofs carry no direction. */
function hashPair(a: Hex32, b: Hex32): Hex32 {
  // Both are equal-length lowercase 0x hex, so string comparison equals the
  // big-endian byte comparison of the two 32-byte values.
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return keccak256(concat([lo, hi])) as Hex32;
}

/** Fold one level of a tree bottom-up; the odd tail node is promoted unchanged. */
function nextLevel(level: readonly Hex32[]): Hex32[] {
  const parents: Hex32[] = [];
  for (let i = 0; i < level.length; i += 2) {
    parents.push(
      i + 1 < level.length ? hashPair(level[i], level[i + 1]) : level[i],
    );
  }
  return parents;
}

/**
 * Build the Merkle root of an ordered leaf list.
 *   []      -> ZERO_ROOT (bytes32(0))
 *   [leaf]  -> leaf itself
 * Leaf order is significant (it fixes which leaves pair); callers must publish a
 * stable order (e.g. memberIdHash ascending) so the root is reproducible.
 */
export function buildMerkleRoot(leaves: readonly Hex32[]): Hex32 {
  if (leaves.length === 0) {
    return ZERO_ROOT;
  }
  let level: Hex32[] = leaves.map((leaf, i) => requireHex32(leaf, `leaf[${i}]`));
  while (level.length > 1) {
    level = nextLevel(level);
  }
  return level[0];
}

/**
 * Build the inclusion proof (bottom-up sibling hashes) for the leaf at `index`.
 * A single-leaf tree yields the empty proof. When a node is the promoted odd
 * tail at some level it has no sibling and contributes nothing to the proof.
 */
export function buildMerkleProof(
  leaves: readonly Hex32[],
  index: number,
): Hex32[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new CanonicalizationError(
      `index ${String(index)} out of range for ${leaves.length} leaves`,
    );
  }
  let level: Hex32[] = leaves.map((leaf, i) => requireHex32(leaf, `leaf[${i}]`));
  let idx = index;
  const proof: Hex32[] = [];
  while (level.length > 1) {
    const siblingIdx = idx ^ 1;
    if (siblingIdx < level.length) {
      proof.push(level[siblingIdx]);
    }
    idx = Math.floor(idx / 2);
    level = nextLevel(level);
  }
  return proof;
}

/**
 * Verify a leaf against a root by folding the proof with the same sorted-pair
 * rule used to build the tree. An empty proof means the leaf must equal the root
 * (single-leaf tree). Returns a boolean; malformed hex inputs throw.
 */
export function verifyMerkleProof(
  leaf: Hex32,
  proof: readonly Hex32[],
  root: Hex32,
): boolean {
  let computed = requireHex32(leaf, 'leaf');
  const target = requireHex32(root, 'root');
  for (let i = 0; i < proof.length; i += 1) {
    computed = hashPair(computed, requireHex32(proof[i], `proof[${i}]`));
  }
  return computed === target;
}
