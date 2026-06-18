// Governance log decoder (docs/BLOCKCHAIN-DESIGN-v0.7.md §3). Turns a raw EVM
// log into a normalised, JSON-safe ChainEvent the indexer persists and folds
// into projections. Pure and IO-free.
//
// Every uint (amount / supply / seq) is emitted as a DECIMAL STRING in `args`
// (never a JS number) so uint256 values survive the JSON boundary. The common
// join keys (communityId / recordHash / memberIdHash / proposalId / ledgerSeq)
// are lifted out for indexing; `ledgerSeq` maps to the monotonic `govSeqAfter`
// on MintExecuted (the fresher-wins guard), null elsewhere.

import { Interface, type Log } from 'ethers';

import { GOVERNANCE_EVENT_NAMES, YOUFEN_GOVERNANCE_ABI, type GovernanceEventName } from '../abi/youfen-governance';

const iface = new Interface(YOUFEN_GOVERNANCE_ABI);
const KNOWN = new Set<string>(GOVERNANCE_EVENT_NAMES);

export interface RawLog {
  readonly topics: readonly string[];
  readonly data: string;
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly transactionHash: string;
}

export interface DecodedChainEvent {
  readonly eventName: GovernanceEventName;
  readonly communityId: string | null;
  readonly recordHash: string | null;
  readonly memberIdHash: string | null;
  readonly proposalId: string | null;
  readonly ledgerSeq: bigint | null;
  /** decoded named args, JSON-safe (bigint -> decimal string). */
  readonly args: Readonly<Record<string, string | number | boolean>>;
  readonly blockNumber: number;
  readonly logIndex: number;
  readonly txHash: string;
}

function jsonSafe(value: unknown): string | number | boolean {
  if (typeof value === 'bigint') return value.toString(10);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  return String(value); // addresses / bytes32 hex
}

function asString(v: string | number | boolean | undefined): string | null {
  return typeof v === 'string' ? v : null;
}

/**
 * Decode one log emitted by YouFenGovernance. Returns null for logs that are not
 * one of the known governance events (foreign contract, or an event we do not
 * project). Throws only on a genuinely corrupt/undecodable known topic.
 */
export function decodeGovernanceLog(log: RawLog): DecodedChainEvent | null {
  let parsed;
  try {
    parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
  } catch {
    return null; // not our ABI
  }
  if (parsed === null || !KNOWN.has(parsed.name)) return null;

  const args: Record<string, string | number | boolean> = {};
  for (const frag of parsed.fragment.inputs) {
    if (frag.name) args[frag.name] = jsonSafe(parsed.args[frag.name as keyof typeof parsed.args]);
  }

  const ledgerSeqRaw = parsed.args['govSeqAfter' as keyof typeof parsed.args] as bigint | undefined;

  return {
    eventName: parsed.name as GovernanceEventName,
    communityId: asString(args.communityId),
    recordHash: asString(args.recordHash),
    memberIdHash: asString(args.memberIdHash),
    proposalId: asString(args.proposalId),
    ledgerSeq: typeof ledgerSeqRaw === 'bigint' ? ledgerSeqRaw : null,
    args,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    txHash: log.transactionHash,
  };
}

/** Decode a batch, dropping foreign/unknown logs, preserving (block, logIndex) order. */
export function decodeGovernanceLogs(logs: readonly RawLog[]): DecodedChainEvent[] {
  const out: DecodedChainEvent[] = [];
  for (const log of logs) {
    const decoded = decodeGovernanceLog(log);
    if (decoded !== null) out.push(decoded);
  }
  return out.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}

/** The ethers Interface (shared) — the relay submitter reuses it to encode calldata. */
export function governanceInterface(): Interface {
  return iface;
}

export type { Log };
