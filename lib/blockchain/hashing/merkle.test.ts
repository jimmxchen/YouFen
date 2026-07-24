import { concat, keccak256, solidityPackedKeccak256, ZeroHash } from 'ethers';
import { describe, expect, it } from 'vitest';

import { CanonicalizationError } from '../errors';
import type { Hex32 } from '../types';

import {
  buildMerkleProof,
  buildMerkleRoot,
  hashSnapshotLeaf,
  hashVoteLeaf,
  verifyMerkleProof,
  ZERO_ROOT,
} from './merkle';

// Golden fixtures: the same member/option id hashes used by the payload vectors,
// so the whole layer shares one deterministic corpus. Every literal below is the
// keccak256/ethers-derived value locked once — any drift in leaf encoding, pair
// sorting, or tree shape flips one of these assertions.

const ALICE = '0xb5eb58084bf47317953b513d98b2c3221ed646935a8ebae615daa2aeacf55c5a' as Hex32;
const BOB = '0xa67571d816a58b3de0a9fdcbce4d9e01e56e16f1b7d41fec06a7e4cd1329d481' as Hex32;
const CAROL = '0x9df9c45c010c53dc17a92c60992879f5b27e27360ea0a383f5e9d56af5a5d56d' as Hex32;
const DAVE = '0xcd5e05432c31fe43e3bf982535d9e65069249fe418b5ba528683fc4809c5065a' as Hex32;
const OPTION_YES = '0x1b96c31fa137c7b4de1a4b92c3f02c3e8c730f5c1f22eccb58c06efba7ceb145' as Hex32;
const OPTION_NO = '0xb06eb50d5682878471cc312216e412ed91f2269099a80509738045c39fc56087' as Hex32;

// ---- Leaf encoding golden vectors ---------------------------------------

describe('hashSnapshotLeaf / hashVoteLeaf — golden leaf encoding', () => {
  it('locks the snapshot leaf = keccak256(abi.encodePacked(memberIdHash, weight))', () => {
    expect(hashSnapshotLeaf(ALICE, 10500n)).toBe(
      '0x1ebc639637d70f8575f45d6463eb5ccb789ea6527105649adbdc0a1766cf1cbf',
    );
    expect(hashSnapshotLeaf(BOB, 11300n)).toBe(
      '0xea1eb37a6485a2b549606dd9d6946345cc543e3a62e9bf07b9e6c5280da2d293',
    );
    expect(hashSnapshotLeaf(CAROL, 500n)).toBe(
      '0x4ac0a6f62a344e965a9aa093cc9c07b1d5522aceff701f171878b73ae78203cd',
    );
  });

  it('locks the vote leaf = keccak256(abi.encodePacked(memberIdHash, optionIdHash, weight))', () => {
    expect(hashVoteLeaf(ALICE, OPTION_YES, 10500n)).toBe(
      '0x35c2e8f983ff4ffe7137ec3395a4bbd318201484c823e8d8c431d78d44bc1f79',
    );
    expect(hashVoteLeaf(CAROL, OPTION_NO, 500n)).toBe(
      '0x3e0985577edde99e73dcb6197d152e1cc44136f13fc0d7cc2091a3b753405193',
    );
  });

  it('matches the on-chain reproducible form (ethers solidityPackedKeccak256)', () => {
    expect(hashSnapshotLeaf(ALICE, 10500n)).toBe(
      solidityPackedKeccak256(['bytes32', 'uint256'], [ALICE, 10500n]),
    );
    expect(hashVoteLeaf(BOB, OPTION_YES, 11300n)).toBe(
      solidityPackedKeccak256(
        ['bytes32', 'bytes32', 'uint256'],
        [BOB, OPTION_YES, 11300n],
      ),
    );
  });

  it('is weight-sensitive (different weight -> different leaf)', () => {
    expect(hashSnapshotLeaf(ALICE, 10500n)).not.toBe(
      hashSnapshotLeaf(ALICE, 10501n),
    );
  });
});

// ---- Root golden vectors -------------------------------------------------

describe('buildMerkleRoot — golden roots + degenerate trees', () => {
  const snapLeaves = [
    hashSnapshotLeaf(ALICE, 10500n),
    hashSnapshotLeaf(BOB, 11300n),
    hashSnapshotLeaf(CAROL, 500n),
  ];
  const voteLeaves = [
    hashVoteLeaf(ALICE, OPTION_YES, 10500n),
    hashVoteLeaf(BOB, OPTION_YES, 11300n),
    hashVoteLeaf(CAROL, OPTION_NO, 500n),
    hashVoteLeaf(DAVE, OPTION_YES, 200n),
  ];

  it('locks the 3-leaf snapshot root', () => {
    expect(buildMerkleRoot(snapLeaves)).toBe(
      '0x4bfd8a02159ce7877e662c8a709fc20f3d89899b769ecb4d19a089ae35ac797f',
    );
  });

  it('locks the 4-leaf vote root', () => {
    expect(buildMerkleRoot(voteLeaves)).toBe(
      '0x7b0f98647c21c206661fa92f7b0325276d015e112ae238072a0cc8d3349435f6',
    );
  });

  it('returns bytes32(0) for the empty tree', () => {
    expect(buildMerkleRoot([])).toBe(ZERO_ROOT);
    expect(ZERO_ROOT).toBe(ZeroHash);
  });

  it('returns the leaf itself for a single-leaf tree', () => {
    expect(buildMerkleRoot([snapLeaves[0]])).toBe(snapLeaves[0]);
  });

  it('locks the 2-leaf root as keccak256(min||max)', () => {
    const [a, b] = [snapLeaves[0], snapLeaves[1]];
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const expected = keccak256(concat([lo, hi]));
    expect(buildMerkleRoot([a, b])).toBe(expected);
    expect(buildMerkleRoot([a, b])).toBe(
      '0xd62ced8f855a7c25f6a50e6cc84531dea831fd45ca4a12fb50ff12fe6db46e64',
    );
  });

  it('is pair-sorted: sibling order within a pair does not change the root', () => {
    const [a, b] = [snapLeaves[0], snapLeaves[1]];
    expect(buildMerkleRoot([a, b])).toBe(buildMerkleRoot([b, a]));
  });

  it('internal node parity with ethers solidityPackedKeccak256(min,max)', () => {
    const [a, b] = [snapLeaves[0], snapLeaves[1]];
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    expect(buildMerkleRoot([a, b])).toBe(
      solidityPackedKeccak256(['bytes32', 'bytes32'], [lo, hi]),
    );
  });
});

// ---- Proof roundtrip -----------------------------------------------------

describe('buildMerkleProof / verifyMerkleProof — roundtrip', () => {
  const snapLeaves = [
    hashSnapshotLeaf(ALICE, 10500n),
    hashSnapshotLeaf(BOB, 11300n),
    hashSnapshotLeaf(CAROL, 500n),
  ];
  const voteLeaves = [
    hashVoteLeaf(ALICE, OPTION_YES, 10500n),
    hashVoteLeaf(BOB, OPTION_YES, 11300n),
    hashVoteLeaf(CAROL, OPTION_NO, 500n),
    hashVoteLeaf(DAVE, OPTION_YES, 200n),
  ];

  it('every snapshot leaf verifies against the root via its proof', () => {
    const root = buildMerkleRoot(snapLeaves);
    snapLeaves.forEach((leaf, i) => {
      const proof = buildMerkleProof(snapLeaves, i);
      expect(verifyMerkleProof(leaf, proof, root), `leaf ${i}`).toBe(true);
    });
  });

  it('every vote leaf verifies against the root via its proof', () => {
    const root = buildMerkleRoot(voteLeaves);
    voteLeaves.forEach((leaf, i) => {
      const proof = buildMerkleProof(voteLeaves, i);
      expect(verifyMerkleProof(leaf, proof, root), `leaf ${i}`).toBe(true);
    });
  });

  it('the odd-tail leaf is promoted, so its proof is one hash (the left subtree root)', () => {
    // 3 leaves: index 2 is the odd tail at the base level. Its proof holds a
    // single node — the parent of leaves 0 and 1.
    const proof = buildMerkleProof(snapLeaves, 2);
    expect(proof).toHaveLength(1);
    expect(proof[0]).toBe(buildMerkleRoot([snapLeaves[0], snapLeaves[1]]));
  });

  it('a single-leaf tree yields the empty proof and still verifies', () => {
    const root = buildMerkleRoot([snapLeaves[0]]);
    const proof = buildMerkleProof([snapLeaves[0]], 0);
    expect(proof).toEqual([]);
    expect(verifyMerkleProof(snapLeaves[0], proof, root)).toBe(true);
  });

  it('rejects a wrong leaf against a valid proof', () => {
    const root = buildMerkleRoot(snapLeaves);
    const proof = buildMerkleProof(snapLeaves, 0);
    expect(verifyMerkleProof(snapLeaves[1], proof, root)).toBe(false);
  });

  it('rejects a tampered proof node', () => {
    const root = buildMerkleRoot(snapLeaves);
    const proof = buildMerkleProof(snapLeaves, 0);
    const tampered = [...proof];
    tampered[0] = hashSnapshotLeaf(DAVE, 1n);
    expect(verifyMerkleProof(snapLeaves[0], tampered, root)).toBe(false);
  });

  it('rejects a valid proof against a wrong root', () => {
    const proof = buildMerkleProof(snapLeaves, 0);
    expect(verifyMerkleProof(snapLeaves[0], proof, ZERO_ROOT)).toBe(false);
  });

  it('a leaf not in the tree fails to verify with a foreign proof', () => {
    const root = buildMerkleRoot(snapLeaves);
    const foreign = hashSnapshotLeaf(DAVE, 999n);
    const proof = buildMerkleProof(snapLeaves, 0);
    expect(verifyMerkleProof(foreign, proof, root)).toBe(false);
  });
});

// ---- Boundary validation -------------------------------------------------

describe('merkle — boundary validation', () => {
  const good = hashSnapshotLeaf(ALICE, 1n);

  it('rejects a non-hex32 leaf in buildMerkleRoot', () => {
    expect(() => buildMerkleRoot(['0xdeadbeef' as Hex32])).toThrowError(
      CanonicalizationError,
    );
  });

  it('rejects an uppercase (non-normalised) hex leaf', () => {
    const upper = good.toUpperCase().replace('0X', '0x') as Hex32;
    expect(() => buildMerkleRoot([upper])).toThrowError(CanonicalizationError);
  });

  it('rejects a negative weight', () => {
    expect(() => hashSnapshotLeaf(ALICE, -1n)).toThrowError(
      CanonicalizationError,
    );
  });

  it('rejects an out-of-range proof index', () => {
    expect(() => buildMerkleProof([good], 1)).toThrowError(
      CanonicalizationError,
    );
    expect(() => buildMerkleProof([good], -1)).toThrowError(
      CanonicalizationError,
    );
  });

  it('rejects a malformed root in verifyMerkleProof', () => {
    expect(() => verifyMerkleProof(good, [], 'nope' as Hex32)).toThrowError(
      CanonicalizationError,
    );
  });
});
