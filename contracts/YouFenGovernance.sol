// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * @title YouFenGovernance — v0.7 protocol-enforced community ownership
 * @notice Successor to the v0.6 notary (`YouFenRecords`). v0.6 only proved "a record was not
 *         modified after it was written" while the platform server wallet signed everything. v0.7
 *         makes the chain the AUTHORITY: authorization comes from client-held EIP-712 signatures
 *         (approvers for mints/reversals, the member's own key for votes), and the contract
 *         enforces budget / member cap / advance limits / governance gating on-chain.
 *
 *         YouFen is a PURE RELAYER: it submits the tx and pays gas (INJ) and holds ZERO business
 *         authority. `msg.sender` is used only for owner-gated approver management and pause; it is
 *         NEVER an authorization input for mints, reversals, or votes. Member private keys are
 *         client-held — the server never sees them and cannot sign for members.
 *
 *         This file is the frozen blueprint of `docs/BLOCKCHAIN-DESIGN-v0.7.md` (synthesis Part 2).
 *         Where a value here disagrees with any earlier design draft, this file (== the synthesis)
 *         wins. Economics are ported verbatim from `lib/engine/calc.ts` — see the provenance table
 *         in the design doc.
 *
 *         Target: Injective native EVM testnet (chainId 1439), Solidity 0.8.24 (built-in overflow
 *         checks), ecrecover + EIP-712, keccak256, ~0.6s blocks.
 */
contract YouFenGovernance {
    // ===================================================================================
    // Constants
    // ===================================================================================
    uint256 internal constant BPS = 10_000;
    uint256 internal constant MAX_ADVANCE_LIMIT_BPS = 2_500; // hard cumulative advance ceiling (25%)
    uint256 internal constant ADVANCE_DUAL_BPS = 1_000; // <=10% advance -> DUAL; >10% -> PROPOSAL

    bytes32 public constant APPROVE_OPTION = keccak256("approve");

    // ---- EIP-712 ----
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    // frozen typed-data (byte-exact; every off-chain layer must produce identical encodings)
    bytes32 internal constant MINT_TYPEHASH = keccak256(
        "MintAuthorization(bytes32 communityId,bytes32 memberIdHash,bytes32 contributionId,uint32 ruleVersion,uint64 epochNumber,uint256 regularAmount,uint256 advanceAmount,bool relatedParty,bytes32 proposalId,bytes32 evidenceHash,bytes32 recordHash,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant REVERSAL_TYPEHASH = keccak256(
        "ReversalAuthorization(bytes32 communityId,bytes32 memberIdHash,bytes32 originalRecordHash,uint256 amount,bytes32 proposalId,bytes32 evidenceHash,bytes32 recordHash,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant VOTE_TYPEHASH = keccak256(
        "VoteAuthorization(bytes32 communityId,bytes32 proposalId,bytes32 memberIdHash,bytes32 optionId,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant ENROLL_TYPEHASH = keccak256(
        "MemberEnrollment(bytes32 communityId,bytes32 memberIdHash,address signerAddress,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant ROTATE_TYPEHASH = keccak256(
        "KeyRotation(bytes32 communityId,bytes32 memberIdHash,address newSignerAddress,uint256 nonce,uint256 deadline)"
    );
    bytes32 internal constant PROPOSAL_TYPEHASH = keccak256(
        "ProposalCreation(bytes32 communityId,bytes32 proposalId,uint8 kind,bytes32 optionsHash,uint64 endTime,uint32 minVoterCount,bytes32 targetMemberIdHash,uint32 pInflationRateBps,uint32 pMaxAdvanceRateBps,uint32 pMemberMintCapRateBps,uint256 nonce,uint256 deadline)"
    );

    bytes32 private immutable _cachedDomainSeparator;
    uint256 private immutable _cachedChainId;
    address public immutable pauseGuardian; // deployer; may pause/unpause (blocks NEW ops only)

    // ===================================================================================
    // Typed-data structs (calldata)
    // ===================================================================================
    struct MintAuthorization {
        bytes32 communityId;
        bytes32 memberIdHash; // peppered recipient identity; balance key (NO member address is signed)
        bytes32 contributionId; // idempotency key
        uint32 ruleVersion; // must == active policy version (stale-policy reject)
        uint64 epochNumber; // must == currentEpochNumber
        uint256 regularAmount; // current-epoch budget leg
        uint256 advanceAmount; // next-epoch advance leg (0 for a normal mint); split = both > 0
        bool relatedParty; // recipient is owner/manager -> escalates approval tier
        bytes32 proposalId; // 0x0 unless proposal-gated; binds the authorizing proposal
        bytes32 evidenceHash; // keccak of off-chain evidence bundle
        bytes32 recordHash; // v0.6 canonical hash; notary dedup + public verify
        uint256 nonce; // per-signer used-set nonce
        uint256 deadline; // unix seconds
    }

    struct ReversalAuthorization {
        bytes32 communityId;
        bytes32 memberIdHash; // member whose balance is debited
        bytes32 originalRecordHash; // MUST reference an existing minted record
        uint256 amount; // <= member balance
        bytes32 proposalId; // token_reversal proposal authorization
        bytes32 evidenceHash;
        bytes32 recordHash; // this reversal's canonical hash
        uint256 nonce;
        uint256 deadline;
    }

    struct VoteAuthorization {
        bytes32 communityId;
        bytes32 proposalId;
        bytes32 memberIdHash; // must map to recovered signer via memberSigner
        bytes32 optionId; // must be on the proposal ballot
        uint256 nonce;
        uint256 deadline;
    }

    struct MemberEnrollment {
        bytes32 communityId;
        bytes32 memberIdHash;
        address signerAddress; // the client-held key being bound
        uint256 nonce;
        uint256 deadline;
    }

    struct KeyRotation {
        bytes32 communityId;
        bytes32 memberIdHash;
        address newSignerAddress;
        uint256 nonce;
        uint256 deadline;
    }

    struct ProposalCreation {
        bytes32 communityId;
        bytes32 proposalId;
        uint8 kind;
        bytes32 optionsHash;
        uint64 endTime;
        uint32 minVoterCount;
        bytes32 targetMemberIdHash;
        uint32 pInflationRateBps;
        uint32 pMaxAdvanceRateBps;
        uint32 pMemberMintCapRateBps;
        uint256 nonce;
        uint256 deadline;
    }

    // ===================================================================================
    // Storage
    // ===================================================================================
    struct Community {
        bool exists;
        uint64 currentEpochNumber;
        uint256 currentTotalSupply;
        uint32 activePolicyVersion;
        uint32 inflationRateBps;
        uint32 maxAdvanceRateBps;
        uint32 memberMintCapRateBps;
        uint32 minVoterCount;
        uint32 approverThreshold; // baseline approver count for a regular mint
        address owner; // may set approvers; CANNOT touch balances/supply
    }
    mapping(bytes32 => Community) public communities;

    struct PendingPolicy {
        bool set;
        uint32 policyVersion;
        uint32 inflationRateBps;
        uint32 maxAdvanceRateBps;
        uint32 memberMintCapRateBps;
        uint64 effectiveEpoch;
    }
    mapping(bytes32 => PendingPolicy) public pendingPolicy;

    struct Epoch {
        bool active;
        uint64 epochNumber;
        uint256 openingSupply;
        uint32 inflationRateBps;
        uint256 baseMintBudget; // floor(openingSupply * inflationRateBps / 10000)
        uint256 advanceDebtFromPrev; // carried debt (conservation)
        uint256 effectiveRegularBudget; // max(0, base - debt)
        uint256 maxAdvanceAmount; // floor(base * maxAdvanceRateBps / 10000)
        uint256 regularMinted; // running
        uint256 advanceMinted; // running (epoch-cumulative advance -> split-order gate)
    }
    mapping(bytes32 => mapping(uint64 => Epoch)) public epochs;

    // balances / caps keyed by memberIdHash (NON-TRANSFERABLE: no transfer/approve/allowance anywhere)
    mapping(bytes32 => mapping(bytes32 => uint256)) public balances;
    mapping(bytes32 => mapping(uint64 => mapping(bytes32 => uint256))) public memberRegularMintedEpoch;

    // client-held member vote key binding
    mapping(bytes32 => mapping(bytes32 => address)) public memberSigner;

    // approver set (owner-managed)
    mapping(bytes32 => mapping(address => bool)) public isApprover;

    // single-execution guards
    mapping(bytes32 => mapping(bytes32 => bool)) public contributionConsumed; // community => contributionId
    mapping(address => mapping(uint256 => bool)) public usedNonce; // per-SIGNER nonce used-set
    mapping(bytes32 => bool) public recordExists; // global recordHash notary dedup
    mapping(bytes32 => bytes32) public mintRecordMember; // recordHash => memberIdHash (mint records only)
    mapping(bytes32 => bool) public reversed; // originalRecordHash => reversed
    mapping(bytes32 => bool) public proposalConsumedForMint; // proposalId => consumed by a mint/reversal

    // governance checkpoints (O(log n) snapshot; O(1) epoch switch)
    mapping(bytes32 => uint64) public govSeq;
    struct RegCheckpoint {
        uint64 seq;
        uint256 cumRegularGov;
    }
    struct AdvanceGrant {
        uint64 seq;
        uint64 activationEpoch;
        uint256 cumAdvancePrefix;
    }
    mapping(bytes32 => mapping(bytes32 => RegCheckpoint[])) internal regCkpt;
    mapping(bytes32 => mapping(bytes32 => AdvanceGrant[])) internal advGrant;
    mapping(bytes32 => RegCheckpoint[]) internal regCkptC; // community-level (for activeGovSupplySnapshot)
    mapping(bytes32 => AdvanceGrant[]) internal advGrantC;

    // proposals
    enum ProposalStatus {
        NONE,
        ACTIVE,
        FINALIZED,
        EXECUTED
    }
    // kind: 0 COMMUNITY_DECISION, 1 TOKEN_POLICY_CHANGE, 2 BUDGET_ADVANCE, 3 SPECIAL_MINT, 4 RELATED_PARTY_MINT, 5 TOKEN_REVERSAL
    uint8 internal constant KIND_TOKEN_POLICY_CHANGE = 1;
    uint8 internal constant KIND_BUDGET_ADVANCE = 2;
    uint8 internal constant KIND_SPECIAL_MINT = 3;
    uint8 internal constant KIND_RELATED_PARTY_MINT = 4;
    uint8 internal constant KIND_TOKEN_REVERSAL = 5;

    struct Proposal {
        ProposalStatus status;
        uint8 kind;
        bool approved; // set at finalize: quorum met && winner == approve
        bytes32 communityId;
        uint64 snapshotSeq; // govSeq frozen at creation (weight cutoff)
        uint64 snapshotEpoch; // epoch frozen at creation (advance-maturation cutoff)
        uint32 policyVersionSnapshot;
        uint256 activeGovSupplySnapshot;
        uint64 endTime;
        uint32 minVoterCount;
        uint32 voterCount;
        bytes32 winningOptionId;
        uint256 totalVoteWeight;
        bytes32 targetMemberIdHash;
        uint32 pInflationRateBps;
        uint32 pMaxAdvanceRateBps;
        uint32 pMemberMintCapRateBps;
        bytes32 optionsHash;
    }
    mapping(bytes32 => Proposal) public proposals;
    mapping(bytes32 => mapping(bytes32 => uint256)) public optionWeight; // proposalId => optionId => weight
    mapping(bytes32 => mapping(bytes32 => bool)) public hasVoted; // proposalId => memberIdHash => voted
    mapping(bytes32 => mapping(bytes32 => bool)) internal optionOnBallot; // proposalId => optionId => valid

    // lifecycle guards
    bool public paused;
    uint256 private _reentrancy; // 1 = idle, 2 = entered

    // ===================================================================================
    // Events (every DB projection column is present in some log -> DB rebuildable from getLogs)
    // ===================================================================================
    event CommunityCreated(
        bytes32 indexed communityId,
        address owner,
        uint32 approverThreshold,
        uint32 inflationRateBps,
        uint32 maxAdvanceRateBps,
        uint32 memberMintCapRateBps,
        uint32 minVoterCount,
        uint256 genesisOpeningSupply
    );
    event ApproverSet(bytes32 indexed communityId, address indexed account, bool isApprover);
    event MemberEnrolled(bytes32 indexed communityId, bytes32 indexed memberIdHash, address signerAddress);
    event MemberKeyRotated(bytes32 indexed communityId, bytes32 indexed memberIdHash, address oldAddr, address newAddr);
    event MintExecuted(
        bytes32 indexed communityId,
        bytes32 indexed memberIdHash,
        bytes32 indexed recordHash,
        bytes32 contributionId,
        uint32 ruleVersion,
        uint64 epochNumber,
        uint256 regularAmount,
        uint256 advanceAmount,
        uint64 activationEpoch,
        uint256 memberBalanceAfter,
        uint256 totalSupplyAfter,
        uint64 govSeqAfter,
        bytes32 proposalId,
        uint8 approvalTier,
        bytes32 evidenceHash
    );
    event ReversalExecuted(
        bytes32 indexed communityId,
        bytes32 indexed memberIdHash,
        bytes32 indexed recordHash,
        bytes32 originalRecordHash,
        uint256 amount,
        uint256 memberBalanceAfter,
        uint256 totalSupplyAfter,
        bytes32 proposalId,
        bytes32 evidenceHash
    );
    event ProposalCreated(
        bytes32 indexed communityId,
        bytes32 indexed proposalId,
        uint8 kind,
        uint64 snapshotSeq,
        uint64 snapshotEpoch,
        uint256 activeGovSupplySnapshot,
        uint32 policyVersionSnapshot,
        uint64 endTime,
        uint32 minVoterCount,
        bytes32 targetMemberIdHash,
        bytes32 optionsHash
    );
    event VoteCast(
        bytes32 indexed communityId,
        bytes32 indexed proposalId,
        bytes32 indexed memberIdHash,
        bytes32 optionId,
        uint256 weight
    );
    event ProposalFinalized(
        bytes32 indexed communityId,
        bytes32 indexed proposalId,
        bytes32 winningOptionId,
        uint32 voterCount,
        uint256 totalVoteWeight,
        bool quorumMet,
        bool approved
    );
    event ProposalExecuted(bytes32 indexed communityId, bytes32 indexed proposalId, uint8 kind);
    event EpochRolled(
        bytes32 indexed communityId,
        uint64 indexed closedEpoch,
        uint64 indexed openedEpoch,
        uint256 openingSupply,
        uint256 baseMintBudget,
        uint256 regularMinted,
        uint256 advanceMinted,
        uint256 advanceDebtCarried,
        uint256 nextEffectiveRegularBudget,
        uint256 nextMaxAdvanceAmount
    );
    event PolicyPending(
        bytes32 indexed communityId,
        uint32 policyVersion,
        uint32 inflationRateBps,
        uint32 maxAdvanceRateBps,
        uint32 memberMintCapRateBps,
        uint64 effectiveEpoch
    );
    event PolicyActivated(bytes32 indexed communityId, uint32 policyVersion, uint64 epochNumber);
    event Paused(address indexed by);
    event Unpaused(address indexed by);

    // ===================================================================================
    // Modifiers / constructor
    // ===================================================================================
    modifier nonReentrant() {
        require(_reentrancy != 2, "REENTRANCY");
        _reentrancy = 2;
        _;
        _reentrancy = 1;
    }

    modifier whenNotPaused() {
        require(!paused, "PAUSED");
        _;
    }

    constructor() {
        _reentrancy = 1;
        pauseGuardian = msg.sender;
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator();
    }

    // ===================================================================================
    // Community + approver + policy lifecycle
    // ===================================================================================
    function createCommunity(
        bytes32 communityId,
        address owner,
        uint32 approverThreshold,
        uint32 inflationRateBps,
        uint32 maxAdvanceRateBps,
        uint32 memberMintCapRateBps,
        uint32 minVoterCount,
        uint256 genesisOpeningSupply
    ) external whenNotPaused {
        require(!communities[communityId].exists, "COMMUNITY_EXISTS");
        require(owner != address(0), "ZERO_ADDRESS");
        require(approverThreshold >= 1, "BAD_THRESHOLD");

        Community storage c = communities[communityId];
        c.exists = true;
        c.currentEpochNumber = 1;
        c.currentTotalSupply = genesisOpeningSupply;
        c.activePolicyVersion = 1;
        c.inflationRateBps = inflationRateBps;
        c.maxAdvanceRateBps = maxAdvanceRateBps;
        c.memberMintCapRateBps = memberMintCapRateBps;
        c.minVoterCount = minVoterCount;
        c.approverThreshold = approverThreshold;
        c.owner = owner;

        uint256 base = (genesisOpeningSupply * inflationRateBps) / BPS;
        epochs[communityId][1] = Epoch({
            active: true,
            epochNumber: 1,
            openingSupply: genesisOpeningSupply,
            inflationRateBps: inflationRateBps,
            baseMintBudget: base,
            advanceDebtFromPrev: 0,
            effectiveRegularBudget: base,
            maxAdvanceAmount: (base * maxAdvanceRateBps) / BPS,
            regularMinted: 0,
            advanceMinted: 0
        });

        emit CommunityCreated(
            communityId, owner, approverThreshold, inflationRateBps, maxAdvanceRateBps, memberMintCapRateBps, minVoterCount, genesisOpeningSupply
        );
    }

    function setApprover(bytes32 communityId, address account, bool isApprover_) external {
        Community storage c = communities[communityId];
        require(c.exists, "COMMUNITY_UNKNOWN");
        require(msg.sender == c.owner, "NOT_REGISTRAR");
        require(account != address(0), "ZERO_ADDRESS");
        isApprover[communityId][account] = isApprover_;
        emit ApproverSet(communityId, account, isApprover_);
    }

    // ===================================================================================
    // Member key registry (client-held keys; no private key ever on-chain/server)
    // ===================================================================================
    function enrollMember(MemberEnrollment calldata a, bytes calldata memberSig, bytes calldata authSig)
        external
        whenNotPaused
    {
        require(block.timestamp <= a.deadline, "SIG_EXPIRED");
        require(a.signerAddress != address(0), "ZERO_ADDRESS");
        Community storage c = communities[a.communityId];
        require(c.exists, "COMMUNITY_UNKNOWN");
        require(memberSigner[a.communityId][a.memberIdHash] == address(0), "SIGNER_ALREADY_ACTIVE");

        bytes32 digest = _hashTypedData(
            keccak256(
                abi.encode(ENROLL_TYPEHASH, a.communityId, a.memberIdHash, a.signerAddress, a.nonce, a.deadline)
            )
        );
        // member proves possession of the key being bound
        address m = _recover(digest, memberSig);
        require(m == a.signerAddress, "INVALID_MEMBER_SIGNATURE");
        // an approver or the owner co-authorizes the enrollment
        address auth = _recover(digest, authSig);
        require(isApprover[a.communityId][auth] || auth == c.owner, "ENROLLMENT_NOT_AUTHORIZED");

        require(!usedNonce[m][a.nonce], "BAD_NONCE");
        usedNonce[m][a.nonce] = true;

        memberSigner[a.communityId][a.memberIdHash] = a.signerAddress;
        emit MemberEnrolled(a.communityId, a.memberIdHash, a.signerAddress);
    }

    function rotateKey(KeyRotation calldata a, bytes[] calldata rotationSigs) external whenNotPaused {
        require(block.timestamp <= a.deadline, "SIG_EXPIRED");
        require(a.newSignerAddress != address(0), "ZERO_ADDRESS");
        address cur = memberSigner[a.communityId][a.memberIdHash];
        require(cur != address(0), "MEMBER_NOT_ENROLLED");

        bytes32 digest = _hashTypedData(
            keccak256(
                abi.encode(ROTATE_TYPEHASH, a.communityId, a.memberIdHash, a.newSignerAddress, a.nonce, a.deadline)
            )
        );
        // MVP: authorized by the CURRENT registered key. Guardian M-of-N recovery is post-MVP (see design doc).
        bool ok;
        for (uint256 i = 0; i < rotationSigs.length; i++) {
            if (_recover(digest, rotationSigs[i]) == cur) {
                ok = true;
                break;
            }
        }
        require(ok, "ROTATION_NOT_AUTHORIZED");

        memberSigner[a.communityId][a.memberIdHash] = a.newSignerAddress;
        emit MemberKeyRotated(a.communityId, a.memberIdHash, cur, a.newSignerAddress);
    }

    // ===================================================================================
    // Enforcement core — executeMint (approver-signed; msg.sender NEVER an authority)
    // ===================================================================================
    function executeMint(MintAuthorization calldata a, bytes[] calldata approverSigs)
        external
        nonReentrant
        whenNotPaused
    {
        Community storage c = communities[a.communityId];
        require(c.exists, "COMMUNITY_UNKNOWN");

        // (1) envelope validity — all recomputed on-chain
        require(block.timestamp <= a.deadline, "SIG_EXPIRED");
        require(a.epochNumber == c.currentEpochNumber, "EPOCH_MISMATCH");
        Epoch storage e = epochs[a.communityId][a.epochNumber];
        require(e.active, "EPOCH_NOT_ACTIVE");
        require(a.ruleVersion == c.activePolicyVersion, "POLICY_VERSION_STALE");

        // (2) single-execution guards
        require(!contributionConsumed[a.communityId][a.contributionId], "CONTRIBUTION_ALREADY_MINTED");
        require(!recordExists[a.recordHash], "RECORD_EXISTS");

        // (3) amount
        uint256 amount = a.regularAmount + a.advanceAmount; // checked add (0.8)
        require(amount > 0, "ZERO_AMOUNT");

        // (4) member epoch cap (HARD) — over-cap is possible ONLY through a special_mint proposal
        {
            bool capExempt =
                a.proposalId != bytes32(0) && _proposalAuthorizes(a.proposalId, a.communityId, a.memberIdHash, KIND_SPECIAL_MINT);
            if (!capExempt) {
                uint256 cap = (e.baseMintBudget * c.memberMintCapRateBps) / BPS;
                uint256 soFar = memberRegularMintedEpoch[a.communityId][a.epochNumber][a.memberIdHash];
                require(soFar + a.regularAmount <= cap, "MEMBER_EPOCH_CAP_EXCEEDED");
            }
        }

        // (5) advance legs — epoch-cumulative gate closes the split-order bypass
        uint256 cumBps;
        if (a.advanceAmount > 0) {
            require(e.advanceDebtFromPrev == 0, "ROLLING_ADVANCE_FORBIDDEN");
            require(e.baseMintBudget > 0, "ADVANCE_LIMIT_EXCEEDED"); // base==0 => rate unbounded => forbidden
            require(a.advanceAmount <= e.maxAdvanceAmount, "ADVANCE_CAP_EXCEEDED");
            cumBps = ((e.advanceMinted + a.advanceAmount) * BPS) / e.baseMintBudget;
            require(cumBps <= MAX_ADVANCE_LIMIT_BPS, "ADVANCE_LIMIT_EXCEEDED");
        }

        // (6) regular budget sufficiency
        require(a.regularAmount <= e.effectiveRegularBudget - e.regularMinted, "INSUFFICIENT_BUDGET");

        // (7) approval tier — recovered approvers ONLY (relayer/msg.sender never counted)
        uint8 tier = _checkMintApproval(a, cumBps, c.approverThreshold, approverSigs);

        // (8) effects
        _applyMint(a, e, amount);

        emit MintExecuted(
            a.communityId,
            a.memberIdHash,
            a.recordHash,
            a.contributionId,
            a.ruleVersion,
            a.epochNumber,
            a.regularAmount,
            a.advanceAmount,
            a.epochNumber + 1,
            balances[a.communityId][a.memberIdHash],
            c.currentTotalSupply,
            govSeq[a.communityId],
            a.proposalId,
            tier,
            a.evidenceHash
        );
    }

    // tier: 1 = SINGLE, 2 = DUAL, 3 = PROPOSAL. Returns the resolved tier for the event.
    function _checkMintApproval(
        MintAuthorization calldata a,
        uint256 cumBps,
        uint32 approverThreshold,
        bytes[] calldata approverSigs
    ) internal returns (uint8) {
        // resolve required mode (fail-closed order)
        uint8 tier = 1;
        bool needProposal;
        if (a.advanceAmount > 0 && cumBps > ADVANCE_DUAL_BPS) {
            needProposal = true; // advance > 10% -> BUDGET_ADVANCE proposal
        } else if (a.advanceAmount > 0) {
            tier = 2; // 0 < advance <= 10% -> DUAL
        }
        if (a.relatedParty && tier < 2) tier = 2; // related-party within rule -> at least DUAL

        // proposal gating (special/related-party over-rule/budget-advance>10%)
        if (needProposal || a.proposalId != bytes32(0)) {
            require(_mintProposalSatisfied(a), "PROPOSAL_REQUIRED");
            proposalConsumedForMint[a.proposalId] = true;
            tier = 3;
        }

        // recover distinct approvers (dedupe, reject addr(0), reject self-approval)
        address bound = memberSigner[a.communityId][a.memberIdHash];
        bytes32 digest = _hashTypedData(_hashMint(a));
        uint256 distinct = _countDistinctApprovers(a.communityId, digest, approverSigs, bound, a.nonce);

        uint256 required = tier == 3 ? approverThreshold : (tier > approverThreshold ? tier : approverThreshold);
        require(distinct >= required, "APPROVER_THRESHOLD_NOT_MET");
        return tier;
    }

    function _mintProposalSatisfied(MintAuthorization calldata a) internal view returns (bool) {
        Proposal storage p = proposals[a.proposalId];
        if (p.status != ProposalStatus.FINALIZED && p.status != ProposalStatus.EXECUTED) return false;
        if (!p.approved) return false;
        if (p.communityId != a.communityId) return false;
        if (proposalConsumedForMint[a.proposalId]) return false;
        // member-targeted kinds must match the recipient
        if (p.kind == KIND_SPECIAL_MINT || p.kind == KIND_RELATED_PARTY_MINT) {
            return p.targetMemberIdHash == a.memberIdHash;
        }
        if (p.kind == KIND_BUDGET_ADVANCE) return true;
        return false;
    }

    function _proposalAuthorizes(bytes32 proposalId, bytes32 communityId, bytes32 memberIdHash, uint8 kind)
        internal
        view
        returns (bool)
    {
        Proposal storage p = proposals[proposalId];
        if (p.status != ProposalStatus.FINALIZED && p.status != ProposalStatus.EXECUTED) return false;
        return p.approved && p.communityId == communityId && p.kind == kind && p.targetMemberIdHash == memberIdHash
            && !proposalConsumedForMint[proposalId];
    }

    // Recover distinct approvers over `digest`; per-signer nonce (== the authorization nonce) checked and
    // consumed here. Reverts on addr(0) / non-approver / self-approval / duplicate / replayed nonce.
    function _countDistinctApprovers(
        bytes32 communityId,
        bytes32 digest,
        bytes[] calldata sigs,
        address bound,
        uint256 nonce
    ) internal returns (uint256 count) {
        address[] memory seen = new address[](sigs.length);
        for (uint256 i = 0; i < sigs.length; i++) {
            address s = _recover(digest, sigs[i]);
            require(s != address(0), "INVALID_APPROVER_SIGNATURE");
            require(isApprover[communityId][s], "INVALID_APPROVER_SIGNATURE");
            if (bound != address(0)) require(s != bound, "SELF_APPROVAL");
            for (uint256 j = 0; j < count; j++) {
                require(seen[j] != s, "DUPLICATE_APPROVER");
            }
            require(!usedNonce[s][nonce], "BAD_NONCE");
            usedNonce[s][nonce] = true;
            seen[count] = s;
            count++;
        }
    }

    function _applyMint(MintAuthorization calldata a, Epoch storage e, uint256 amount) internal {
        // consume single-use guards
        contributionConsumed[a.communityId][a.contributionId] = true;
        recordExists[a.recordHash] = true;
        mintRecordMember[a.recordHash] = a.memberIdHash;

        // credit balance + supply
        balances[a.communityId][a.memberIdHash] += amount;
        communities[a.communityId].currentTotalSupply += amount;
        e.regularMinted += a.regularAmount;
        e.advanceMinted += a.advanceAmount;
        memberRegularMintedEpoch[a.communityId][a.epochNumber][a.memberIdHash] += a.regularAmount;

        // governance checkpoints (append-only; O(log n) read later)
        uint64 seq = ++govSeq[a.communityId];
        if (a.regularAmount > 0) {
            _pushRegular(a.communityId, a.memberIdHash, seq, a.regularAmount);
        }
        if (a.advanceAmount > 0) {
            _pushAdvance(a.communityId, a.memberIdHash, seq, a.epochNumber + 1, a.advanceAmount);
        }
    }

    // ===================================================================================
    // Enforcement core — executeReversal
    // ===================================================================================
    function executeReversal(ReversalAuthorization calldata a, bytes[] calldata approverSigs)
        external
        nonReentrant
        whenNotPaused
    {
        Community storage c = communities[a.communityId];
        require(c.exists, "COMMUNITY_UNKNOWN");
        require(block.timestamp <= a.deadline, "SIG_EXPIRED");
        require(!recordExists[a.recordHash], "RECORD_EXISTS");
        require(mintRecordMember[a.originalRecordHash] == a.memberIdHash && a.memberIdHash != bytes32(0), "ORIGINAL_NOT_FOUND");
        require(!reversed[a.originalRecordHash], "ALREADY_REVERSED");
        require(a.amount > 0, "ZERO_AMOUNT");
        require(a.amount <= balances[a.communityId][a.memberIdHash], "INSUFFICIENT_BALANCE");

        // reversals are always proposal-gated (token_reversal), OR require the baseline approver threshold.
        bool proposalOk =
            a.proposalId != bytes32(0) && _proposalAuthorizes(a.proposalId, a.communityId, a.memberIdHash, KIND_TOKEN_REVERSAL);
        bytes32 digest = _hashTypedData(_hashReversal(a));
        uint256 distinct =
            _countDistinctApprovers(a.communityId, digest, approverSigs, memberSigner[a.communityId][a.memberIdHash], a.nonce);
        if (proposalOk) {
            proposalConsumedForMint[a.proposalId] = true;
            require(distinct >= c.approverThreshold, "APPROVER_THRESHOLD_NOT_MET");
        } else {
            // no proposal -> require dual-approver floor (reversal is a correction of record)
            uint256 required = c.approverThreshold > 2 ? c.approverThreshold : 2;
            require(distinct >= required, "APPROVER_THRESHOLD_NOT_MET");
        }

        // effects
        recordExists[a.recordHash] = true;
        reversed[a.originalRecordHash] = true;
        balances[a.communityId][a.memberIdHash] -= a.amount;
        c.currentTotalSupply -= a.amount;

        // governance checkpoint: debit reduces regular governance weight going forward
        uint64 seq = ++govSeq[a.communityId];
        _pushRegularDelta(a.communityId, a.memberIdHash, seq, a.amount, false);

        emit ReversalExecuted(
            a.communityId,
            a.memberIdHash,
            a.recordHash,
            a.originalRecordHash,
            a.amount,
            balances[a.communityId][a.memberIdHash],
            c.currentTotalSupply,
            a.proposalId,
            a.evidenceHash
        );
    }

    // ===================================================================================
    // Governance
    // ===================================================================================
    function createProposal(
        bytes32 proposalId,
        bytes32 communityId,
        uint8 kind,
        bytes32[] calldata optionIds,
        uint64 endTime,
        uint32 minVoterCount,
        bytes32 targetMemberIdHash,
        uint32 pInflationRateBps,
        uint32 pMaxAdvanceRateBps,
        uint32 pMemberMintCapRateBps,
        bytes calldata creatorSig
    ) external whenNotPaused {
        require(proposals[proposalId].status == ProposalStatus.NONE, "PROPOSAL_EXISTS");
        Community storage c = communities[communityId];
        require(c.exists, "COMMUNITY_UNKNOWN");
        require(optionIds.length >= 2, "BAD_OPTIONS");
        require(endTime > block.timestamp, "VOTING_CLOSED");

        bytes32 optionsHash = keccak256(abi.encode(optionIds));
        // creator must be an approver (EIP-712 ProposalCreation signature)
        bytes32 digest = _hashTypedData(
            keccak256(
                abi.encode(
                    PROPOSAL_TYPEHASH,
                    communityId,
                    proposalId,
                    kind,
                    optionsHash,
                    endTime,
                    minVoterCount,
                    targetMemberIdHash,
                    pInflationRateBps,
                    pMaxAdvanceRateBps,
                    pMemberMintCapRateBps,
                    uint256(0), // creator nonce folded into proposalId uniqueness (single-creation guard)
                    endTime // creator deadline == voting end
                )
            )
        );
        require(isApprover[communityId][_recover(digest, creatorSig)], "NOT_AN_APPROVER");

        uint64 seq = govSeq[communityId];
        uint64 ep = c.currentEpochNumber;
        uint32 quorum = minVoterCount > c.minVoterCount ? minVoterCount : c.minVoterCount;

        Proposal storage p = proposals[proposalId];
        p.status = ProposalStatus.ACTIVE;
        p.kind = kind;
        p.communityId = communityId;
        p.snapshotSeq = seq;
        p.snapshotEpoch = ep;
        p.policyVersionSnapshot = c.activePolicyVersion;
        p.activeGovSupplySnapshot = _communityGovAt(communityId, seq, ep);
        p.endTime = endTime;
        p.minVoterCount = quorum;
        p.targetMemberIdHash = targetMemberIdHash;
        p.pInflationRateBps = pInflationRateBps;
        p.pMaxAdvanceRateBps = pMaxAdvanceRateBps;
        p.pMemberMintCapRateBps = pMemberMintCapRateBps;
        p.optionsHash = optionsHash;
        for (uint256 i = 0; i < optionIds.length; i++) {
            optionOnBallot[proposalId][optionIds[i]] = true;
        }

        emit ProposalCreated(
            communityId, proposalId, kind, seq, ep, p.activeGovSupplySnapshot, c.activePolicyVersion, endTime, quorum, targetMemberIdHash, optionsHash
        );
    }

    function castVote(VoteAuthorization calldata v, bytes calldata signature) external whenNotPaused {
        require(block.timestamp <= v.deadline, "SIG_EXPIRED");
        Proposal storage p = proposals[v.proposalId];
        require(p.status == ProposalStatus.ACTIVE, "PROPOSAL_NOT_OPEN");
        require(block.timestamp <= p.endTime, "VOTING_CLOSED");
        require(v.communityId == p.communityId, "COMMUNITY_MISMATCH");
        require(optionOnBallot[v.proposalId][v.optionId], "BAD_OPTION");

        // member's client-held key ONLY (this is what makes "YouFen can't vote for members" true)
        address signer = _recover(_hashTypedData(_hashVote(v)), signature);
        require(signer != address(0) && signer == memberSigner[v.communityId][v.memberIdHash], "INVALID_MEMBER_SIGNATURE");
        require(!hasVoted[v.proposalId][v.memberIdHash], "ALREADY_VOTED");
        require(!usedNonce[signer][v.nonce], "BAD_NONCE");

        // weight read from the FROZEN snapshot (a mint after the snapshot cannot buy weight)
        uint256 w = governanceBalanceAt(v.communityId, v.memberIdHash, p.snapshotSeq, p.snapshotEpoch);
        require(w > 0, "NOT_IN_SNAPSHOT");

        usedNonce[signer][v.nonce] = true;
        hasVoted[v.proposalId][v.memberIdHash] = true;
        optionWeight[v.proposalId][v.optionId] += w;
        p.voterCount += 1;
        p.totalVoteWeight += w;

        emit VoteCast(v.communityId, v.proposalId, v.memberIdHash, v.optionId, w);
    }

    function relayVotes(VoteAuthorization[] calldata vs, bytes[] calldata sigs)
        external
        whenNotPaused
        returns (uint256 acceptedCount)
    {
        require(vs.length == sigs.length, "LENGTH_MISMATCH");
        for (uint256 i = 0; i < vs.length; i++) {
            // skip-invalid: a bad element does not revert the batch
            try this.castVote(vs[i], sigs[i]) {
                acceptedCount++;
            } catch {}
        }
    }

    function finalizeProposal(bytes32 proposalId) external whenNotPaused {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.ACTIVE, "PROPOSAL_NOT_OPEN");
        require(block.timestamp > p.endTime, "VOTING_OPEN");

        // plurality tally is done incrementally in castVote; winner = argmax over recorded options.
        // We settle to approve ONLY if the approve option strictly leads and quorum is met.
        uint256 approveW = optionWeight[proposalId][APPROVE_OPTION];
        bool quorumMet = p.voterCount >= p.minVoterCount;
        // winner: approve if it has strictly the most weight; else "reject" sentinel (0x0)
        bool approveLeads = approveW > 0 && approveW * 2 > p.totalVoteWeight; // strict majority of weight
        bytes32 winner = approveLeads ? APPROVE_OPTION : bytes32(0);
        bool approved = quorumMet && approveLeads;

        p.winningOptionId = winner;
        p.approved = approved;
        p.status = ProposalStatus.FINALIZED;

        emit ProposalFinalized(p.communityId, proposalId, winner, p.voterCount, p.totalVoteWeight, quorumMet, approved);
    }

    function executeProposal(bytes32 proposalId) external whenNotPaused {
        Proposal storage p = proposals[proposalId];
        require(p.status == ProposalStatus.FINALIZED, "PROPOSAL_NOT_FINALIZED");

        if (!p.approved) {
            // I18/I19: executing an unpassed side effect reverts (does NOT consume the proposal)
            if (p.kind == KIND_TOKEN_POLICY_CHANGE) revert("POLICY_PROPOSAL_REQUIRED");
            revert("QUORUM_NOT_MET");
        }

        p.status = ProposalStatus.EXECUTED;

        if (p.kind == KIND_TOKEN_POLICY_CHANGE) {
            Community storage c = communities[p.communityId];
            uint32 nextV = c.activePolicyVersion + 1;
            pendingPolicy[p.communityId] = PendingPolicy({
                set: true,
                policyVersion: nextV,
                inflationRateBps: p.pInflationRateBps,
                maxAdvanceRateBps: p.pMaxAdvanceRateBps,
                memberMintCapRateBps: p.pMemberMintCapRateBps,
                effectiveEpoch: c.currentEpochNumber + 1
            });
            emit PolicyPending(
                p.communityId, nextV, p.pInflationRateBps, p.pMaxAdvanceRateBps, p.pMemberMintCapRateBps, c.currentEpochNumber + 1
            );
        }
        // SPECIAL_MINT / RELATED_PARTY_MINT / BUDGET_ADVANCE / TOKEN_REVERSAL: pure authorizations,
        // consumed by executeMint/executeReversal. No balance write here.

        emit ProposalExecuted(p.communityId, proposalId, p.kind);
    }

    // ===================================================================================
    // Epoch (permissionless)
    // ===================================================================================
    function rollEpoch(bytes32 communityId) external whenNotPaused {
        Community storage c = communities[communityId];
        require(c.exists, "COMMUNITY_UNKNOWN");
        uint64 curN = c.currentEpochNumber;
        Epoch storage cur = epochs[communityId][curN];
        require(cur.active, "EPOCH_NOT_ACTIVE");

        // debt carry-over (conservation): carriedOver = max(0, prevDebt - base); nextDebt = advanceMinted + carriedOver
        uint256 carriedOver =
            cur.advanceDebtFromPrev > cur.baseMintBudget ? cur.advanceDebtFromPrev - cur.baseMintBudget : 0;
        uint256 nextDebt = cur.advanceMinted + carriedOver;

        uint64 nextN = curN + 1;
        uint256 nextOpening = c.currentTotalSupply;

        // pending policy activates ONLY at the next epoch
        PendingPolicy storage pp = pendingPolicy[communityId];
        if (pp.set && pp.effectiveEpoch <= nextN) {
            c.activePolicyVersion = pp.policyVersion;
            c.inflationRateBps = pp.inflationRateBps;
            c.maxAdvanceRateBps = pp.maxAdvanceRateBps;
            c.memberMintCapRateBps = pp.memberMintCapRateBps;
            emit PolicyActivated(communityId, pp.policyVersion, nextN);
            delete pendingPolicy[communityId];
        }

        uint256 nextBase = (nextOpening * c.inflationRateBps) / BPS;
        uint256 nextEffective = nextBase > nextDebt ? nextBase - nextDebt : 0;
        uint256 nextMaxAdv = (nextBase * c.maxAdvanceRateBps) / BPS;

        cur.active = false;
        epochs[communityId][nextN] = Epoch({
            active: true,
            epochNumber: nextN,
            openingSupply: nextOpening,
            inflationRateBps: c.inflationRateBps,
            baseMintBudget: nextBase,
            advanceDebtFromPrev: nextDebt,
            effectiveRegularBudget: nextEffective,
            maxAdvanceAmount: nextMaxAdv,
            regularMinted: 0,
            advanceMinted: 0
        });
        c.currentEpochNumber = nextN;

        emit EpochRolled(
            communityId, curN, nextN, nextOpening, cur.baseMintBudget, cur.regularMinted, cur.advanceMinted, nextDebt, nextEffective, nextMaxAdv
        );
    }

    // ===================================================================================
    // Pause (blocks NEW ops; never gates reads/history)
    // ===================================================================================
    function pause() external {
        require(msg.sender == pauseGuardian, "NOT_REGISTRAR");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external {
        require(msg.sender == pauseGuardian, "NOT_REGISTRAR");
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ===================================================================================
    // Views — governance snapshot (O(log n)), balances, epoch, notary
    // ===================================================================================
    function governanceBalanceAt(bytes32 communityId, bytes32 memberIdHash, uint64 snapSeq, uint64 snapEpoch)
        public
        view
        returns (uint256)
    {
        // (a) regular (immediately-active) governance frozen at snapSeq
        RegCheckpoint[] storage R = regCkpt[communityId][memberIdHash];
        uint256 reg = _regAt(R, snapSeq);

        // (b) advance governance created at/before snapSeq AND matured by snapEpoch
        AdvanceGrant[] storage A = advGrant[communityId][memberIdHash];
        uint256 adv = _advAt(A, snapSeq, snapEpoch);
        return reg + adv;
    }

    function balanceOf(bytes32 communityId, bytes32 memberIdHash) external view returns (uint256) {
        return balances[communityId][memberIdHash];
    }

    function totalSupplyOf(bytes32 communityId) external view returns (uint256) {
        return communities[communityId].currentTotalSupply;
    }

    function getEpoch(bytes32 communityId, uint64 epochNumber) external view returns (Epoch memory) {
        return epochs[communityId][epochNumber];
    }

    function memberSignerOf(bytes32 communityId, bytes32 memberIdHash) external view returns (address) {
        return memberSigner[communityId][memberIdHash];
    }

    // ===================================================================================
    // Internal — checkpoint push / binary-search reads
    // ===================================================================================
    function _pushRegular(bytes32 communityId, bytes32 memberIdHash, uint64 seq, uint256 delta) internal {
        _pushRegularDelta(communityId, memberIdHash, seq, delta, true);
    }

    function _pushRegularDelta(bytes32 communityId, bytes32 memberIdHash, uint64 seq, uint256 delta, bool add)
        internal
    {
        RegCheckpoint[] storage R = regCkpt[communityId][memberIdHash];
        uint256 prev = R.length == 0 ? 0 : R[R.length - 1].cumRegularGov;
        uint256 next = add ? prev + delta : (prev > delta ? prev - delta : 0);
        R.push(RegCheckpoint({seq: seq, cumRegularGov: next}));

        RegCheckpoint[] storage RC = regCkptC[communityId];
        uint256 prevC = RC.length == 0 ? 0 : RC[RC.length - 1].cumRegularGov;
        uint256 nextC = add ? prevC + delta : (prevC > delta ? prevC - delta : 0);
        RC.push(RegCheckpoint({seq: seq, cumRegularGov: nextC}));
    }

    function _pushAdvance(bytes32 communityId, bytes32 memberIdHash, uint64 seq, uint64 activationEpoch, uint256 delta)
        internal
    {
        AdvanceGrant[] storage A = advGrant[communityId][memberIdHash];
        uint256 prev = A.length == 0 ? 0 : A[A.length - 1].cumAdvancePrefix;
        A.push(AdvanceGrant({seq: seq, activationEpoch: activationEpoch, cumAdvancePrefix: prev + delta}));

        AdvanceGrant[] storage AC = advGrantC[communityId];
        uint256 prevC = AC.length == 0 ? 0 : AC[AC.length - 1].cumAdvancePrefix;
        AC.push(AdvanceGrant({seq: seq, activationEpoch: activationEpoch, cumAdvancePrefix: prevC + delta}));
    }

    function _communityGovAt(bytes32 communityId, uint64 snapSeq, uint64 snapEpoch) internal view returns (uint256) {
        uint256 reg = _regAt(regCkptC[communityId], snapSeq);
        uint256 adv = _advAt(advGrantC[communityId], snapSeq, snapEpoch);
        return reg + adv;
    }

    // largest cumRegularGov with seq <= snapSeq (binary search over non-decreasing seq)
    function _regAt(RegCheckpoint[] storage R, uint64 snapSeq) internal view returns (uint256) {
        uint256 n = R.length;
        if (n == 0 || R[0].seq > snapSeq) return 0;
        uint256 lo = 0;
        uint256 hi = n; // find first index with seq > snapSeq
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (R[mid].seq <= snapSeq) lo = mid + 1;
            else hi = mid;
        }
        return R[lo - 1].cumRegularGov;
    }

    // advance prefix bounded by BOTH seq<=snapSeq and activationEpoch<=snapEpoch (each defines a prefix; min cut)
    function _advAt(AdvanceGrant[] storage A, uint64 snapSeq, uint64 snapEpoch) internal view returns (uint256) {
        uint256 n = A.length;
        if (n == 0) return 0;
        uint256 iSeq = _advUpperBySeq(A, snapSeq); // count with seq <= snapSeq
        uint256 iEpoch = _advUpperByEpoch(A, snapEpoch); // count with activationEpoch <= snapEpoch
        uint256 k = iSeq < iEpoch ? iSeq : iEpoch;
        if (k == 0) return 0;
        return A[k - 1].cumAdvancePrefix;
    }

    function _advUpperBySeq(AdvanceGrant[] storage A, uint64 snapSeq) internal view returns (uint256) {
        uint256 lo = 0;
        uint256 hi = A.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (A[mid].seq <= snapSeq) lo = mid + 1;
            else hi = mid;
        }
        return lo; // count of elements with seq <= snapSeq
    }

    function _advUpperByEpoch(AdvanceGrant[] storage A, uint64 snapEpoch) internal view returns (uint256) {
        uint256 lo = 0;
        uint256 hi = A.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (A[mid].activationEpoch <= snapEpoch) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    // ===================================================================================
    // Internal — EIP-712 helpers
    // ===================================================================================
    function _buildDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256(bytes("YouFen")), keccak256(bytes("0.7")), block.chainid, address(this))
        );
    }

    function _domainSeparator() internal view returns (bytes32) {
        return block.chainid == _cachedChainId ? _cachedDomainSeparator : _buildDomainSeparator();
    }

    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    function _hashMint(MintAuthorization calldata a) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                MINT_TYPEHASH,
                a.communityId,
                a.memberIdHash,
                a.contributionId,
                a.ruleVersion,
                a.epochNumber,
                a.regularAmount,
                a.advanceAmount,
                a.relatedParty,
                a.proposalId,
                a.evidenceHash,
                a.recordHash,
                a.nonce,
                a.deadline
            )
        );
    }

    function _hashReversal(ReversalAuthorization calldata a) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                REVERSAL_TYPEHASH,
                a.communityId,
                a.memberIdHash,
                a.originalRecordHash,
                a.amount,
                a.proposalId,
                a.evidenceHash,
                a.recordHash,
                a.nonce,
                a.deadline
            )
        );
    }

    function _hashVote(VoteAuthorization calldata v) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(VOTE_TYPEHASH, v.communityId, v.proposalId, v.memberIdHash, v.optionId, v.nonce, v.deadline)
        );
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        // EIP-2 low-s malleability guard
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }

    // publicly exposed for the golden-vector test (TS encoder must match this byte-for-byte)
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparator();
    }

    function hashMintAuthorization(MintAuthorization calldata a) external view returns (bytes32) {
        return _hashTypedData(_hashMint(a));
    }
}
