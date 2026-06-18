// Indexer sync (docs/BLOCKCHAIN-DESIGN-v0.7.md §5/§6 Phase-A deployment). Driven
// by a Vercel Cron tick (pull-based, no persistent worker): read the cursor,
// getLogs a BOUNDED block window (Vercel function time limit), decode, fold each
// event into the projections in its own transaction, advance the cursor. Fully
// idempotent — a repeated tick re-applies nothing (projection appliedAt guard).

import type { PrismaClient } from '@prisma/client';

import { decodeGovernanceLogs, type RawLog } from './event-decoder';
import { applyEvent } from './projection';
import { advanceCursor, getCursor } from './sync-checkpoint';

/** The minimal provider surface the indexer needs (decouples from ethers). */
export interface LogProvider {
  getBlockNumber(): Promise<number>;
  getLogs(filter: { address: string; fromBlock: number; toBlock: number }): Promise<RawLog[]>;
}

export interface SyncDeps {
  readonly prisma: PrismaClient;
  readonly provider: LogProvider;
  readonly contractAddress: string;
  readonly communityId: string;
  /** deploy block — where a cold cursor starts. */
  readonly fromBlockFloor?: number;
  /** max blocks per tick; keep small enough to finish inside a serverless invocation. */
  readonly maxBlockRange?: number;
}

export interface SyncResult {
  readonly fromBlock: number;
  readonly toBlock: number;
  readonly scanned: number;
  readonly applied: number;
  readonly skipped: number;
  readonly headBlock: number;
  readonly caughtUp: boolean;
}

export async function syncOnce(deps: SyncDeps): Promise<SyncResult> {
  const { prisma, provider, contractAddress, communityId } = deps;
  const range = deps.maxBlockRange ?? 2_000;
  const floor = deps.fromBlockFloor ?? 0;

  const cursor = await getCursor(prisma, communityId);
  const head = await provider.getBlockNumber();
  const fromBlock = cursor.lastBlock === 0 ? floor : cursor.lastBlock + 1;
  const toBlock = Math.min(head, fromBlock + range - 1);

  if (toBlock < fromBlock) {
    return { fromBlock, toBlock, scanned: 0, applied: 0, skipped: 0, headBlock: head, caughtUp: true };
  }

  const raw = await provider.getLogs({ address: contractAddress, fromBlock, toBlock });
  const decoded = decodeGovernanceLogs(raw);

  let applied = 0;
  let skipped = 0;
  for (const ev of decoded) {
    const outcome = await prisma.$transaction((txc) => applyEvent(txc, ev));
    if (outcome === 'applied') applied += 1;
    else skipped += 1;
  }

  await prisma.$transaction((txc) => advanceCursor(txc, communityId, toBlock, 0));

  return {
    fromBlock,
    toBlock,
    scanned: decoded.length,
    applied,
    skipped,
    headBlock: head,
    caughtUp: toBlock >= head,
  };
}
