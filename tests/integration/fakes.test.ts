// Self-tests for the integration fakes. A bug in a fake would turn every
// pipeline integration test green for the wrong reason, so the fakes' semantics
// (updateMany where-matching, getLogs topic filtering, queue de-duplication) are
// verified here directly.

import { describe, expect, it } from 'vitest';

import { RECORD_HASH_TOPIC_INDEX, EVENT_TOPICS } from '../../lib/blockchain/abi/youfen-records';
import type { Hex32, PublicRecordDTO, TokenMintEventData } from '../../lib/blockchain/types';

import { FakeChain, FakePrisma, InlineQueue } from './fakes';

const hash = (byte: string): Hex32 => `0x${byte.repeat(32)}` as Hex32;

function makeRecord(over: Partial<PublicRecordDTO> = {}): PublicRecordDTO {
  const base = new Date('2026-07-01T00:00:00.000Z');
  return {
    id: 'r1',
    communityId: 'c1',
    sourceTable: 'TokenMintEvent',
    sourceId: 'm1',
    recordType: 'token_mint',
    status: 'pending',
    envelopeJson: '{"schema":"youfen.record.v1"}',
    recordHash: hash('11'),
    txHash: null,
    assignedNonce: null,
    blockNumber: null,
    blockHash: null,
    submittedAt: null,
    confirmedAt: null,
    attemptEpoch: 1,
    lastError: null,
    supersededByRecordId: null,
    createdAt: base,
    updatedAt: base,
    ...over,
  };
}

function makeMint(over: Partial<TokenMintEventData> = {}): TokenMintEventData {
  return {
    id: 'm1',
    communityId: 'c1',
    memberId: 'mem1',
    epochNumber: 3,
    mintType: 'contribution',
    budgetSource: 'current_epoch',
    amount: 500n,
    memberBalanceBefore: 10_000n,
    memberBalanceAfter: 10_500n,
    totalSupplyBefore: 115_763n,
    totalSupplyAfter: 116_263n,
    governanceActivationEpoch: null,
    tokenPolicyVersion: 2,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    ...over,
  };
}

describe('FakePrisma.publicRecord.updateMany', () => {
  it('matches status.in and updates every matched row', async () => {
    const fp = new FakePrisma({
      publicRecords: [
        makeRecord({ id: 'a', recordHash: hash('a1'), status: 'submitting' }),
        makeRecord({ id: 'b', recordHash: hash('b1'), status: 'confirming' }),
        makeRecord({ id: 'c', recordHash: hash('c1'), status: 'verified' }),
      ],
    });

    const res = await fp.publicRecord.updateMany({
      where: { status: { in: ['submitting', 'confirming'] } },
      data: { status: 'pending' },
    });

    expect(res.count).toBe(2);
    expect((await fp.publicRecord.findUnique({ where: { id: 'a' } }))?.status).toBe('pending');
    expect((await fp.publicRecord.findUnique({ where: { id: 'b' } }))?.status).toBe('pending');
    expect((await fp.publicRecord.findUnique({ where: { id: 'c' } }))?.status).toBe('verified');
  });

  it('returns count 0 and leaves rows untouched when status.in does not match', async () => {
    const fp = new FakePrisma({
      publicRecords: [makeRecord({ id: 'a', status: 'verified' })],
    });

    const res = await fp.publicRecord.updateMany({
      where: { status: { in: ['submitting', 'confirming'] } },
      data: { status: 'failed', lastError: 'boom' },
    });

    expect(res.count).toBe(0);
    const row = await fp.publicRecord.findUnique({ where: { id: 'a' } });
    expect(row?.status).toBe('verified');
    expect(row?.lastError).toBeNull();
  });

  it('honours an exact status scalar match and rejects a mismatch', async () => {
    const fp = new FakePrisma({ publicRecords: [makeRecord({ id: 'a', status: 'pending' })] });

    expect(
      (await fp.publicRecord.updateMany({ where: { id: 'a', status: 'submitting' }, data: { status: 'confirming' } }))
        .count,
    ).toBe(0);
    expect(
      (await fp.publicRecord.updateMany({ where: { id: 'a', status: 'pending' }, data: { status: 'submitting' } }))
        .count,
    ).toBe(1);
    expect((await fp.publicRecord.findUnique({ where: { id: 'a' } }))?.status).toBe('submitting');
  });

  it('auto-updates updatedAt from the injected clock on every write', async () => {
    const stamp = new Date('2026-07-05T12:00:00.000Z');
    const fp = new FakePrisma({
      publicRecords: [makeRecord({ id: 'a', status: 'pending' })],
      now: () => stamp,
    });

    await fp.publicRecord.updateMany({ where: { id: 'a' }, data: { assignedNonce: 7 } });

    const row = await fp.publicRecord.findUnique({ where: { id: 'a' } });
    expect(row?.assignedNonce).toBe(7);
    expect(row?.updatedAt.toISOString()).toBe(stamp.toISOString());
  });

  it('filters on updatedAt lt', async () => {
    const old = new Date('2026-07-01T00:00:00.000Z');
    const fresh = new Date('2026-07-09T00:00:00.000Z');
    const fp = new FakePrisma({
      publicRecords: [
        makeRecord({ id: 'stale', recordHash: hash('a1'), status: 'submitting', updatedAt: old }),
        makeRecord({ id: 'recent', recordHash: hash('b1'), status: 'submitting', updatedAt: fresh }),
      ],
    });

    const res = await fp.publicRecord.updateMany({
      where: { status: { in: ['submitting'] }, updatedAt: { lt: new Date('2026-07-05T00:00:00.000Z') } },
      data: { status: 'pending' },
    });

    expect(res.count).toBe(1);
    expect((await fp.publicRecord.findUnique({ where: { id: 'stale' } }))?.status).toBe('pending');
    expect((await fp.publicRecord.findUnique({ where: { id: 'recent' } }))?.status).toBe('submitting');
  });

  it('filters on sourceTable + sourceId together', async () => {
    const fp = new FakePrisma({
      publicRecords: [
        makeRecord({ id: 'a', recordHash: hash('a1'), sourceTable: 'TokenMintEvent', sourceId: 'm1' }),
        makeRecord({ id: 'b', recordHash: hash('b1'), sourceTable: 'TokenMintEvent', sourceId: 'm2' }),
        makeRecord({ id: 'c', recordHash: hash('c1'), sourceTable: 'Proposal', sourceId: 'm1' }),
      ],
    });

    const res = await fp.publicRecord.updateMany({
      where: { sourceTable: 'TokenMintEvent', sourceId: 'm1' },
      data: { status: 'submitting' },
    });

    expect(res.count).toBe(1);
    expect((await fp.publicRecord.findUnique({ where: { id: 'a' } }))?.status).toBe('submitting');
  });

  it('supports attemptEpoch increment updates', async () => {
    const fp = new FakePrisma({ publicRecords: [makeRecord({ id: 'a', attemptEpoch: 1 })] });

    await fp.publicRecord.updateMany({ where: { id: 'a' }, data: { attemptEpoch: { increment: 1 } } });

    expect((await fp.publicRecord.findUnique({ where: { id: 'a' } }))?.attemptEpoch).toBe(2);
  });
});

describe('FakePrisma.publicRecord.create + unique constraint', () => {
  it('creates a pending row with generated id and default fields', async () => {
    const fp = new FakePrisma();

    const row = await fp.publicRecord.create({
      data: {
        communityId: 'c1',
        recordType: 'token_mint',
        envelopeJson: '{}',
        recordHash: hash('aa'),
        sourceTable: 'TokenMintEvent',
        sourceId: 'm1',
      },
    });

    expect(row.id).toBeTruthy();
    expect(row.status).toBe('pending');
    expect(row.attemptEpoch).toBe(1);
    expect(await fp.publicRecord.findUnique({ where: { recordHash: hash('aa') } })).not.toBeNull();
  });

  it('throws a P2002-shaped error on duplicate recordHash', async () => {
    const fp = new FakePrisma({ publicRecords: [makeRecord({ id: 'a', recordHash: hash('dd') })] });

    await expect(
      fp.publicRecord.create({
        data: {
          communityId: 'c1',
          recordType: 'token_mint',
          envelopeJson: '{}',
          recordHash: hash('dd'),
          sourceTable: 'TokenMintEvent',
          sourceId: 'm9',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('FakePrisma source tables + $transaction', () => {
  it('returns source rows preserving bigint fields', async () => {
    const fp = new FakePrisma({ tokenMintEvents: [makeMint({ id: 'm1', amount: 500n })] });

    const row = await fp.tokenMintEvent.findUnique({ where: { id: 'm1' } });
    expect(row?.amount).toBe(500n);
    expect(typeof row?.amount).toBe('bigint');
    expect(await fp.tokenMintEvent.findUnique({ where: { id: 'missing' } })).toBeNull();
  });

  it('runs $transaction as a pass-through against the same store', async () => {
    const fp = new FakePrisma({ publicRecords: [makeRecord({ id: 'a', status: 'pending' })] });

    const out = await fp.$transaction(async (tx) => {
      await tx.publicRecord.updateMany({ where: { id: 'a' }, data: { status: 'submitting' } });
      return 'done';
    });

    expect(out).toBe('done');
    expect((await fp.publicRecord.findUnique({ where: { id: 'a' } }))?.status).toBe('submitting');
  });
});

describe('FakeChain write + read faces', () => {
  const rh = hash('ab');
  const cid = hash('c0');
  const mid = hash('d0');
  const chainArgs = [cid, mid, 500n, 10_500n, 116_263n, 0, 0, rh] as const;

  it('records a submission so getRecord.exists is true and block advances', async () => {
    const chain = new FakeChain();
    const before = await chain.getBlockNumber();

    const out = chain.recordSubmitted(chainArgs, 'token_mint');

    expect(out.status).toBe(1);
    expect(out.blockNumber).toBe(before + 1);
    const meta = await chain.getRecord(rh);
    expect(meta.exists).toBe(true);
    expect(meta.recordType).toBe(0);
    expect((await chain.getBlockNumber())).toBe(before + 1);
    expect((await chain.getTransactionReceipt(out.txHash))?.status).toBe(1);
    expect((await chain.getTransaction(out.txHash))?.blockNumber).toBe(out.blockNumber);
  });

  it('returns exists:false for an unknown recordHash', async () => {
    const chain = new FakeChain();
    expect((await chain.getRecord(hash('ff'))).exists).toBe(false);
  });

  it('filters getLogs by the recordHash topic and by block range', async () => {
    const chain = new FakeChain({ startBlock: 100 });
    const other = hash('cd');
    const a = chain.recordSubmitted([cid, mid, 1n, 2n, 3n, 0, 0, rh] as const, 'token_mint');
    chain.recordSubmitted([cid, mid, 1n, 2n, 3n, 0, 0, other] as const, 'token_mint');

    const topics = [null, null, null, rh] as const;
    const byHash = await chain.getLogs({ topics });
    expect(byHash).toHaveLength(1);
    expect(byHash[0].topics[RECORD_HASH_TOPIC_INDEX]).toBe(rh);
    expect(byHash[0].topics[0]).toBe(EVENT_TOPICS.TokensMinted);
    expect(byHash[0].transactionHash).toBe(a.txHash);

    const outOfRange = await chain.getLogs({ topics, fromBlock: a.blockNumber + 5 });
    expect(outOfRange).toHaveLength(0);
  });

  it('filters getLogs by contract address', async () => {
    const chain = new FakeChain({ address: '0x00000000000000000000000000000000000000ab' });
    chain.recordSubmitted(chainArgs, 'token_mint');

    expect(await chain.getLogs({ address: '0x00000000000000000000000000000000000000AB' })).toHaveLength(1);
    expect(await chain.getLogs({ address: '0x00000000000000000000000000000000000000cd' })).toHaveLength(0);
  });

  it('honours a preset existing record for RECORD_EXISTS recovery', async () => {
    const chain = new FakeChain();
    chain.presetRecord(rh, 'token_mint', { blockNumber: 42, timestamp: 1_700_000_000 });

    const meta = await chain.getRecord(rh);
    expect(meta.exists).toBe(true);
    expect(meta.blockNumber).toBe(42);
    expect(meta.timestamp).toBe(1_700_000_000);
  });

  it('throws an ethers-style revert when the next broadcast is set to fail', async () => {
    const chain = new FakeChain();
    chain.failNextBroadcast();

    expect(() => chain.recordSubmitted(chainArgs, 'token_mint')).toThrow();
    try {
      chain.failNextBroadcast();
      chain.recordSubmitted(chainArgs, 'token_mint');
      throw new Error('expected throw');
    } catch (e) {
      expect((e as { reason?: string }).reason).toBe('RECORD_EXISTS');
      expect((e as { shortMessage?: string }).shortMessage).toContain('RECORD_EXISTS');
    }
    // The failed broadcast wrote nothing on chain.
    expect((await chain.getRecord(rh)).exists).toBe(false);
  });

  it('produces a status-0 receipt for a reverted broadcast without recording state', async () => {
    const chain = new FakeChain();
    chain.revertNextReceipt();

    const out = chain.recordSubmitted(chainArgs, 'token_mint');
    expect(out.status).toBe(0);
    expect((await chain.getTransactionReceipt(out.txHash))?.status).toBe(0);
    expect((await chain.getRecord(rh)).exists).toBe(false);
    expect(await chain.getLogs({ topics: [null, null, null, rh] as const })).toHaveLength(0);
  });
});

describe('InlineQueue', () => {
  it('records jobs and returns them via getJob', async () => {
    const q = new InlineQueue();
    const job = await q.add('submit', { recordId: 'r1' }, { jobId: 'submit:r1:v1' });

    expect(job.id).toBe('submit:r1:v1');
    expect((await q.getJob('submit:r1:v1'))?.data).toEqual({ recordId: 'r1' });
    expect(await q.getJob('nope')).toBeUndefined();
  });

  it('de-duplicates adds sharing the same jobId', async () => {
    const q = new InlineQueue();
    const first = await q.add('submit', { recordId: 'r1' }, { jobId: 'submit:r1:v1' });
    const second = await q.add('submit', { recordId: 'r1-dup' }, { jobId: 'submit:r1:v1' });

    expect(second).toBe(first);
    expect(second.data).toEqual({ recordId: 'r1' });
  });

  it('flushes registered jobs in insertion order', async () => {
    const q = new InlineQueue();
    const seen: string[] = [];
    q.process(async (job) => {
      seen.push(job.id);
      return job.id;
    });
    await q.add('submit', {}, { jobId: 'j1' });
    await q.add('submit', {}, { jobId: 'j2' });
    await q.add('submit', {}, { jobId: 'j3' });

    const results = await q.flush();
    expect(seen).toEqual(['j1', 'j2', 'j3']);
    expect(results.map((r) => r.result)).toEqual(['j1', 'j2', 'j3']);
  });

  it('clears recorded jobs to simulate a Redis flush', async () => {
    const q = new InlineQueue();
    await q.add('submit', {}, { jobId: 'j1' });
    q.clear();

    expect(await q.getJob('j1')).toBeUndefined();
    q.process(async () => 'x');
    expect(await q.flush()).toHaveLength(0);
  });
});
