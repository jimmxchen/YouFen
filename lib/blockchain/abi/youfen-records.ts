// Frozen ABI contract for YouFenRecords. Generated artifact kept byte-for-byte
// in sync with contracts/YouFenRecords.sol. Event topic0 hashes below are the
// keccak256 of each canonical event signature (verified in the sibling test
// against ethers.Interface(...).getEvent(name).topicHash — the ABI can never
// silently drift). recordHash is always the last indexed param (topics[3]).

import type { Hex32, RecordType } from '../types';

/** Human-readable ABI; must stay identical to the Solidity source. */
export const YOUFEN_RECORDS_ABI = [
  'constructor(address _recorder)',
  // ---- writes ----
  'function recordMint(bytes32 communityId, bytes32 memberId, uint256 amount, uint256 memberBalanceAfter, uint256 totalSupplyAfter, uint8 budgetSource, uint64 activationEpoch, uint64 ledgerSeq, bytes32 recordHash)',
  'function recordReversal(bytes32 communityId, bytes32 memberId, uint256 amount, uint256 memberBalanceAfter, uint256 totalSupplyAfter, bytes32 originalRecordHash, uint64 ledgerSeq, bytes32 recordHash)',
  'function recordEpochSummary(bytes32 communityId, uint64 epochNumber, uint256 openingSupply, uint256 baseBudget, uint256 regularMinted, uint256 advancedMinted, uint256 advanceDebt, bytes32 recordHash)',
  'function recordPolicyVersion(bytes32 communityId, uint32 policyVersion, uint32 inflationRateBps, uint32 maxAdvanceRateBps, uint32 memberMintCapRateBps, uint64 effectiveEpoch, bytes32 recordHash)',
  'function recordProposalSnapshot(bytes32 communityId, bytes32 proposalId, uint64 epochNumber, uint256 totalSupplySnapshot, uint256 activeGovernanceSupplySnapshot, uint32 policyVersion, bytes32 weightsMerkleRoot, bytes32 recordHash)',
  'function recordProposalResult(bytes32 communityId, bytes32 proposalId, bytes32 winningOptionIdHash, uint32 voterCount, uint256 totalVoteWeight, bytes32 votesMerkleRoot, bytes32 recordHash)',
  // ---- reads ----
  'function getBalance(bytes32 communityId, bytes32 memberId) view returns (uint256)',
  'function getTotalSupply(bytes32 communityId) view returns (uint256)',
  'function getRecord(bytes32 recordHash) view returns (bool exists, uint8 recordType, uint64 blockNumber, uint64 timestamp)',
  // ---- public storage getters ----
  'function owner() view returns (address)',
  'function recorder() view returns (address)',
  'function records(bytes32) view returns (uint64 blockNumber, uint64 timestamp, uint8 recordType, bool exists)',
  'function totalSupplyOf(bytes32) view returns (uint256)',
  'function balanceOf(bytes32, bytes32) view returns (uint256)',
  'function reversalOf(bytes32) view returns (bytes32)',
  'function lastLedgerSeq(bytes32) view returns (uint64)',
  // ---- admin ----
  'function setRecorder(address newRecorder)',
  // ---- events (recordHash last indexed) ----
  'event TokensMinted(bytes32 indexed communityId, bytes32 indexed memberId, uint256 amount, uint256 memberBalanceAfter, uint256 totalSupplyAfter, uint8 budgetSource, uint64 activationEpoch, bytes32 indexed recordHash)',
  'event TokensReversed(bytes32 indexed communityId, bytes32 indexed memberId, uint256 amount, uint256 memberBalanceAfter, uint256 totalSupplyAfter, bytes32 indexed recordHash)',
  'event EpochRecorded(bytes32 indexed communityId, uint64 indexed epochNumber, uint256 openingSupply, uint256 baseBudget, uint256 regularMinted, uint256 advancedMinted, uint256 advanceDebt, bytes32 indexed recordHash)',
  'event PolicyVersionRecorded(bytes32 indexed communityId, uint32 indexed policyVersion, uint32 inflationRateBps, uint32 maxAdvanceRateBps, uint32 memberMintCapRateBps, uint64 effectiveEpoch, bytes32 indexed recordHash)',
  'event ProposalSnapshotRecorded(bytes32 indexed communityId, bytes32 indexed proposalId, uint64 epochNumber, uint256 totalSupplySnapshot, uint256 activeGovernanceSupplySnapshot, uint32 policyVersion, bytes32 weightsMerkleRoot, bytes32 indexed recordHash)',
  'event ProposalResultRecorded(bytes32 indexed communityId, bytes32 indexed proposalId, bytes32 winningOptionIdHash, uint32 voterCount, uint256 totalVoteWeight, bytes32 votesMerkleRoot, bytes32 indexed recordHash)',
  'event RecorderChanged(address indexed oldRecorder, address indexed newRecorder)',
] as const;

/** Name of every record-emitting event (RecorderChanged has no recordHash). */
export type RecordEventName =
  | 'TokensMinted'
  | 'TokensReversed'
  | 'EpochRecorded'
  | 'PolicyVersionRecorded'
  | 'ProposalSnapshotRecorded'
  | 'ProposalResultRecorded';

/** topic0 (keccak256 of canonical signature) for each record event. */
export const EVENT_TOPICS: Readonly<Record<RecordEventName, Hex32>> = {
  TokensMinted: '0x66c5ec4309416424fc21f9b52214e1331e711c4614f578f5948c4b7b503c0a21',
  TokensReversed: '0x67f992ae87fbfc5c848b03a239f2cb4139e70c2424b791b4f7e8e7f7fd8efe61',
  EpochRecorded: '0xb6af6d741624c05fdfe944caa4d4ec5265b52f7147fb85a3e46ed8b240b5e664',
  PolicyVersionRecorded: '0x65ef3779e003026313c541203afa3f769af33df9aa6bf26fecfdf78efb893d05',
  ProposalSnapshotRecorded: '0xf49191ad212104f4f32ecbf68e2aacf3c2841e883f9fd7fd245652406ca531f9',
  ProposalResultRecorded: '0x2471e6957a4b8e57e86a5117de81572a8a800223dc9dea6815a052102243875d',
} as const;

/** recordHash is always the 4th topic (index 3) on every record event. */
export const RECORD_HASH_TOPIC_INDEX = 3 as const;

/** Solidity revert strings raised by the contract. */
export const CONTRACT_ERRORS = {
  NOT_RECORDER: 'NOT_RECORDER',
  RECORD_EXISTS: 'RECORD_EXISTS',
  ORIGINAL_NOT_FOUND: 'ORIGINAL_NOT_FOUND',
  NOT_OWNER: 'NOT_OWNER',
  ZERO_ADDRESS: 'ZERO_ADDRESS',
} as const;

/** Contract write method each RecordType dispatches to (mints share recordMint). */
export const CONTRACT_METHOD_BY_RECORD_TYPE: Readonly<Record<RecordType, string>> = {
  token_mint: 'recordMint',
  advance_mint: 'recordMint',
  token_reversal: 'recordReversal',
  epoch_summary: 'recordEpochSummary',
  policy_version: 'recordPolicyVersion',
  proposal_snapshot: 'recordProposalSnapshot',
  proposal_result: 'recordProposalResult',
} as const;
