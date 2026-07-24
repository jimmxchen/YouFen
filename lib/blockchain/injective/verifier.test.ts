import { describe, it, expect, vi } from 'vitest';

import { ChainUnavailableError, RecordNotFoundError } from '../errors';
import type {
  BuiltRecord,
  Hex32,
  PublicRecordDTO,
  PublicRecordWithSource,
  RecordSource,
} from '../types';

import { createRecordVerifier } from './verifier';

const STORED_HASH = ('0x' + 'ab'.repeat(32)) as Hex32;
const OTHER_HASH = ('0x' + 'cd'.repeat(32)) as Hex32;
const TX_HASH = '0x' + 'ef'.repeat(32);
const EXPLORER = 'https://testnet-injective.cloud.blockscout.com';
const PEPPER = 'test-pepper-000000';

const SOURCE: RecordSource = {
  kind: 'epoch_summary',
  epoch: {
    id: 'ep_1',
    communityId: 'c_1',
    epochNumber: 1,
    openingSupply: 0n,
    baseMintBudget: 0n,
    regularMintedAmount: 0n,
    advancedMintedAmount: 0n,
    advanceDebtFromPreviousEpoch: 0n,
    closedAt: null,
    createdAt: new Date(0),
  },
};

function dto(overrides: Partial<PublicRecordDTO> = {}): PublicRecordDTO {
  return {
    id: 'pr_1',
    communityId: 'c_1',
    sourceTable: 'token_epochs',
    sourceId: 'ep_1',
    recordType: 'epoch_summary',
    status: 'verified',
    envelopeJson: '{}',
    recordHash: STORED_HASH,
    txHash: TX_HASH,
    assignedNonce: 1,
    blockNumber: 123,
    blockHash: '0x' + '00'.repeat(32),
    submittedAt: new Date(0),
    confirmedAt: new Date(0),
    attemptEpoch: 1,
    lastError: null,
    supersededByRecordId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function withSource(record: PublicRecordDTO): PublicRecordWithSource {
  return { record, source: SOURCE };
}

function built(recordHash: Hex32): BuiltRecord {
  return {
    recordType: 'epoch_summary',
    envelope: { schema: 'youfen.record.v1', type: 'epoch_summary', payload: {} },
    canonicalJson: '{}',
    recordHash,
    chainArgs: [],
  };
}

function chainRecord(exists: boolean) {
  return { exists, recordType: 3n, blockNumber: 123n, timestamp: 1700000000n };
}

describe('verifyRecord', () => {
  it('reports verified when hash matches and the record is on chain', async () => {
    const read = { getRecord: vi.fn(async () => chainRecord(true)) };
    const confirmer = { findTxByRecordHash: vi.fn() };
    const verifier = createRecordVerifier({
      read,
      confirmer,
      loadRecordWithSource: async () => withSource(dto()),
      buildEnvelope: () => built(STORED_HASH),
      pepper: PEPPER,
      explorerBaseUrl: EXPLORER,
    });

    const result = await verifier.verifyRecord('pr_1');

    expect(result.verified).toBe(true);
    expect(result.hashMatches).toBe(true);
    expect(result.onChain).toBe(true);
    expect(result.computedHash).toBe(STORED_HASH);
    expect(result.storedHash).toBe(STORED_HASH);
    expect(result.txHash).toBe(TX_HASH);
    expect(result.explorerUrl).toBe(`${EXPLORER}/tx/${TX_HASH}`);
    expect(result.failureReason).toBeUndefined();
    expect(confirmer.findTxByRecordHash).not.toHaveBeenCalled();
  });

  it('flags SOURCE_DATA_MISMATCH when the rebuilt hash differs', async () => {
    const verifier = createRecordVerifier({
      read: { getRecord: vi.fn(async () => chainRecord(true)) },
      confirmer: { findTxByRecordHash: vi.fn() },
      loadRecordWithSource: async () => withSource(dto()),
      buildEnvelope: () => built(OTHER_HASH),
      pepper: PEPPER,
      explorerBaseUrl: EXPLORER,
    });

    const result = await verifier.verifyRecord('pr_1');

    expect(result.hashMatches).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.failureReason).toBe('SOURCE_DATA_MISMATCH');
    expect(result.computedHash).toBe(OTHER_HASH);
  });

  it('flags NOT_ON_CHAIN when the contract has no record', async () => {
    const verifier = createRecordVerifier({
      read: { getRecord: vi.fn(async () => chainRecord(false)) },
      confirmer: { findTxByRecordHash: vi.fn() },
      loadRecordWithSource: async () => withSource(dto({ txHash: null })),
      buildEnvelope: () => built(STORED_HASH),
      pepper: PEPPER,
      explorerBaseUrl: EXPLORER,
    });

    const result = await verifier.verifyRecord('pr_1');

    expect(result.hashMatches).toBe(true);
    expect(result.onChain).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.failureReason).toBe('NOT_ON_CHAIN');
  });

  it('backfills txHash via findTxByRecordHash when the DB row lacks it', async () => {
    const confirmer = {
      findTxByRecordHash: vi.fn(async () => ({ txHash: TX_HASH, blockNumber: 456 })),
    };
    const verifier = createRecordVerifier({
      read: { getRecord: vi.fn(async () => chainRecord(true)) },
      confirmer,
      loadRecordWithSource: async () => withSource(dto({ txHash: null, blockNumber: null })),
      buildEnvelope: () => built(STORED_HASH),
      pepper: PEPPER,
      explorerBaseUrl: EXPLORER,
    });

    const result = await verifier.verifyRecord('pr_1');

    expect(confirmer.findTxByRecordHash).toHaveBeenCalledWith(STORED_HASH);
    expect(result.txHash).toBe(TX_HASH);
    expect(result.blockNumber).toBe(456);
    expect(result.explorerUrl).toBe(`${EXPLORER}/tx/${TX_HASH}`);
    expect(result.verified).toBe(true);
  });

  it('throws ChainUnavailableError when the RPC read fails (never falsely verifies)', async () => {
    const verifier = createRecordVerifier({
      read: {
        getRecord: vi.fn(async () => {
          throw new Error('fetch failed');
        }),
      },
      confirmer: { findTxByRecordHash: vi.fn() },
      loadRecordWithSource: async () => withSource(dto()),
      buildEnvelope: () => built(STORED_HASH),
      pepper: PEPPER,
      explorerBaseUrl: EXPLORER,
    });

    await expect(verifier.verifyRecord('pr_1')).rejects.toBeInstanceOf(ChainUnavailableError);
  });

  it('throws RecordNotFoundError when the record cannot be loaded', async () => {
    const verifier = createRecordVerifier({
      read: { getRecord: vi.fn() },
      confirmer: { findTxByRecordHash: vi.fn() },
      loadRecordWithSource: async () => null,
      buildEnvelope: () => built(STORED_HASH),
      pepper: PEPPER,
      explorerBaseUrl: EXPLORER,
    });

    await expect(verifier.verifyRecord('missing')).rejects.toBeInstanceOf(RecordNotFoundError);
  });
});

describe('readChainRecord', () => {
  it('normalises the raw contract tuple into ChainRecordMeta', async () => {
    const verifier = createRecordVerifier({
      read: { getRecord: vi.fn(async () => chainRecord(true)) },
      confirmer: { findTxByRecordHash: vi.fn() },
      loadRecordWithSource: async () => null,
      buildEnvelope: () => built(STORED_HASH),
      pepper: PEPPER,
      explorerBaseUrl: EXPLORER,
    });

    const meta = await verifier.readChainRecord(STORED_HASH);

    expect(meta.exists).toBe(true);
    expect(meta.recordType).toBe(3);
    expect(meta.blockNumber).toBe(123);
    expect(meta.timestamp).toBe(1700000000);
  });

  it('returns a bare exists=false meta when the record is absent', async () => {
    const verifier = createRecordVerifier({
      read: { getRecord: vi.fn(async () => chainRecord(false)) },
      confirmer: { findTxByRecordHash: vi.fn() },
      loadRecordWithSource: async () => null,
      buildEnvelope: () => built(STORED_HASH),
      pepper: PEPPER,
      explorerBaseUrl: EXPLORER,
    });

    const meta = await verifier.readChainRecord(STORED_HASH);

    expect(meta.exists).toBe(false);
    expect(meta.blockNumber).toBeUndefined();
  });
});
