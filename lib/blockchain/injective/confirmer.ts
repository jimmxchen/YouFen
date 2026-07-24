// TxConfirmer (BLOCKCHAIN-DESIGN §6). Poll-based confirmation over an injected
// provider surface. findTxByRecordHash walks the log history in bounded segments
// (red-team fix): a single unbounded getLogs would eventually exceed public-RPC
// block-range limits, so we page it. The walk runs newest -> oldest because a
// record event almost always lands in the most recent blocks, so the first
// segment usually resolves the lookup in a single getLogs call instead of
// re-scanning all history from an unconfigured genesis (efficiency fix). An
// explicit positive deploy block is required — scanning from block 0 across a
// multi-million-block chain is refused up front. recordHash is always topics[3]
// on every record event — a hard ABI contract.

import { RetryableError, TerminalError } from '../errors';
import type { ConfirmResult, Hex32, TxConfirmer } from '../types';

interface ConfirmerProvider {
  getTransactionReceipt(
    txHash: string,
  ): Promise<{ status: number | null; blockNumber: number; blockHash: string } | null>;
  getTransaction(txHash: string): Promise<{ hash: string } | null>;
  getLogs(filter: {
    address: string;
    fromBlock: number;
    toBlock: number;
    topics: readonly (string | null)[];
  }): Promise<readonly { transactionHash: string; blockNumber: number }[]>;
  getBlockNumber(): Promise<number>;
}

export interface CreateTxConfirmerDeps {
  readonly provider: ConfirmerProvider;
  readonly contractAddress: string;
  readonly deployBlock: number;
  readonly confirmations: number;
  readonly pollIntervalMs?: number;
  readonly maxRangePerQuery?: number;
  /**
   * Additive-only (W2-B). Contract existence probe used by the null-receipt fast
   * path: a load-balanced RPC whose getTransactionReceipt index lags behind
   * getLogs can return null forever even though the tx mined. When wired, after
   * `nullReceiptFastPathThreshold` consecutive null receipts the confirmer asks
   * the contract whether the record already landed and, if so, treats the
   * contract state as final (Injective has instant finality). Omitted -> the
   * fast path is inert and confirmation behaves exactly as before.
   */
  readonly readRecord?: (recordHash: Hex32) => Promise<{ exists: boolean }>;
  /** Consecutive null receipts before the fast path consults the contract (default 5). */
  readonly nullReceiptFastPathThreshold?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_RANGE_PER_QUERY = 9000;
const DEFAULT_NULL_RECEIPT_FAST_PATH_THRESHOLD = 5;
const RECORD_HASH_TOPIC_INDEX = 3;
// blockHash is unobtainable from a getLogs backfill; the mirror layer tolerates a
// zero placeholder because verification never depends on blockHash (only on the
// contract's recordHash existence). See BLOCKCHAIN-DESIGN §8.
const ZERO_BLOCK_HASH = '0x' + '0'.repeat(64);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTxConfirmer(deps: CreateTxConfirmerDeps): TxConfirmer {
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxRangePerQuery = deps.maxRangePerQuery ?? DEFAULT_MAX_RANGE_PER_QUERY;
  const fastPathThreshold =
    deps.nullReceiptFastPathThreshold ?? DEFAULT_NULL_RECEIPT_FAST_PATH_THRESHOLD;

  async function waitForConfirmation(
    txHash: string,
    opts?: { confirmations?: number; timeoutMs?: number; recordHash?: Hex32 },
  ): Promise<ConfirmResult> {
    const confirmations = opts?.confirmations ?? deps.confirmations;
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;
    const recordHash = opts?.recordHash;
    // The fast path is armed only when both a recordHash to probe and a readRecord
    // capability are present; otherwise this stays 0 and never fires.
    let consecutiveNullReceipts = 0;

    for (;;) {
      const receipt = await deps.provider.getTransactionReceipt(txHash);
      if (receipt) {
        // A visible receipt resets the null streak — the normal path owns it.
        consecutiveNullReceipts = 0;
        if (receipt.status === 0) {
          return {
            status: 'reverted',
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            confirmedAt: new Date(),
          };
        }
        if (receipt.status === 1) {
          const latest = await deps.provider.getBlockNumber();
          if (latest - receipt.blockNumber + 1 >= confirmations) {
            return {
              status: 'confirmed',
              blockNumber: receipt.blockNumber,
              blockHash: receipt.blockHash,
              confirmedAt: new Date(),
            };
          }
        }
      } else if (recordHash && deps.readRecord) {
        consecutiveNullReceipts += 1;
        if (consecutiveNullReceipts >= fastPathThreshold) {
          // The fast path must NEVER make the normal path worse: any error here is
          // swallowed and polling continues (BLOCKCHAIN-DESIGN §8).
          try {
            const { exists } = await deps.readRecord(recordHash);
            if (exists) {
              // The contract holds the record: on Injective that is final. Backfill
              // block info from the event log; blockHash is not recoverable so a
              // zero placeholder stands in (verify does not use blockHash).
              const found = await findTxByRecordHash(recordHash);
              return {
                status: 'confirmed',
                blockNumber: found?.blockNumber ?? 0,
                blockHash: ZERO_BLOCK_HASH,
                confirmedAt: new Date(),
              };
            }
            // Not yet indexed on chain: reset and keep polling the normal path.
            consecutiveNullReceipts = 0;
          } catch {
            // Swallow: never degrade the normal polling path.
          }
        }
      }

      if (Date.now() >= deadline) {
        throw new RetryableError('CONFIRM_TIMEOUT');
      }
      await delay(pollIntervalMs);
    }
  }

  async function getTransactionStatus(
    txHash: string,
  ): Promise<'pending' | 'confirmed' | 'reverted' | 'not_found'> {
    const receipt = await deps.provider.getTransactionReceipt(txHash);
    if (receipt) {
      return receipt.status === 1 ? 'confirmed' : 'reverted';
    }
    const tx = await deps.provider.getTransaction(txHash);
    return tx ? 'pending' : 'not_found';
  }

  async function findTxByRecordHash(
    recordHash: Hex32,
  ): Promise<{ txHash: string; blockNumber: number } | null> {
    if (!Number.isInteger(deps.deployBlock) || deps.deployBlock <= 0) {
      throw new TerminalError(
        'CONTRACT_DEPLOY_BLOCK must be set to a positive block number before ' +
          'record-hash recovery lookups; scanning from genesis is refused.',
      );
    }

    const latest = await deps.provider.getBlockNumber();
    const topics: (string | null)[] = [null, null, null, null];
    topics[RECORD_HASH_TOPIC_INDEX] = recordHash;

    // Newest -> oldest: recent segments resolve the common case in one call.
    for (let toBlock = latest; toBlock >= deps.deployBlock; toBlock -= maxRangePerQuery) {
      const fromBlock = Math.max(toBlock - maxRangePerQuery + 1, deps.deployBlock);
      const logs = await deps.provider.getLogs({
        address: deps.contractAddress,
        fromBlock,
        toBlock,
        topics,
      });
      if (logs.length > 0) {
        const hit = logs[0];
        return { txHash: hit.transactionHash, blockNumber: hit.blockNumber };
      }
    }
    return null;
  }

  return { waitForConfirmation, getTransactionStatus, findTxByRecordHash };
}
