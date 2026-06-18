import { describe, expect, it } from 'vitest';

import type { RecordEnvelope } from '../types';

import { computeRecordHash, keccakUtf8 } from './record-hash';
import fixtures from './__fixtures__/golden-vectors.json';

const asEnvelope = (value: unknown): RecordEnvelope =>
  value as unknown as RecordEnvelope;

describe('keccakUtf8', () => {
  it('hashes the empty string to the Keccak-256 anchor (proves not NIST SHA3)', () => {
    // NIST SHA3-256('') would be
    // 0xa7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a.
    expect(keccakUtf8('')).toBe(fixtures.keccakEmptyStringAnchor);
    expect(keccakUtf8('')).toBe(
      '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
    );
  });

  it('returns a lowercase 0x-prefixed 32-byte hex string (66 chars)', () => {
    const hash = keccakUtf8('youfen');
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hash).toHaveLength(66);
  });

  it('is deterministic', () => {
    expect(keccakUtf8('abc')).toBe(keccakUtf8('abc'));
  });
});

describe('computeRecordHash — golden vectors', () => {
  for (const vector of fixtures.envelopeVectors) {
    it(`locks the hash for ${vector.name}`, () => {
      expect(computeRecordHash(asEnvelope(vector.envelope))).toBe(vector.hash);
    });

    it(`equals keccakUtf8 of the frozen canonical for ${vector.name}`, () => {
      expect(computeRecordHash(asEnvelope(vector.envelope))).toBe(
        keccakUtf8(vector.canonical),
      );
    });
  }
});

describe('computeRecordHash — key order independence', () => {
  for (const vector of fixtures.keyShuffleVectors) {
    it(`yields the same hash for shuffled keys (${vector.name})`, () => {
      expect(computeRecordHash(asEnvelope(vector.envelope))).toBe(vector.hash);
    });
  }
});
