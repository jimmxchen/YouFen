import { PrismaClient } from '@prisma/client';
import { id } from 'ethers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { governanceInterface, type RawLog } from './event-decoder';
import { syncOnce, type LogProvider } from './indexer-service';
import { getCursor } from './sync-checkpoint';

// Integration test — needs a live Postgres with the v0.7 migrations applied.
// Skipped by default (CI has no DB); run with:  RUN_DB_TESTS=1 npx vitest run <file>
const RUN = process.env.RUN_DB_TESTS === '1';

const iface = governanceInterface();
const CID = id('itest:community');
const MEMBER = id('itest:alice');
const ZERO = '0x' + '00'.repeat(32);
const ADDR = '0x4309ba5d47fbc45d980988b0d5b0202b8ac7db33';

function mintLog(n: number, block: number, seq: bigint, regular: bigint, balanceAfter: bigint, supplyAfter: bigint): RawLog {
  const { data, topics } = iface.encodeEventLog('MintExecuted', [
    CID, MEMBER, id('rec:' + n), id('con:' + n), 1, 1,
    regular, 0n, 2, balanceAfter, supplyAfter, seq, ZERO, 1, id('evi'),
  ]);
  return { topics, data, blockNumber: block, logIndex: 0, transactionHash: id('tx:' + n) };
}

function provider(logs: RawLog[], head: number): LogProvider {
  return {
    getBlockNumber: async () => head,
    getLogs: async ({ fromBlock, toBlock }) => logs.filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock),
  };
}

const prisma = new PrismaClient();

async function wipe() {
  await prisma.chainEvent.deleteMany({ where: { communityId: CID } });
  await prisma.memberChainBalance.deleteMany({ where: { communityId: CID } });
  await prisma.communityTokenState.deleteMany({ where: { communityId: CID } });
  await prisma.memberEpochMintCounter.deleteMany({ where: { communityId: CID } });
  await prisma.syncCheckpoint.deleteMany({ where: { communityId: CID } });
}

describe.skipIf(!RUN)('indexer sync (integration)', () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });
  beforeEach(wipe);
  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('folds MintExecuted into confirmed balance + supply with fresher-wins, then advances the cursor', async () => {
    // two mints for alice: 800 @ seq 1, then +200 @ seq 3 (absolute post-state carried in the event)
    const logs = [
      mintLog(1, 5, 1n, 800n, 800n, 100800n),
      mintLog(2, 6, 3n, 200n, 1000n, 101000n),
    ];
    const r = await syncOnce({ prisma, provider: provider(logs, 6), contractAddress: ADDR, communityId: CID, fromBlockFloor: 1 });
    expect(r.applied).to.equal(2);
    expect(r.caughtUp).to.equal(true);

    const bal = await prisma.memberChainBalance.findUnique({ where: { communityId_memberIdHash: { communityId: CID, memberIdHash: MEMBER } } });
    expect(bal?.balance.toString()).to.equal('1000');
    expect(bal?.ledgerSeq).to.equal(3n);

    const state = await prisma.communityTokenState.findUnique({ where: { communityId: CID } });
    expect(state?.currentTotalSupply).to.equal(101000n);

    const counter = await prisma.memberEpochMintCounter.findUnique({ where: { communityId_memberIdHash_epochNumber: { communityId: CID, memberIdHash: MEMBER, epochNumber: 1 } } });
    expect(counter?.regularMinted.toString()).to.equal('1000'); // 800 + 200

    const cursor = await getCursor(prisma, CID);
    expect(cursor.lastBlock).to.equal(6);
  });

  it('is idempotent: a lower-seq event never overwrites a fresher balance, and re-sync applies nothing', async () => {
    const logs = [
      mintLog(1, 5, 3n, 800n, 1000n, 101000n), // fresher first
      mintLog(2, 6, 1n, 200n, 800n, 100800n), // stale — must NOT overwrite
    ];
    await syncOnce({ prisma, provider: provider(logs, 6), contractAddress: ADDR, communityId: CID, fromBlockFloor: 1 });
    const bal = await prisma.memberChainBalance.findUnique({ where: { communityId_memberIdHash: { communityId: CID, memberIdHash: MEMBER } } });
    expect(bal?.balance.toString()).to.equal('1000'); // fresher-wins held
    expect(bal?.ledgerSeq).to.equal(3n);

    // reset the cursor and replay the SAME logs — appliedAt guard makes it a no-op
    await prisma.syncCheckpoint.deleteMany({ where: { communityId: CID } });
    const again = await syncOnce({ prisma, provider: provider(logs, 6), contractAddress: ADDR, communityId: CID, fromBlockFloor: 1 });
    expect(again.applied).to.equal(0);
    expect(again.skipped).to.equal(2);
    const bal2 = await prisma.memberChainBalance.findUnique({ where: { communityId_memberIdHash: { communityId: CID, memberIdHash: MEMBER } } });
    expect(bal2?.balance.toString()).to.equal('1000'); // unchanged
  });
});
