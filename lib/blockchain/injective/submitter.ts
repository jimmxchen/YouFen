// TxSubmitter (BLOCKCHAIN-DESIGN §6). Dispatches a SubmittableRecord to the right
// contract write method, runs a cheap estimateGas precheck to surface reverts
// (notably RECORD_EXISTS) before broadcasting, then broadcasts with an explicit
// nonce. It NEVER awaits tx.wait() — confirmation is a separate worker's job.
// Every thrown value is normalised to a ChainError via classifyUnknownError.

import { CONTRACT_METHOD_BY_RECORD_TYPE } from '../abi/youfen-records';
import { classifyUnknownError, TerminalError } from '../errors';
import type { SubmittableRecord, SubmitResult, TxSubmitter } from '../types';

/** A single contract write method plus its estimateGas sibling. */
export interface WriteContractMethod {
  (...args: readonly unknown[]): Promise<{ hash: string }>;
  estimateGas(...args: readonly unknown[]): Promise<bigint>;
}

/** Structural write-contract view: method name -> callable. */
export type WriteContract = Record<string, WriteContractMethod>;

export interface CreateTxSubmitterDeps {
  readonly write: WriteContract;
  readonly wallet: { resyncNonce(): Promise<number> };
}

export function createTxSubmitter(deps: CreateTxSubmitterDeps): TxSubmitter {
  async function submitRecord(
    record: SubmittableRecord,
    nonce: number,
  ): Promise<SubmitResult> {
    const methodName = CONTRACT_METHOD_BY_RECORD_TYPE[record.recordType];
    const method = deps.write[methodName];
    if (typeof method !== 'function') {
      throw new TerminalError(
        `No contract method mapped for record type '${record.recordType}'`,
      );
    }

    const args = record.chainArgs;
    const overrides = { nonce };

    // 1) Cheap precheck: reverts (RECORD_EXISTS, invalid args) surface here
    //    before a transaction is ever broadcast.
    try {
      await method.estimateGas(...args, overrides);
    } catch (error: unknown) {
      throw classifyUnknownError(error);
    }

    // 2) Broadcast only; confirmation is handled elsewhere (never tx.wait()).
    try {
      const tx = await method(...args, overrides);
      return { txHash: tx.hash, nonce, submittedAt: new Date() };
    } catch (error: unknown) {
      throw classifyUnknownError(error);
    }
  }

  async function resyncNonce(): Promise<number> {
    return deps.wallet.resyncNonce();
  }

  return { submitRecord, resyncNonce };
}
