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
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_RANGE_PER_QUERY = 9000;
const RECORD_HASH_TOPIC_INDEX = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createTxConfirmer(deps: CreateTxConfirmerDeps): TxConfirmer {
  const pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxRangePerQuery = deps.maxRangePerQuery ?? DEFAULT_MAX_RANGE_PER_QUERY;

  async function waitForConfirmation(
    txHash: string,
    opts?: { confirmations?: number; timeoutMs?: number },
  ): Promise<ConfirmResult> {
    const confirmations = opts?.confirmations ?? deps.confirmations;
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const receipt = await deps.provider.getTransactionReceipt(txHash);
      if (receipt) {
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
