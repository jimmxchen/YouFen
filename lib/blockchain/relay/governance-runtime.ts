// v0.7 governance runtime (docs/BLOCKCHAIN-DESIGN-v0.7.md §6 Phase-A). Assembles
// the ethers provider + relayer wallet into the minimal TxSender / LogProvider
// surfaces the pull-based relay + indexer need, plus the frozen EIP-712 domain.
// Built lazily and cached; a test seam lets suites inject a fake runtime without
// touching a real RPC (mirrors lib/blockchain/runtime.ts).
//
// The relayer wallet signs (pays gas for) transactions but authorises nothing —
// authority lives in the EIP-712 signatures inside the calldata.

import { Contract, JsonRpcProvider, Wallet, type Provider } from 'ethers';

import { loadBlockchainConfig } from '../config';
import { YOUFEN_GOVERNANCE_ABI } from '../abi/youfen-governance';
import { buildDomain, type Eip712Domain } from '../signing/typed-data';
import type { LogProvider } from '../indexer/indexer-service';
import type { TxSender } from './submitter';

/** On-chain Community row (the `communities(bytes32)` auto-getter, normalized). */
export interface CommunityView {
  readonly exists: boolean;
  readonly currentEpochNumber: bigint; // uint64
  readonly currentTotalSupply: bigint; // uint256
  readonly activePolicyVersion: number; // uint32
  readonly inflationRateBps: number; // uint32
  readonly maxAdvanceRateBps: number; // uint32
  readonly memberMintCapRateBps: number; // uint32
  readonly minVoterCount: number; // uint32
  readonly approverThreshold: number; // uint32
  readonly owner: string; // address
}

/** On-chain Epoch row (`getEpoch(bytes32,uint64)`, normalized). */
export interface EpochView {
  readonly active: boolean;
  readonly epochNumber: bigint; // uint64
  readonly openingSupply: bigint; // uint256
  readonly inflationRateBps: number; // uint32
  readonly baseMintBudget: bigint; // uint256
  readonly advanceDebtFromPrev: bigint; // uint256
  readonly effectiveRegularBudget: bigint; // uint256
  readonly maxAdvanceAmount: bigint; // uint256
  readonly regularMinted: bigint; // uint256
  readonly advanceMinted: bigint; // uint256
}

/**
 * Typed READ surface over the deployed contract (a `new Contract(addr, ABI,
 * provider)` under the hood). All bytes32 args are 0x-hex; uint256/uint64 come
 * back as bigint, uint32 as number. Pure reads — no signing, no gas.
 */
export interface GovernanceReader {
  getEpoch(communityIdHash: string, epochNumber: bigint | number): Promise<EpochView>;
  communities(communityIdHash: string): Promise<CommunityView>;
  balanceOf(communityIdHash: string, memberIdHash: string): Promise<bigint>;
  governanceBalanceAt(
    communityIdHash: string,
    memberIdHash: string,
    snapSeq: bigint | number,
    snapEpoch: bigint | number,
  ): Promise<bigint>;
  recordExists(recordHash: string): Promise<boolean>;
  memberSignerOf(communityIdHash: string, memberIdHash: string): Promise<string>;
  isApprover(communityIdHash: string, account: string): Promise<boolean>;
}

export interface GovernanceRuntime {
  readonly sender: TxSender;
  readonly logProvider: LogProvider;
  /** Typed on-chain read surface for write-endpoint context resolution. */
  readonly reader: GovernanceReader;
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

  const reader = buildReader(new Contract(contractAddress, YOUFEN_GOVERNANCE_ABI, provider));

  return {
    sender,
    logProvider,
    reader,
    contractAddress,
    chainId,
    domain: buildDomain(chainId, contractAddress),
    deployBlock,
    relayerAddress: wallet.address,
    balanceOfRelayer: () => provider.getBalance(wallet.address),
    headBlock: () => provider.getBlockNumber(),
  };
}

/** Wrap an ethers Contract into the typed, normalized GovernanceReader. */
function buildReader(contract: Contract): GovernanceReader {
  return {
    async getEpoch(communityIdHash, epochNumber) {
      const e = await contract.getEpoch(communityIdHash, epochNumber);
      return {
        active: Boolean(e.active),
        epochNumber: BigInt(e.epochNumber),
        openingSupply: BigInt(e.openingSupply),
        inflationRateBps: Number(e.inflationRateBps),
        baseMintBudget: BigInt(e.baseMintBudget),
        advanceDebtFromPrev: BigInt(e.advanceDebtFromPrev),
        effectiveRegularBudget: BigInt(e.effectiveRegularBudget),
        maxAdvanceAmount: BigInt(e.maxAdvanceAmount),
        regularMinted: BigInt(e.regularMinted),
        advanceMinted: BigInt(e.advanceMinted),
      };
    },
    async communities(communityIdHash) {
      const c = await contract.communities(communityIdHash);
      return {
        exists: Boolean(c.exists),
        currentEpochNumber: BigInt(c.currentEpochNumber),
        currentTotalSupply: BigInt(c.currentTotalSupply),
        activePolicyVersion: Number(c.activePolicyVersion),
        inflationRateBps: Number(c.inflationRateBps),
        maxAdvanceRateBps: Number(c.maxAdvanceRateBps),
        memberMintCapRateBps: Number(c.memberMintCapRateBps),
        minVoterCount: Number(c.minVoterCount),
        approverThreshold: Number(c.approverThreshold),
        owner: String(c.owner),
      };
    },
    async balanceOf(communityIdHash, memberIdHash) {
      return BigInt(await contract.balanceOf(communityIdHash, memberIdHash));
    },
    async governanceBalanceAt(communityIdHash, memberIdHash, snapSeq, snapEpoch) {
      return BigInt(
        await contract.governanceBalanceAt(communityIdHash, memberIdHash, snapSeq, snapEpoch),
      );
    },
    async recordExists(recordHash) {
      return Boolean(await contract.recordExists(recordHash));
    },
    async memberSignerOf(communityIdHash, memberIdHash) {
      return String(await contract.memberSignerOf(communityIdHash, memberIdHash));
    },
    async isApprover(communityIdHash, account) {
      return Boolean(await contract.isApprover(communityIdHash, account));
    },
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
