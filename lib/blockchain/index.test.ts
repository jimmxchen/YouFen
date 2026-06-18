import { describe, expect, it } from 'vitest';

import { TerminalError, RecordNotFoundError } from './errors';
import { buildEnvelopeForSource } from './payloads';
import { makeBuildSubmittable } from './index';
import type {
  Hex32,
  PublicRecordDTO,
  PublicRecordWithSource,
  RecordSource,
  TokenMintEventData,
} from './types';

const PEPPER = 'test-pepper';

const mintEvent: TokenMintEventData = {
  id: 'mint-1',
  communityId: 'community-1',
  memberId: 'member-1',
  epochNumber: 3,
  mintType: 'regular',
  budgetSource: 'current_epoch',
  amount: 1000n,
  memberBalanceBefore: 0n,
  memberBalanceAfter: 1000n,
  totalSupplyBefore: 5000n,
  totalSupplyAfter: 6000n,
  governanceActivationEpoch: null,
  tokenPolicyVersion: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const source: RecordSource = { kind: 'token_mint', mintEvent };

// The hash the current source row actually rebuilds to.
const rebuiltHash = buildEnvelopeForSource(source, PEPPER).recordHash;

// A different, well-formed bytes32 standing in for a drifted / stale stored hash.
const staleHash =
  '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex32;

function makeRecord(storedHash: Hex32): PublicRecordDTO {
  return {
    id: 'record-1',
    communityId: 'community-1',
    sourceTable: 'TokenMintEvent',
    sourceId: 'mint-1',
    recordType: 'token_mint',
    status: 'pending',
    envelopeJson: '{}',
    recordHash: storedHash,
    txHash: null,
    assignedNonce: null,
    blockNumber: null,
    blockHash: null,
    submittedAt: null,
    confirmedAt: null,
    attemptEpoch: 0,
    lastError: null,
    supersededByRecordId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function recordsWith(loaded: PublicRecordWithSource | null) {
  return {
    getWithSource: async (_recordId: string) => loaded,
  };
}

describe('makeBuildSubmittable', () => {
  it('returns a SubmittableRecord when the stored hash matches the rebuilt hash', async () => {
    const loaded: PublicRecordWithSource = { record: makeRecord(rebuiltHash), source };
    const build = makeBuildSubmittable(recordsWith(loaded), PEPPER);

    const result = await build('record-1');

    expect(result.recordId).toBe('record-1');
    expect(result.recordType).toBe('token_mint');
    expect(result.recordHash).toBe(rebuiltHash);
  });

  it('throws RecordNotFoundError when the record does not exist', async () => {
    const build = makeBuildSubmittable(recordsWith(null), PEPPER);
    await expect(build('missing')).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it('throws TerminalError when the source has drifted from the stored hash', async () => {
    const loaded: PublicRecordWithSource = { record: makeRecord(staleHash), source };
    const build = makeBuildSubmittable(recordsWith(loaded), PEPPER);

    await expect(build('record-1')).rejects.toBeInstanceOf(TerminalError);
    await expect(build('record-1')).rejects.toThrow('RECORD_HASH_MISMATCH');
  });
});
