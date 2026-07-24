import { ethers } from 'ethers';
import { describe, expect, it } from 'vitest';

import {
  CONTRACT_ERRORS,
  CONTRACT_METHOD_BY_RECORD_TYPE,
  EVENT_TOPICS,
  RECORD_HASH_TOPIC_INDEX,
  YOUFEN_RECORDS_ABI,
} from './youfen-records';
import type { RecordType } from '../types';

// Locks the ABI contract so it can never silently drift from the deployed
// bytecode: each EVENT_TOPICS value must equal the Interface-derived topicHash,
// and every documented read/write function must exist on the Interface.

const iface = new ethers.Interface(YOUFEN_RECORDS_ABI as unknown as string[]);

const WRITE_FUNCTIONS = [
  'recordMint',
  'recordReversal',
  'recordEpochSummary',
  'recordPolicyVersion',
  'recordProposalSnapshot',
  'recordProposalResult',
] as const;

const READ_FUNCTIONS = ['getBalance', 'getTotalSupply', 'getRecord'] as const;

const RECORD_EVENTS = [
  'TokensMinted',
  'TokensReversed',
  'EpochRecorded',
  'PolicyVersionRecorded',
  'ProposalSnapshotRecorded',
  'ProposalResultRecorded',
] as const;

describe('youfen-records ABI', () => {
  it('exposes all six write functions on the Interface', () => {
    for (const name of WRITE_FUNCTIONS) {
      expect(iface.getFunction(name), name).to.not.equal(null);
    }
  });

  it('exposes all three read functions on the Interface', () => {
    for (const name of READ_FUNCTIONS) {
      expect(iface.getFunction(name), name).to.not.equal(null);
    }
  });

  it('exposes setRecorder and constructor', () => {
    expect(iface.getFunction('setRecorder')).to.not.equal(null);
    expect(iface.deploy.inputs.length).to.equal(1);
  });

  it('matches every EVENT_TOPICS entry to its Interface topicHash', () => {
    for (const name of RECORD_EVENTS) {
      const event = iface.getEvent(name);
      expect(event, name).to.not.equal(null);
      expect(EVENT_TOPICS[name], name).to.equal(event!.topicHash);
    }
  });

  it('lists exactly the six record events in EVENT_TOPICS', () => {
    expect(Object.keys(EVENT_TOPICS).sort()).to.deep.equal(
      [...RECORD_EVENTS].sort(),
    );
  });

  it('emits recordHash as the last indexed param (topics[3]) on every record event', () => {
    for (const name of RECORD_EVENTS) {
      const event = iface.getEvent(name)!;
      const indexed = event.inputs.filter((i) => i.indexed);
      expect(indexed.length, `${name} indexed count`).to.equal(3);
      const last = indexed[indexed.length - 1];
      expect(last.name, `${name} last indexed`).to.equal('recordHash');
      expect(last.type).to.equal('bytes32');
    }
    expect(RECORD_HASH_TOPIC_INDEX).to.equal(3);
  });

  it('maps every RecordType to a contract method, with mint types sharing recordMint', () => {
    const allTypes: RecordType[] = [
      'token_mint',
      'advance_mint',
      'token_reversal',
      'epoch_summary',
      'policy_version',
      'proposal_snapshot',
      'proposal_result',
    ];
    for (const t of allTypes) {
      const method = CONTRACT_METHOD_BY_RECORD_TYPE[t];
      expect(iface.getFunction(method), `${t} -> ${method}`).to.not.equal(null);
    }
    expect(CONTRACT_METHOD_BY_RECORD_TYPE.token_mint).to.equal('recordMint');
    expect(CONTRACT_METHOD_BY_RECORD_TYPE.advance_mint).to.equal('recordMint');
    expect(CONTRACT_METHOD_BY_RECORD_TYPE.token_reversal).to.equal('recordReversal');
    expect(CONTRACT_METHOD_BY_RECORD_TYPE.proposal_result).to.equal(
      'recordProposalResult',
    );
  });

  it('freezes the exact set of contract error strings', () => {
    expect(CONTRACT_ERRORS).to.deep.equal({
      NOT_RECORDER: 'NOT_RECORDER',
      RECORD_EXISTS: 'RECORD_EXISTS',
      ORIGINAL_NOT_FOUND: 'ORIGINAL_NOT_FOUND',
      NOT_OWNER: 'NOT_OWNER',
      ZERO_ADDRESS: 'ZERO_ADDRESS',
    });
  });
});
