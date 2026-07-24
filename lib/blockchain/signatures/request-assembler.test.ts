import { describe, expect, it } from 'vitest';

import type { Hex32 } from '../types';

import { mintDigest, buildDomain } from '../signing/typed-data';

import { assembleMint, type MintAssemblyInput } from './request-assembler';

const DOMAIN = buildDomain(1439, '0x4309ba5d47fbc45d980988b0d5b0202b8ac7db33');
const H = (s: string): Hex32 => `0x${s.padStart(64, '0')}` as Hex32;

function base(over: Partial<MintAssemblyInput> = {}): MintAssemblyInput {
  return {
    domain: DOMAIN,
    communityId: H('1'),
    memberIdHash: H('2'),
    contributionId: H('3'),
    ruleVersion: 1,
    epochNumber: 1,
    regularAmount: 800n,
    advanceAmount: 0n,
    relatedParty: false,
    evidenceHash: H('4'),
    recordHash: H('5'),
    nonce: 7n,
    deadline: 9_999_999_999,
    baseMintBudget: 5000n,
    epochAdvanceMinted: 0n,
    approverThreshold: 1,
    ...over,
  };
}

describe('mint request assembler', () => {
  it('builds a MintAuthorization whose envelope digest matches the typed-data digest', () => {
    const a = assembleMint(base());
    expect(a.authorization.regularAmount).to.equal(800n);
    expect(a.authorization.proposalId).to.equal(H('0')); // defaulted to zero
    expect(a.digest).to.equal(mintDigest(DOMAIN, a.authorization));
    expect(a.envelope.message.regularAmount).to.equal('800'); // decimal string on the boundary
  });

  it('resolves a normal mint to a single approver', () => {
    const a = assembleMint(base());
    expect(a.approval.tier).to.equal('single');
    expect(a.approval.requiredApprovers).to.equal(1);
    expect(a.approval.forbidden).to.equal(false);
  });

  it('resolves a <=10% advance to DUAL', () => {
    const a = assembleMint(base({ regularAmount: 0n, advanceAmount: 500n })); // 500/5000 = 1000 bps
    expect(a.approval.tier).to.equal('dual');
    expect(a.approval.requiredApprovers).to.equal(2);
  });

  it('flags an advance over 25% cumulative as forbidden', () => {
    const a = assembleMint(base({ regularAmount: 0n, advanceAmount: 1300n })); // 2600 bps
    expect(a.approval.forbidden).to.equal(true);
    expect(a.approval.reason).to.equal('ADVANCE_LIMIT_EXCEEDED');
  });

  it('accounts for already-minted advance in the cumulative gate (split-order)', () => {
    const a = assembleMint(base({ regularAmount: 0n, advanceAmount: 800n, epochAdvanceMinted: 500n })); // (500+800)/5000 = 2600
    expect(a.approval.forbidden).to.equal(true);
  });
});
