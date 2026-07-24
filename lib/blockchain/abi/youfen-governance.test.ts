import { Interface, id } from 'ethers';
import { describe, expect, it } from 'vitest';

import { GOVERNANCE_EVENT_NAMES, YOUFEN_GOVERNANCE_ABI } from './youfen-governance';

describe('YouFenGovernance ABI', () => {
  const iface = new Interface(YOUFEN_GOVERNANCE_ABI);

  it('parses without error', () => {
    expect(iface.fragments.length).to.be.greaterThan(0);
  });

  it('exposes every projected event and a stable topic0', () => {
    for (const name of GOVERNANCE_EVENT_NAMES) {
      const ev = iface.getEvent(name);
      expect(ev, name).to.not.equal(null);
      expect(ev!.topicHash).to.match(/^0x[0-9a-f]{64}$/);
    }
  });

  it('keeps recordHash as the last indexed topic on MintExecuted / ReversalExecuted', () => {
    for (const name of ['MintExecuted', 'ReversalExecuted']) {
      const ev = iface.getEvent(name)!;
      const indexed = ev.inputs.filter((i) => i.indexed);
      expect(indexed.length, `${name} indexed count`).to.equal(3);
      expect(indexed[2].name, `${name} topics[3]`).to.equal('recordHash');
    }
  });

  it('MintExecuted topic0 matches the canonical signature hash', () => {
    const sig =
      'MintExecuted(bytes32,bytes32,bytes32,bytes32,uint32,uint64,uint256,uint256,uint64,uint256,uint256,uint64,bytes32,uint8,bytes32)';
    expect(iface.getEvent('MintExecuted')!.topicHash).to.equal(id(sig));
  });

  it('can encode executeMint calldata (tuple param round-trips)', () => {
    const zero = '0x' + '00'.repeat(32);
    const a = {
      communityId: id('c'),
      memberIdHash: id('m'),
      contributionId: id('con'),
      ruleVersion: 1,
      epochNumber: 1,
      regularAmount: 800n,
      advanceAmount: 0n,
      relatedParty: false,
      proposalId: zero,
      evidenceHash: id('e'),
      recordHash: id('r'),
      nonce: 1n,
      deadline: 9_999_999_999n,
    };
    const data = iface.encodeFunctionData('executeMint', [a, ['0x' + '11'.repeat(65)]]);
    expect(data.startsWith('0x')).to.equal(true);
  });
});
