// Forward getLogs cursor per community (docs/BLOCKCHAIN-DESIGN-v0.7.md §5). The
// indexer scans whole blocks [fromBlock, toBlock] and advances `lastBlock` to
// toBlock; the next tick starts at lastBlock + 1. No overlap is needed because
// the projection's (txHash, logIndex) idempotency guard makes any accidental
// re-scan a no-op.

import type { Prisma, PrismaClient } from '@prisma/client';

export interface Cursor {
  readonly lastBlock: number;
  readonly lastLogIndex: number;
}

export async function getCursor(prisma: PrismaClient, communityId: string): Promise<Cursor> {
  const cp = await prisma.syncCheckpoint.findUnique({ where: { communityId } });
  return cp === null
    ? { lastBlock: 0, lastLogIndex: 0 }
    : { lastBlock: cp.lastBlock, lastLogIndex: cp.lastLogIndex };
}

export async function advanceCursor(
  tx: Prisma.TransactionClient,
  communityId: string,
  lastBlock: number,
  lastLogIndex: number,
): Promise<void> {
  await tx.syncCheckpoint.upsert({
    where: { communityId },
    create: { communityId, lastBlock, lastLogIndex },
    update: { lastBlock, lastLogIndex },
  });
}
