import { describe, expect, it } from 'vitest';

import { CanonicalizationError } from '../errors';

import {
  hashCommunityId,
  hashMemberId,
  hashOptionId,
  hashProposalId,
} from './id-hash';
import { keccakUtf8 } from './record-hash';
import fixtures from './__fixtures__/golden-vectors.json';

const vectors = fixtures.idHashVectors;

describe('hashCommunityId', () => {
  it('matches the golden vector (no pepper, third-party recomputable)', () => {
    expect(hashCommunityId(vectors.community.input)).toBe(vectors.community.hash);
  });

  it('equals keccakUtf8 of the youfen:community:v1 preimage', () => {
    expect(hashCommunityId(vectors.community.input)).toBe(
      keccakUtf8(vectors.community.preimage),
    );
  });

  it('is deterministic', () => {
    expect(hashCommunityId('cmm_alpha')).toBe(hashCommunityId('cmm_alpha'));
  });

  it('rejects an empty community id', () => {
    expect(() => hashCommunityId('')).toThrow(CanonicalizationError);
  });
});

describe('hashMemberId', () => {
  it('matches the golden vector for a given pepper', () => {
    const { communityId, memberId, pepper, hash } = vectors.member;
    expect(hashMemberId(communityId, memberId, pepper)).toBe(hash);
  });

  it('equals keccakUtf8 of the youfen:member:v1 preimage', () => {
    const { communityId, memberId, pepper, preimage } = vectors.member;
    expect(hashMemberId(communityId, memberId, pepper)).toBe(
      keccakUtf8(preimage),
    );
  });

  it('produces a different hash for a different pepper (same member)', () => {
    const a = hashMemberId(
      vectors.member.communityId,
      vectors.member.memberId,
      vectors.member.pepper,
    );
    const b = hashMemberId(
      vectors.memberDifferentPepper.communityId,
      vectors.memberDifferentPepper.memberId,
      vectors.memberDifferentPepper.pepper,
    );
    expect(a).toBe(vectors.member.hash);
    expect(b).toBe(vectors.memberDifferentPepper.hash);
    expect(a).not.toBe(b);
  });

  it('throws CanonicalizationError when the pepper is empty', () => {
    expect(() => hashMemberId('cmm_alpha', 'mbr_bob', '')).toThrow(
      CanonicalizationError,
    );
  });

  it('rejects empty community or member ids', () => {
    expect(() => hashMemberId('', 'mbr_bob', 'pepper_test_secret_123456')).toThrow(
      CanonicalizationError,
    );
    expect(() => hashMemberId('cmm_alpha', '', 'pepper_test_secret_123456')).toThrow(
      CanonicalizationError,
    );
  });
});

describe('hashProposalId', () => {
  it('matches the golden vector', () => {
    expect(hashProposalId(vectors.proposal.input)).toBe(vectors.proposal.hash);
  });

  it('equals keccakUtf8 of the youfen:proposal:v1 preimage', () => {
    expect(hashProposalId(vectors.proposal.input)).toBe(
      keccakUtf8(vectors.proposal.preimage),
    );
  });

  it('rejects an empty proposal id', () => {
    expect(() => hashProposalId('')).toThrow(CanonicalizationError);
  });
});

describe('hashOptionId', () => {
  it('matches the golden vector', () => {
    const { proposalId, optionId, hash } = vectors.option;
    expect(hashOptionId(proposalId, optionId)).toBe(hash);
  });

  it('equals keccakUtf8 of the youfen:option:v1 preimage', () => {
    const { proposalId, optionId, preimage } = vectors.option;
    expect(hashOptionId(proposalId, optionId)).toBe(keccakUtf8(preimage));
  });

  it('rejects empty proposal or option ids', () => {
    expect(() => hashOptionId('', 'opt_1')).toThrow(CanonicalizationError);
    expect(() => hashOptionId('prp_x', '')).toThrow(CanonicalizationError);
  });
});

describe('id-hash — four prefix domains are mutually isolated', () => {
  it('community hash is independent of the pepper used for members', () => {
    // Community uses no pepper; member domain has a distinct prefix + pepper.
    expect(hashCommunityId('x')).not.toBe(
      hashMemberId('x', 'x', 'pepper_test_secret_123456'),
    );
  });

  it('all four domains yield distinct hashes for structurally similar inputs', () => {
    const community = hashCommunityId('a');
    const proposal = hashProposalId('a');
    const member = hashMemberId('a', 'a', 'a_pepper_at_least_16');
    const option = hashOptionId('a', 'a');
    const all = new Set([community, proposal, member, option]);
    expect(all.size).toBe(4);
  });

  it('proposal and option domains do not collide on shared ids', () => {
    expect(hashProposalId('prp_x')).not.toBe(hashOptionId('prp_x', 'opt_1'));
  });
});
