import { describe, expect, it } from 'vitest';

import { cumulativeAdvanceBps, resolveMintApproval } from './threshold';

describe('mint approval threshold (off-chain mirror of executeMint step 7)', () => {
  it('a normal mint needs a single approver at threshold 1', () => {
    const r = resolveMintApproval({ advanceAmount: 0n, cumulativeAdvanceBps: 0, relatedParty: false, approverThreshold: 1 });
    expect(r.tier).to.equal('single');
    expect(r.requiredApprovers).to.equal(1);
    expect(r.proposalRequired).to.equal(false);
    expect(r.forbidden).to.equal(false);
  });

  it('honours a higher community approver threshold on a normal mint', () => {
    const r = resolveMintApproval({ advanceAmount: 0n, cumulativeAdvanceBps: 0, relatedParty: false, approverThreshold: 3 });
    expect(r.requiredApprovers).to.equal(3);
    expect(r.tier).to.equal('single');
  });

  it('advance <= 10% requires DUAL (two approvers)', () => {
    const r = resolveMintApproval({ advanceAmount: 500n, cumulativeAdvanceBps: 1000, relatedParty: false, approverThreshold: 1 });
    expect(r.tier).to.equal('dual');
    expect(r.requiredApprovers).to.equal(2);
    expect(r.proposalRequired).to.equal(false);
  });

  it('advance > 10% requires a governing proposal', () => {
    const r = resolveMintApproval({ advanceAmount: 600n, cumulativeAdvanceBps: 1200, relatedParty: false, approverThreshold: 1 });
    expect(r.tier).to.equal('proposal');
    expect(r.proposalRequired).to.equal(true);
    expect(r.forbidden).to.equal(false);
  });

  it('advance > 25% cumulative is forbidden (the contract hard-reverts)', () => {
    const r = resolveMintApproval({ advanceAmount: 1300n, cumulativeAdvanceBps: 2600, relatedParty: false, approverThreshold: 1 });
    expect(r.forbidden).to.equal(true);
    expect(r.reason).to.equal('ADVANCE_LIMIT_EXCEEDED');
  });

  it('a related-party mint escalates to at least DUAL', () => {
    const r = resolveMintApproval({ advanceAmount: 0n, cumulativeAdvanceBps: 0, relatedParty: true, approverThreshold: 1 });
    expect(r.tier).to.equal('dual');
    expect(r.requiredApprovers).to.equal(2);
  });

  it('cumulativeAdvanceBps computes the epoch-cumulative rate (split-order gate)', () => {
    // base 5000: first 500 already advanced, requesting 800 -> (1300/5000) = 2600 bps
    expect(cumulativeAdvanceBps(500n, 800n, 5000n)).to.equal(2600);
    // base 0 with a request -> infinite (forbidden)
    expect(cumulativeAdvanceBps(0n, 1n, 0n)).to.equal(Number.POSITIVE_INFINITY);
    expect(cumulativeAdvanceBps(0n, 0n, 0n)).to.equal(0);
  });
});
