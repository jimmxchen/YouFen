import { PrismaClient } from '@prisma/client';
import { id } from 'ethers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { addSignature, createSignatureRequest } from '../signatures/signature-request-service';

import { createChainAction, transitionAction } from './chain-action-service';
import { confirmPending, submitReady, type TxSender } from './submitter';

// Integration — needs a live Postgres with the v0.7 migrations applied.
// Skipped by default; run with:  RUN_DB_TESTS=1 npx vitest run <file>
const RUN = process.env.RUN_DB_TESTS === '1';

const prisma = new PrismaClient();
const CID = 'wtest-community';
const ZERO32 = '0x' + '00'.repeat(32);
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';

async function wipe() {
  await prisma.chainTransaction.deleteMany({ where: { action: { communityId: CID } } });
  await prisma.chainAction.deleteMany({ where: { communityId: CID } });
  await prisma.signature.deleteMany({ where: { request: { communityId: CID } } });
  await prisma.signatureRequest.deleteMany({ where: { communityId: CID } });
}

function sender(receipt: { status: number; blockNumber: number } | null): TxSender {
  let n = 0;
  return {
    async send() {
      n += 1;
      return { txHash: id('faketx:' + n), nonce: n };
    },
    async getReceipt() {
      return receipt;
    },
  };
}

function mintCall(recordHash: string) {
  const tuple = [id('c'), id('m'), id('con'), 1, 1, '800', '0', false, ZERO32, id('e'), recordHash, '7', '9999999999'];
  return { fn: 'executeMint', args: [tuple, ['0x' + '11'.repeat(65)]] };
}

describe.skipIf(!RUN)('v0.7 write path (integration)', () => {
  beforeEach(wipe);
  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('collects signatures to threshold and flips the request to ready', async () => {
    const { id: reqId, created } = await createSignatureRequest(prisma, {
      communityId: CID,
      kind: 'execute_mint',
      requiredRole: 'approver',
      requiredCount: 2,
      typedData: { hello: 'world' },
      digest: id('digest:1'),
      recordHash: id('rec:1'),
      nonce: '7',
      deadline: 9_999_999_999n,
    });
    expect(created).to.equal(true);

    // idempotent on digest
    const again = await createSignatureRequest(prisma, {
      communityId: CID, kind: 'execute_mint', requiredRole: 'approver', requiredCount: 2,
      typedData: {}, digest: id('digest:1'), nonce: '7', deadline: 9_999_999_999n,
    });
    expect(again.created).to.equal(false);
    expect(again.id).to.equal(reqId);

    const r1 = await addSignature(prisma, reqId, A, '0xaa', 'approver');
    expect(r1.ready).to.equal(false);
    expect(r1.distinctCount).to.equal(1);

    // same signer deduped
    const dup = await addSignature(prisma, reqId, A, '0xaa', 'approver');
    expect(dup.added).to.equal(false);
    expect(dup.distinctCount).to.equal(1);

    const r2 = await addSignature(prisma, reqId, B, '0xbb', 'approver');
    expect(r2.ready).to.equal(true);
    expect(r2.distinctCount).to.equal(2);

    const req = await prisma.signatureRequest.findUnique({ where: { id: reqId } });
    expect(req?.status).to.equal('ready');
  });

  it('creates a ChainAction idempotently and enforces legal transitions', async () => {
    const rec = id('rec:2');
    const c1 = await createChainAction(prisma, {
      communityId: CID, kind: 'execute_mint', callData: mintCall(rec), recordHash: rec, initialStatus: 'ready_to_submit',
    });
    expect(c1.created).to.equal(true);
    const c2 = await createChainAction(prisma, {
      communityId: CID, kind: 'execute_mint', callData: mintCall(rec), recordHash: rec, initialStatus: 'ready_to_submit',
    });
    expect(c2.created).to.equal(false);
    expect(c2.id).to.equal(c1.id);

    // illegal transition throws before touching the DB
    await expect(transitionAction(prisma, c1.id, 'awaiting_signatures', 'verified')).rejects.toThrow();
    // legal transition moves exactly one row
    expect(await transitionAction(prisma, c1.id, 'ready_to_submit', 'submitting')).to.equal(true);
    // a stale from-state is an idempotent no-op
    expect(await transitionAction(prisma, c1.id, 'ready_to_submit', 'submitting')).to.equal(false);
  });

  it('submitReady broadcasts a ready action and records the tx', async () => {
    const rec = id('rec:3');
    await createChainAction(prisma, {
      communityId: CID, kind: 'execute_mint', callData: mintCall(rec), recordHash: rec, initialStatus: 'ready_to_submit',
    });
    const summary = await submitReady({ prisma, sender: sender(null) });
    expect(summary.submitted).to.equal(1);

    const action = await prisma.chainAction.findUnique({ where: { recordHash: rec }, include: { transactions: true } });
    expect(action?.status).to.equal('submitted');
    expect(action?.transactions.length).to.equal(1);
    expect(action?.transactions[0].assignedNonce).to.be.a('number');
  });

  it('confirmPending marks a mined success as confirming (indexer finalizes verified)', async () => {
    const rec = id('rec:4');
    await createChainAction(prisma, { communityId: CID, kind: 'execute_mint', callData: mintCall(rec), recordHash: rec, initialStatus: 'ready_to_submit' });
    await submitReady({ prisma, sender: sender(null) });
    const summary = await confirmPending({ prisma, sender: sender({ status: 1, blockNumber: 100 }) });
    expect(summary.confirmedOnChain).to.equal(1);
    const action = await prisma.chainAction.findUnique({ where: { recordHash: rec } });
    expect(action?.status).to.equal('confirming');
  });

  it('confirmPending marks a reverted tx as reverted (no event will arrive)', async () => {
    const rec = id('rec:5');
    await createChainAction(prisma, { communityId: CID, kind: 'execute_mint', callData: mintCall(rec), recordHash: rec, initialStatus: 'ready_to_submit' });
    await submitReady({ prisma, sender: sender(null) });
    const summary = await confirmPending({ prisma, sender: sender({ status: 0, blockNumber: 101 }) });
    expect(summary.reverted).to.equal(1);
    const action = await prisma.chainAction.findUnique({ where: { recordHash: rec } });
    expect(action?.status).to.equal('reverted');
    expect(action?.lastError).to.equal('TX_REVERTED');
  });
});
