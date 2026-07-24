// v0.7 governance runtime (docs/BLOCKCHAIN-DESIGN-v0.7.md §6 Phase-A). Assembles
// the ethers provider + relayer wallet into the minimal TxSender / LogProvider
// surfaces the pull-based relay + indexer need, plus the frozen EIP-712 domain.
// Built lazily and cached; a test seam lets suites inject a fake runtime without
// touching a real RPC (mirrors lib/blockchain/runtime.ts).
//
// The relayer wallet signs (pays gas for) transactions but authorises nothing —
// authority lives in the EIP-712 signatures inside the calldata.

import { JsonRpcProvider, Wallet, type Provider } from 'ethers';

import { loadBlockchainConfig } from '../config';
import { buildDomain, type Eip712Domain } from '../signing/typed-data';
import type { LogProvider } from '../indexer/indexer-service';
import type { TxSender } from './submitter';

export interface GovernanceRuntime {
  readonly sender: TxSender;
  readonly logProvider: LogProvider;
  readonly contractAddress: string;
  readonly chainId: number;
  readonly domain: Eip712Domain;
  readonly deployBlock: number;
  readonly relayerAddress: string;
  /** relayer INJ balance in wei (for the health endpoint). */
  balanceOfRelayer(): Promise<bigint>;
  headBlock(): Promise<number>;
}

function buildFromProvider(
  provider: Provider,
  wallet: Wallet,
  contractAddress: string,
  chainId: number,
  deployBlock: number,
): GovernanceRuntime {
  const sender: TxSender = {
    async send(calldata: string) {
      const tx = await wallet.sendTransaction({ to: contractAddress, data: calldata });
      return { txHash: tx.hash, nonce: tx.nonce };
    },
    async getReceipt(txHash: string) {
      const r = await provider.getTransactionReceipt(txHash);
      if (r === null) return null;
      return { status: r.status ?? 0, blockNumber: r.blockNumber };
    },
  };

  const logProvider: LogProvider = {
    getBlockNumber: () => provider.getBlockNumber(),
    async getLogs({ address, fromBlock, toBlock }) {
      const logs = await provider.getLogs({ address, fromBlock, toBlock });
      return logs.map((l) => ({
        topics: [...l.topics],
        data: l.data,
        blockNumber: l.blockNumber,
        logIndex: l.index,
        transactionHash: l.transactionHash,
      }));
    },
  };

  return {
    sender,
    logProvider,
    contractAddress,
    chainId,
    domain: buildDomain(chainId, contractAddress),
    deployBlock,
    relayerAddress: wallet.address,
    balanceOfRelayer: () => provider.getBalance(wallet.address),
    headBlock: () => provider.getBlockNumber(),
  };
}

/** Build the real runtime from env config (fail-fast on missing keys). */
export function createGovernanceRuntime(
  env: Record<string, string | undefined> = process.env,
): GovernanceRuntime {
  const config = loadBlockchainConfig(env);
  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  const wallet = new Wallet(config.privateKey, provider);
  return buildFromProvider(provider, wallet, config.contractAddress, config.chainId, config.contractDeployBlock);
}

let singleton: GovernanceRuntime | null = null;

export function getGovernanceRuntime(): GovernanceRuntime {
  if (singleton === null) singleton = createGovernanceRuntime();
  return singleton;
}

/** Test seam — inject a fake runtime (route/handler tests must not build a real provider). */
export function setGovernanceRuntimeForTesting(rt: GovernanceRuntime | null): void {
  singleton = rt;
}
