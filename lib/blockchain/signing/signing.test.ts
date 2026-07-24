import { Wallet } from 'ethers';
import { describe, expect, it } from 'vitest';

import type { Hex32 } from '../types';

import { mintEnvelope, voteEnvelope } from './auth-envelope';
import { recoverMintSigner, recoverVoteSigner, isMintSignedBy } from './recover';
import {
  buildDomain,
  mintDigest,
  voteDigest,
  type MintAuthorization,
  type VoteAuthorization,
} from './typed-data';

// deterministic key (no network / no contract needed for pure TS coverage)
const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const DOMAIN = buildDomain(1439, '0x4309ba5d47fbc45d980988b0d5b0202b8ac7db33');
const H = (s: string): Hex32 => `0x${'0'.repeat(63)}${s}` as Hex32;

const mint = (): MintAuthorization => ({
  communityId: H('1'),
  memberIdHash: H('2'),
  contributionId: H('3'),
  ruleVersion: 1,
  epochNumber: 1,
  regularAmount: 800n,
  advanceAmount: 0n,
  relatedParty: false,
  proposalId: H('0'),
  evidenceHash: H('4'),
  recordHash: H('5'),
  nonce: 7n,
  deadline: 9_999_999_999n,
});

describe('v0.7 signing module', () => {
  it('recovers the approver that signed a mint authorization', async () => {
    const w = new Wallet(KEY);
    const a = mint();
    const sig = await w.signTypedData(DOMAIN, { MintAuthorization: mintEnvelope(DOMAIN, a).types.MintAuthorization }, a);
    expect(recoverMintSigner(DOMAIN, a, sig)).to.equal(w.address);
    expect(isMintSignedBy(DOMAIN, a, sig, w.address)).to.equal(true);
  });

  it('returns null for a malformed signature (mirrors contract addr(0))', () => {
    expect(recoverMintSigner(DOMAIN, mint(), '0xdeadbeef')).to.equal(null);
  });

  it('a tampered amount changes the digest so the old signature no longer recovers the signer', async () => {
    const w = new Wallet(KEY);
    const a = mint();
    const sig = await w.signTypedData(DOMAIN, { MintAuthorization: mintEnvelope(DOMAIN, a).types.MintAuthorization }, a);
    const tampered = { ...a, regularAmount: 999_999n };
    expect(recoverMintSigner(DOMAIN, tampered, sig)).to.not.equal(w.address);
  });

  it('the envelope carries uint256 as decimal strings but preserves the digest', () => {
    const a = mint();
    a.regularAmount = 2n ** 200n;
    const env = mintEnvelope(DOMAIN, a);
    expect(env.message.regularAmount).to.equal((2n ** 200n).toString(10));
    expect(env.digest).to.equal(mintDigest(DOMAIN, a));
    expect(typeof env.message.nonce).to.equal('string');
  });

  it('recovers a member vote signature', async () => {
    const w = new Wallet(KEY);
    const v: VoteAuthorization = {
      communityId: H('1'),
      proposalId: H('9'),
      memberIdHash: H('2'),
      optionId: H('a'),
      nonce: 1n,
      deadline: 9_999_999_999n,
    };
    const sig = await w.signTypedData(DOMAIN, { VoteAuthorization: voteEnvelope(DOMAIN, v).types.VoteAuthorization }, v);
    expect(recoverVoteSigner(DOMAIN, v, sig)).to.equal(w.address);
    expect(voteDigest(DOMAIN, v)).to.equal(voteEnvelope(DOMAIN, v).digest);
  });
});
