// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title YouFenRecords
/// @notice Platform's sole on-chain records contract (Injective EVM Testnet).
/// @dev Design invariants (BLOCKCHAIN-DESIGN section 2, PRD section 28):
///  1. No transfer/transferFrom/approve/allowance — non-transferability is
///     guaranteed by the total absence of those functions, not by reverting.
///  2. All writes are recorder-only (the platform Server Wallet); owner may
///     rotate the recorder to stop the bleeding if the key leaks.
///  3. Every record event carries recordHash as its LAST indexed parameter, so
///     it always lands at log.topics[3] — the reconciler reverse-looks the lost
///     txHash via getLogs(topics=[*, *, *, recordHash]). This is a hard contract.
///  4. require(!records[recordHash].exists) is the final anti-duplication line.
///  5. Advance Mint reuses recordMint/TokensMinted: budgetSource==1 with
///     activationEpoch>0 marks an advance; the RecordType enum still tags meta.
///  6. balanceOf/totalSupplyOf are assigned as snapshots (not += with a
///     consistency require): a permanently failing record never bricks later
///     mints. The DB is the source of truth; the chain mirrors post-commit.
///     A monotonic ledgerSeq guards the mirror: the snapshot is applied only
///     when ledgerSeq > lastLedgerSeq[communityId], so a late/out-of-order
///     record (retry, reconciliation) is still notarised (meta + event) but
///     can never roll a fresher balance back to a stale value. ledgerSeq is a
///     community-scoped, strictly increasing sequence assigned by the backend
///     inside the DB transaction.
///  7. recordReversal takes originalRecordHash and requires it to exist,
///     recording the reference in reversalOf (PRD 10.3).
contract YouFenRecords {
    enum RecordType {
        MINT,
        ADVANCE_MINT,
        REVERSAL,
        EPOCH_SUMMARY,
        POLICY_VERSION,
        PROPOSAL_SNAPSHOT,
        PROPOSAL_RESULT
    }

    struct RecordMeta {
        uint64 blockNumber;
        uint64 timestamp;
        uint8 recordType;
        bool exists;
    }

    address public owner;
    address public recorder;
    mapping(bytes32 => RecordMeta) public records; // recordHash => meta
    mapping(bytes32 => uint256) public totalSupplyOf; // communityIdHash => supply
    mapping(bytes32 => mapping(bytes32 => uint256)) public balanceOf; // community => member => balance
    mapping(bytes32 => bytes32) public reversalOf; // reversal recordHash => original recordHash
    mapping(bytes32 => uint64) public lastLedgerSeq; // communityIdHash => last applied ledger sequence

    modifier onlyRecorder() {
        require(msg.sender == recorder, "NOT_RECORDER");
        _;
    }

    modifier notRecorded(bytes32 h) {
        require(!records[h].exists, "RECORD_EXISTS");
        _;
    }

    // ---- Events: recordHash is always the last indexed param (topics[3]) ----
    event TokensMinted(
        bytes32 indexed communityId,
        bytes32 indexed memberId,
        uint256 amount,
        uint256 memberBalanceAfter,
        uint256 totalSupplyAfter,
        uint8 budgetSource,
        uint64 activationEpoch,
        bytes32 indexed recordHash
    );
    event TokensReversed(
        bytes32 indexed communityId,
        bytes32 indexed memberId,
        uint256 amount,
        uint256 memberBalanceAfter,
        uint256 totalSupplyAfter,
        bytes32 indexed recordHash
    );
    event EpochRecorded(
        bytes32 indexed communityId,
        uint64 indexed epochNumber,
        uint256 openingSupply,
        uint256 baseBudget,
        uint256 regularMinted,
        uint256 advancedMinted,
        uint256 advanceDebt,
        bytes32 indexed recordHash
    );
    event PolicyVersionRecorded(
        bytes32 indexed communityId,
        uint32 indexed policyVersion,
        uint32 inflationRateBps,
        uint32 maxAdvanceRateBps,
        uint32 memberMintCapRateBps,
        uint64 effectiveEpoch,
        bytes32 indexed recordHash
    );
    event ProposalSnapshotRecorded(
        bytes32 indexed communityId,
        bytes32 indexed proposalId,
        uint64 epochNumber,
        uint256 totalSupplySnapshot,
        uint256 activeGovernanceSupplySnapshot,
        uint32 policyVersion,
        bytes32 weightsMerkleRoot,
        bytes32 indexed recordHash
    );
    event ProposalResultRecorded(
        bytes32 indexed communityId,
        bytes32 indexed proposalId,
        bytes32 winningOptionIdHash,
        uint32 voterCount,
        uint256 totalVoteWeight,
        bytes32 votesMerkleRoot,
        bytes32 indexed recordHash
    );
    event RecorderChanged(address indexed oldRecorder, address indexed newRecorder);

    constructor(address _recorder) {
        require(_recorder != address(0), "ZERO_ADDRESS");
        owner = msg.sender;
        recorder = _recorder;
    }

    // ---- Write functions (all onlyRecorder + notRecorded) ----

    /// @notice Regular and advance mint share this function. budgetSource:
    ///         0=CURRENT_EPOCH, 1=NEXT_EPOCH_ADVANCE (advance has activationEpoch>0).
    function recordMint(
        bytes32 communityId,
        bytes32 memberId,
        uint256 amount,
        uint256 memberBalanceAfter,
        uint256 totalSupplyAfter,
        uint8 budgetSource,
        uint64 activationEpoch,
        uint64 ledgerSeq,
        bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash) {
        RecordType kind = (budgetSource == 1 && activationEpoch > 0)
            ? RecordType.ADVANCE_MINT
            : RecordType.MINT;
        // Notarisation (meta + event) is unconditional so a stale record still
        // completes; only the balance mirror is guarded by the ledger sequence.
        _writeMeta(recordHash, kind);
        _mirrorIfNewer(communityId, memberId, memberBalanceAfter, totalSupplyAfter, ledgerSeq);
        emit TokensMinted(
            communityId,
            memberId,
            amount,
            memberBalanceAfter,
            totalSupplyAfter,
            budgetSource,
            activationEpoch,
            recordHash
        );
    }

    /// @notice Reversal; originalRecordHash must already exist (PRD 10.3).
    function recordReversal(
        bytes32 communityId,
        bytes32 memberId,
        uint256 amount,
        uint256 memberBalanceAfter,
        uint256 totalSupplyAfter,
        bytes32 originalRecordHash,
        uint64 ledgerSeq,
        bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash) {
        require(records[originalRecordHash].exists, "ORIGINAL_NOT_FOUND");
        // The reference and notarisation are unconditional; the balance mirror
        // is guarded by the ledger sequence so a late reversal cannot overwrite
        // a fresher snapshot.
        _writeMeta(recordHash, RecordType.REVERSAL);
        reversalOf[recordHash] = originalRecordHash;
        _mirrorIfNewer(communityId, memberId, memberBalanceAfter, totalSupplyAfter, ledgerSeq);
        emit TokensReversed(
            communityId, memberId, amount, memberBalanceAfter, totalSupplyAfter, recordHash
        );
    }

    function recordEpochSummary(
        bytes32 communityId,
        uint64 epochNumber,
        uint256 openingSupply,
        uint256 baseBudget,
        uint256 regularMinted,
        uint256 advancedMinted,
        uint256 advanceDebt,
        bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash) {
        _writeMeta(recordHash, RecordType.EPOCH_SUMMARY);
        emit EpochRecorded(
            communityId,
            epochNumber,
            openingSupply,
            baseBudget,
            regularMinted,
            advancedMinted,
            advanceDebt,
            recordHash
        );
    }

    function recordPolicyVersion(
        bytes32 communityId,
        uint32 policyVersion,
        uint32 inflationRateBps,
        uint32 maxAdvanceRateBps,
        uint32 memberMintCapRateBps,
        uint64 effectiveEpoch,
        bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash) {
        _writeMeta(recordHash, RecordType.POLICY_VERSION);
        emit PolicyVersionRecorded(
            communityId,
            policyVersion,
            inflationRateBps,
            maxAdvanceRateBps,
            memberMintCapRateBps,
            effectiveEpoch,
            recordHash
        );
    }

    /// @notice weightsMerkleRoot commits to the per-member snapshot leaf set
    ///         (leaf = keccak256(abi.encodePacked(memberIdHash, weight))), so any
    ///         member can prove their frozen voting weight was included without a
    ///         trusted index. bytes32(0) means no tree was published for this
    ///         snapshot (the field is non-indexed; recordHash stays topics[3]).
    function recordProposalSnapshot(
        bytes32 communityId,
        bytes32 proposalId,
        uint64 epochNumber,
        uint256 totalSupplySnapshot,
        uint256 activeGovernanceSupplySnapshot,
        uint32 policyVersion,
        bytes32 weightsMerkleRoot,
        bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash) {
        _writeMeta(recordHash, RecordType.PROPOSAL_SNAPSHOT);
        emit ProposalSnapshotRecorded(
            communityId,
            proposalId,
            epochNumber,
            totalSupplySnapshot,
            activeGovernanceSupplySnapshot,
            policyVersion,
            weightsMerkleRoot,
            recordHash
        );
    }

    /// @notice votesMerkleRoot commits to the per-vote leaf set
    ///         (leaf = keccak256(abi.encodePacked(memberIdHash, optionIdHash, weight))),
    ///         so any voter can prove their counted ballot was included in the
    ///         tally. bytes32(0) means no tree was published for this result.
    function recordProposalResult(
        bytes32 communityId,
        bytes32 proposalId,
        bytes32 winningOptionIdHash,
        uint32 voterCount,
        uint256 totalVoteWeight,
        bytes32 votesMerkleRoot,
        bytes32 recordHash
    ) external onlyRecorder notRecorded(recordHash) {
        _writeMeta(recordHash, RecordType.PROPOSAL_RESULT);
        emit ProposalResultRecorded(
            communityId,
            proposalId,
            winningOptionIdHash,
            voterCount,
            totalVoteWeight,
            votesMerkleRoot,
            recordHash
        );
    }

    // ---- Read functions (PRD 28.2 allow list) ----

    function getBalance(bytes32 communityId, bytes32 memberId) external view returns (uint256) {
        return balanceOf[communityId][memberId];
    }

    function getTotalSupply(bytes32 communityId) external view returns (uint256) {
        return totalSupplyOf[communityId];
    }

    function getRecord(bytes32 recordHash)
        external
        view
        returns (bool exists, uint8 recordType, uint64 blockNumber, uint64 timestamp)
    {
        RecordMeta storage meta = records[recordHash];
        return (meta.exists, meta.recordType, meta.blockNumber, meta.timestamp);
    }

    // ---- Admin ----

    function setRecorder(address newRecorder) external {
        require(msg.sender == owner, "NOT_OWNER");
        require(newRecorder != address(0), "ZERO_ADDRESS");
        address old = recorder;
        recorder = newRecorder;
        emit RecorderChanged(old, newRecorder);
    }

    // ---- Internal ----

    function _writeMeta(bytes32 recordHash, RecordType kind) private {
        records[recordHash] = RecordMeta({
            blockNumber: uint64(block.number),
            timestamp: uint64(block.timestamp),
            recordType: uint8(kind),
            exists: true
        });
    }

    /// @dev Apply the balance/supply snapshot only for a strictly newer ledger
    ///      sequence, then advance the guard. A stale or duplicate ledgerSeq is
    ///      skipped silently (no revert) so the record still notarises without
    ///      rolling a fresher snapshot back to an outdated value (invariant 6).
    function _mirrorIfNewer(
        bytes32 communityId,
        bytes32 memberId,
        uint256 memberBalanceAfter,
        uint256 totalSupplyAfter,
        uint64 ledgerSeq
    ) private {
        if (ledgerSeq > lastLedgerSeq[communityId]) {
            lastLedgerSeq[communityId] = ledgerSeq;
            balanceOf[communityId][memberId] = memberBalanceAfter;
            totalSupplyOf[communityId] = totalSupplyAfter;
        }
    }
}
