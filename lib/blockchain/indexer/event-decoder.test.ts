import { id } from 'ethers';
import { describe, expect, it } from 'vitest';

import { decodeGovernanceLog, decodeGovernanceLogs, governanceInterface } from './event-decoder';

const iface = governanceInterface();

function encodeLog(name: string, values: unknown[], blockNumber: number, logIndex: number) {
  const { data, topics } = iface.encodeEventLog(name, values);
  return { data, topics, blockNumber, logIndex, transactionHash: id(`tx:${name}:${logIndex}`) };
}

describe('governance event decoder', () => {
  it('decodes a MintExecuted log with JSON-safe (decimal-string) uint256 args', () => {
    const communityId = id('community:1');
    const memberIdHash = id('member:alice');
    const recordHash = id('record:1');
    const log = encodeLog(
      'MintExecuted',
      [
        communityId,
        memberIdHash,
        recordHash,
        id('contribution:1'),
        1, // ruleVersion
        1, // epochNumber
        800n, // regularAmount
        0n, // advanceAmount
        2, // activationEpoch
        800n, // memberBalanceAfter
        100800n, // totalSupplyAfter
        5n, // govSeqAfter
        '0x' + '00'.repeat(32), // proposalId
        1, // approvalTier
        id('evidence'), // evidenceHash
      ],
      42,
      0,
    );

    const d = decodeGovernanceLog(log);
    expect(d).to.not.equal(null);
    expect(d!.eventName).to.equal('MintExecuted');
    expect(d!.communityId).to.equal(communityId);
    expect(d!.memberIdHash).to.equal(memberIdHash);
    expect(d!.recordHash).to.equal(recordHash);
    // uint256 crossed the boundary as a decimal string
    expect(d!.args.regularAmount).to.equal('800');
    expect(d!.args.totalSupplyAfter).to.equal('100800');
    expect(typeof d!.args.memberBalanceAfter).to.equal('string');
    // ledgerSeq lifted from govSeqAfter for the fresher-wins guard
    expect(d!.ledgerSeq).to.equal(5n);
    expect(d!.blockNumber).to.equal(42);
  });

  it('decodes an EpochRolled log and lifts communityId', () => {
    const communityId = id('community:2');
    const log = encodeLog(
      'EpochRolled',
      [communityId, 1, 2, 101300n, 5065n, 800n, 500n, 500n, 4565n, 1519n],
      50,
      1,
    );
    const d = decodeGovernanceLog(log);
    expect(d!.eventName).to.equal('EpochRolled');
    expect(d!.communityId).to.equal(communityId);
    expect(d!.args.nextEffectiveRegularBudget).to.equal('4565');
    expect(d!.ledgerSeq).to.equal(null); // no govSeqAfter on this event
  });

  it('returns null for a foreign/undecodable log', () => {
    const foreign = {
      topics: [id('SomethingElse(uint256)')],
      data: '0x',
      blockNumber: 1,
      logIndex: 0,
      transactionHash: id('tx:foreign'),
    };
    expect(decodeGovernanceLog(foreign)).to.equal(null);
  });

  it('decodeGovernanceLogs sorts by (block, logIndex) and drops foreign logs', () => {
    const cid = id('community:3');
    const a = encodeLog('Paused', ['0x0000000000000000000000000000000000000001'], 10, 2);
    const b = encodeLog('Unpaused', ['0x0000000000000000000000000000000000000001'], 10, 0);
    const foreign = { topics: [id('X()')], data: '0x', blockNumber: 9, logIndex: 9, transactionHash: id('tx:x') };
    const out = decodeGovernanceLogs([a, b, foreign]);
    expect(out.map((e) => e.eventName)).to.deep.equal(['Unpaused', 'Paused']); // logIndex 0 before 2
  });
});
