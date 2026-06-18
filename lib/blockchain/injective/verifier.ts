// RecordVerifier (BLOCKCHAIN-DESIGN §7). Public, cache-free verification in three
// steps: (1) reload the source and rebuild its hash to detect tampering, (2)
// compare against the stored recordHash, (3) read the contract for on-chain
// existence and backfill the tx via log lookup when the DB row lacks it. Any RPC
// failure raises ChainUnavailableError — verified is NEVER reported on a read error.

import { ChainUnavailableError, RecordNotFoundError } from '../errors';
import type {
  BuildEnvelopeFn,
  ChainRecordMeta,
  Hex32,
  PublicRecordWithSource,
  RecordVerifier,
  VerifyResult,
} from '../types';

/** Raw tuple shape returned by the contract's getRecord view. */
export interface ChainGetRecordResult {
  exists: boolean;
  recordType: bigint | number;
  blockNumber: bigint | number;
  timestamp: bigint | number;
}

export interface VerifierReadContract {
  getRecord(recordHash: Hex32): Promise<ChainGetRecordResult>;
}

export interface CreateRecordVerifierDeps {
  readonly read: VerifierReadContract;
  readonly confirmer: {
    findTxByRecordHash(
      recordHash: Hex32,
    ): Promise<{ txHash: string; blockNumber: number } | null>;
  };
  readonly loadRecordWithSource: (id: string) => Promise<PublicRecordWithSource | null>;
  readonly buildEnvelope: BuildEnvelopeFn;
  readonly pepper: string;
  readonly explorerBaseUrl: string;
}

export function createRecordVerifier(deps: CreateRecordVerifierDeps): RecordVerifier {
  async function readChainRecord(recordHash: Hex32): Promise<ChainRecordMeta> {
    const raw = await deps.read.getRecord(recordHash);
    if (!raw.exists) {
      return { exists: false };
    }
    return {
      exists: true,
      recordType: Number(raw.recordType),
      blockNumber: Number(raw.blockNumber),
      timestamp: Number(raw.timestamp),
    };
  }

  async function verifyRecord(recordId: string): Promise<VerifyResult> {
    // Step 1: reload the record together with its source entity.
    const loaded = await deps.loadRecordWithSource(recordId);
    if (!loaded) {
      throw new RecordNotFoundError(`Public record '${recordId}' not found`);
    }
    const { record, source } = loaded;
    const storedHash = record.recordHash;

    // Step 2: rebuild the envelope from source and compare hashes (tamper check).
    const rebuilt = deps.buildEnvelope(source, deps.pepper);
    const computedHash = rebuilt.recordHash;
    const hashMatches = computedHash.toLowerCase() === storedHash.toLowerCase();

    // Step 3: on-chain existence + tx backfill. Any RPC error -> ChainUnavailable.
    let onChain = false;
    let txHash: string | undefined = record.txHash ?? undefined;
    let blockNumber: number | undefined = record.blockNumber ?? undefined;
    try {
      const meta = await readChainRecord(storedHash);
      onChain = meta.exists;
      if (blockNumber === undefined && meta.blockNumber !== undefined) {
        blockNumber = meta.blockNumber;
      }
      if (onChain && !txHash) {
        const found = await deps.confirmer.findTxByRecordHash(storedHash);
        if (found) {
          txHash = found.txHash;
          blockNumber = found.blockNumber;
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'chain read failed';
      throw new ChainUnavailableError(message);
    }

    const verified = hashMatches && onChain;
    let failureReason: string | undefined;
    if (!hashMatches) {
      failureReason = 'SOURCE_DATA_MISMATCH';
    } else if (!onChain) {
      failureReason = 'NOT_ON_CHAIN';
    }

    const explorerUrl = txHash ? `${deps.explorerBaseUrl}/tx/${txHash}` : undefined;

    return {
      verified,
      hashMatches,
      onChain,
      computedHash,
      storedHash,
      txHash,
      blockNumber,
      explorerUrl,
      failureReason,
    };
  }

  return { readChainRecord, verifyRecord };
}
