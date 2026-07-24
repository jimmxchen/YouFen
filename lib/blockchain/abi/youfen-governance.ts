// Frozen ABI for YouFenGovernance v0.7. Generated from the compiled artifact
// (ethers Interface.format) so it can never silently drift from
// contracts/YouFenGovernance.sol. The sibling test asserts the ABI parses and
// every event's topic0 is the keccak of its canonical signature.
//
// `recordHash` is the LAST indexed topic (topics[3]) on MintExecuted /
// ReversalExecuted — the reconciler's getLogs recovery key (v0.6 invariant).

/** Human-readable ABI; must stay identical to the Solidity source. */
export const YOUFEN_GOVERNANCE_ABI = [
  'constructor()',
  // ---- events (indexer decodes these into ChainEvent rows) ----
  'event ApproverSet(bytes32 indexed communityId, address indexed account, bool isApprover)',
  'event CommunityCreated(bytes32 indexed communityId, address owner, uint32 approverThreshold, uint32 inflationRateBps, uint32 maxAdvanceRateBps, uint32 memberMintCapRateBps, uint32 minVoterCount, uint256 genesisOpeningSupply)',
  'event EpochRolled(bytes32 indexed communityId, uint64 indexed closedEpoch, uint64 indexed openedEpoch, uint256 openingSupply, uint256 baseMintBudget, uint256 regularMinted, uint256 advanceMinted, uint256 advanceDebtCarried, uint256 nextEffectiveRegularBudget, uint256 nextMaxAdvanceAmount)',
  'event MemberEnrolled(bytes32 indexed communityId, bytes32 indexed memberIdHash, address signerAddress)',
  'event MemberKeyRotated(bytes32 indexed communityId, bytes32 indexed memberIdHash, address oldAddr, address newAddr)',
  'event MintExecuted(bytes32 indexed communityId, bytes32 indexed memberIdHash, bytes32 indexed recordHash, bytes32 contributionId, uint32 ruleVersion, uint64 epochNumber, uint256 regularAmount, uint256 advanceAmount, uint64 activationEpoch, uint256 memberBalanceAfter, uint256 totalSupplyAfter, uint64 govSeqAfter, bytes32 proposalId, uint8 approvalTier, bytes32 evidenceHash)',
  'event Paused(address indexed by)',
  'event PolicyActivated(bytes32 indexed communityId, uint32 policyVersion, uint64 epochNumber)',
  'event PolicyPending(bytes32 indexed communityId, uint32 policyVersion, uint32 inflationRateBps, uint32 maxAdvanceRateBps, uint32 memberMintCapRateBps, uint64 effectiveEpoch)',
  'event ProposalCreated(bytes32 indexed communityId, bytes32 indexed proposalId, uint8 kind, uint64 snapshotSeq, uint64 snapshotEpoch, uint256 activeGovSupplySnapshot, uint32 policyVersionSnapshot, uint64 endTime, uint32 minVoterCount, bytes32 targetMemberIdHash, bytes32 optionsHash)',
  'event ProposalExecuted(bytes32 indexed communityId, bytes32 indexed proposalId, uint8 kind)',
  'event ProposalFinalized(bytes32 indexed communityId, bytes32 indexed proposalId, bytes32 winningOptionId, uint32 voterCount, uint256 totalVoteWeight, bool quorumMet, bool approved)',
  'event ReversalExecuted(bytes32 indexed communityId, bytes32 indexed memberIdHash, bytes32 indexed recordHash, bytes32 originalRecordHash, uint256 amount, uint256 memberBalanceAfter, uint256 totalSupplyAfter, bytes32 proposalId, bytes32 evidenceHash)',
  'event Unpaused(address indexed by)',
  'event VoteCast(bytes32 indexed communityId, bytes32 indexed proposalId, bytes32 indexed memberIdHash, bytes32 optionId, uint256 weight)',
  // ---- writes (relay submitter encodes calldata from these) ----
  'function createCommunity(bytes32 communityId, address owner, uint32 approverThreshold, uint32 inflationRateBps, uint32 maxAdvanceRateBps, uint32 memberMintCapRateBps, uint32 minVoterCount, uint256 genesisOpeningSupply)',
  'function setApprover(bytes32 communityId, address account, bool isApprover_)',
  'function enrollMember((bytes32 communityId, bytes32 memberIdHash, address signerAddress, uint256 nonce, uint256 deadline) a, bytes memberSig, bytes authSig)',
  'function rotateKey((bytes32 communityId, bytes32 memberIdHash, address newSignerAddress, uint256 nonce, uint256 deadline) a, bytes[] rotationSigs)',
  'function executeMint((bytes32 communityId, bytes32 memberIdHash, bytes32 contributionId, uint32 ruleVersion, uint64 epochNumber, uint256 regularAmount, uint256 advanceAmount, bool relatedParty, bytes32 proposalId, bytes32 evidenceHash, bytes32 recordHash, uint256 nonce, uint256 deadline) a, bytes[] approverSigs)',
  'function executeReversal((bytes32 communityId, bytes32 memberIdHash, bytes32 originalRecordHash, uint256 amount, bytes32 proposalId, bytes32 evidenceHash, bytes32 recordHash, uint256 nonce, uint256 deadline) a, bytes[] approverSigs)',
  'function createProposal(bytes32 proposalId, bytes32 communityId, uint8 kind, bytes32[] optionIds, uint64 endTime, uint32 minVoterCount, bytes32 targetMemberIdHash, uint32 pInflationRateBps, uint32 pMaxAdvanceRateBps, uint32 pMemberMintCapRateBps, bytes creatorSig)',
  'function castVote((bytes32 communityId, bytes32 proposalId, bytes32 memberIdHash, bytes32 optionId, uint256 nonce, uint256 deadline) v, bytes signature)',
  'function relayVotes((bytes32 communityId, bytes32 proposalId, bytes32 memberIdHash, bytes32 optionId, uint256 nonce, uint256 deadline)[] vs, bytes[] sigs) returns (uint256 acceptedCount)',
  'function finalizeProposal(bytes32 proposalId)',
  'function executeProposal(bytes32 proposalId)',
  'function rollEpoch(bytes32 communityId)',
  'function pause()',
  'function unpause()',
  // ---- views (verify + rebuild) ----
  'function domainSeparator() view returns (bytes32)',
  'function hashMintAuthorization((bytes32 communityId, bytes32 memberIdHash, bytes32 contributionId, uint32 ruleVersion, uint64 epochNumber, uint256 regularAmount, uint256 advanceAmount, bool relatedParty, bytes32 proposalId, bytes32 evidenceHash, bytes32 recordHash, uint256 nonce, uint256 deadline) a) view returns (bytes32)',
  'function balanceOf(bytes32 communityId, bytes32 memberIdHash) view returns (uint256)',
  'function totalSupplyOf(bytes32 communityId) view returns (uint256)',
  'function governanceBalanceAt(bytes32 communityId, bytes32 memberIdHash, uint64 snapSeq, uint64 snapEpoch) view returns (uint256)',
  'function getEpoch(bytes32 communityId, uint64 epochNumber) view returns ((bool active, uint64 epochNumber, uint256 openingSupply, uint32 inflationRateBps, uint256 baseMintBudget, uint256 advanceDebtFromPrev, uint256 effectiveRegularBudget, uint256 maxAdvanceAmount, uint256 regularMinted, uint256 advanceMinted))',
  'function recordExists(bytes32) view returns (bool)',
  'function memberSignerOf(bytes32 communityId, bytes32 memberIdHash) view returns (address)',
  // public-mapping auto-getters (used by the chain-write READ reader; §6 write endpoints)
  'function communities(bytes32 communityId) view returns (bool exists, uint64 currentEpochNumber, uint256 currentTotalSupply, uint32 activePolicyVersion, uint32 inflationRateBps, uint32 maxAdvanceRateBps, uint32 memberMintCapRateBps, uint32 minVoterCount, uint32 approverThreshold, address owner)',
  'function isApprover(bytes32 communityId, address account) view returns (bool)',
] as const;

/** Every event the indexer projects. The order is not significant. */
export const GOVERNANCE_EVENT_NAMES = [
  'ApproverSet',
  'CommunityCreated',
  'EpochRolled',
  'MemberEnrolled',
  'MemberKeyRotated',
  'MintExecuted',
  'Paused',
  'PolicyActivated',
  'PolicyPending',
  'ProposalCreated',
  'ProposalExecuted',
  'ProposalFinalized',
  'ReversalExecuted',
  'Unpaused',
  'VoteCast',
] as const;

export type GovernanceEventName = (typeof GOVERNANCE_EVENT_NAMES)[number];
