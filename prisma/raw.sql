-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'submitting', 'confirming', 'verified', 'failed', 'superseded', 'recorded');

-- CreateEnum
CREATE TYPE "PublicRecordType" AS ENUM ('token_mint', 'advance_mint', 'token_reversal', 'epoch_summary', 'policy_version', 'proposal_snapshot', 'proposal_result', 'epoch_budget_created', 'budget_advance', 'advance_debt_repayment', 'inflation_rate_change', 'proposal_created');

-- CreateEnum
CREATE TYPE "ChainActionKind" AS ENUM ('execute_mint', 'execute_reversal', 'create_proposal', 'cast_vote', 'relay_votes', 'finalize_proposal', 'execute_proposal', 'roll_epoch', 'enroll_member', 'rotate_key');

-- CreateEnum
CREATE TYPE "ChainActionStatus" AS ENUM ('awaiting_signatures', 'ready_to_submit', 'submitting', 'submitted', 'confirming', 'verified', 'reverted', 'expired', 'superseded');

-- CreateEnum
CREATE TYPE "SignatureRole" AS ENUM ('approver', 'member');

-- CreateTable
CREATE TABLE "PublicRecord" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "recordType" "PublicRecordType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "envelopeJson" TEXT NOT NULL,
    "recordHash" TEXT NOT NULL,
    "sourceTable" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "txHash" TEXT,
    "assignedNonce" INTEGER,
    "blockNumber" INTEGER,
    "blockHash" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "attemptEpoch" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "supersededByRecordId" TEXT,
    "chainEligible" BOOLEAN NOT NULL DEFAULT true,
    "ledgerSeq" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Community" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "goal" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "contributionCount" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityTokenPolicy" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "tokenName" TEXT NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "initialSupply" BIGINT NOT NULL,
    "currentTotalSupply" BIGINT NOT NULL,
    "epochDurationDays" INTEGER NOT NULL,
    "monthlyInflationRateBps" INTEGER NOT NULL,
    "maxAdvanceRateBps" INTEGER NOT NULL,
    "memberMintCapRateBps" INTEGER NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "effectiveEpoch" INTEGER NOT NULL,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "isTransferable" BOOLEAN NOT NULL DEFAULT false,
    "pendingPolicyVersionId" TEXT,
    "pendingPolicyEffectiveEpoch" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityTokenPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenEpoch" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "epochNumber" INTEGER NOT NULL,
    "openingSupply" BIGINT NOT NULL,
    "inflationRateBps" INTEGER NOT NULL,
    "baseMintBudget" BIGINT NOT NULL,
    "advanceDebtFromPreviousEpoch" BIGINT NOT NULL,
    "regularMintedAmount" BIGINT NOT NULL,
    "advancedMintedAmount" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "effectiveRegularBudget" BIGINT NOT NULL DEFAULT 0,
    "maxAdvanceAmount" BIGINT NOT NULL DEFAULT 0,
    "unusedRegularBudget" BIGINT NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "publicRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenEpoch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenMintEvent" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "epochId" TEXT NOT NULL,
    "epochNumber" INTEGER NOT NULL,
    "mintType" TEXT NOT NULL,
    "budgetSource" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "governanceActivationEpoch" INTEGER,
    "memberBalanceBefore" BIGINT NOT NULL,
    "memberBalanceAfter" BIGINT NOT NULL,
    "totalSupplyBefore" BIGINT NOT NULL,
    "totalSupplyAfter" BIGINT NOT NULL,
    "tokenPolicyVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "publicRecordId" TEXT,
    "governanceStatus" TEXT NOT NULL DEFAULT 'active',
    "activeGovernanceBefore" BIGINT,
    "activeGovernanceAfter" BIGINT,
    "ownershipPercentageBefore" DOUBLE PRECISION,
    "ownershipPercentageAfter" DOUBLE PRECISION,
    "contributionId" TEXT,
    "ruleId" TEXT,
    "proposalId" TEXT,
    "advanceRequestId" TEXT,
    "secondApprovedBy" TEXT,
    "relatedParty" BOOLEAN NOT NULL DEFAULT false,
    "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ledgerSeq" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenMintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenReversalEvent" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "originalMintEventId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "totalBalanceAfter" BIGINT NOT NULL,
    "totalSupplyAfter" BIGINT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "publicRecordId" TEXT,
    "activeGovernanceBalanceAfter" BIGINT,
    "pendingGovernanceBalanceAfter" BIGINT,
    "proposalId" TEXT,
    "ledgerSeq" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenReversalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "epochNumberSnapshot" INTEGER,
    "totalSupplySnapshot" BIGINT,
    "activeGovernanceSupplySnapshot" BIGINT,
    "tokenPolicyVersionSnapshot" INTEGER,
    "snapshotAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "winningOptionId" TEXT,
    "voterCount" INTEGER,
    "totalVoteWeight" BIGINT,
    "snapshotPublicRecordId" TEXT,
    "weightsMerkleRoot" TEXT,
    "votesMerkleRoot" TEXT,
    "resultPublicRecordId" TEXT,
    "type" TEXT,
    "description" TEXT,
    "options" JSONB,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "snapshotBlock" INTEGER,
    "epochIdSnapshot" TEXT,
    "minimumVoterCount" INTEGER NOT NULL DEFAULT 3,
    "advanceAmount" BIGINT,
    "specialMintRecipientId" TEXT,
    "specialMintAmount" BIGINT,
    "policyChangePayload" JSONB,
    "relatedPartyNote" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityTokenState" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "currentTotalSupply" BIGINT NOT NULL DEFAULT 0,
    "ledgerSeq" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityTokenState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberTokenBalance" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "totalBalance" BIGINT NOT NULL DEFAULT 0,
    "activeGovernanceBalance" BIGINT NOT NULL DEFAULT 0,
    "pendingGovernanceBalance" BIGINT NOT NULL DEFAULT 0,
    "tokensEarnedCurrentEpoch" BIGINT NOT NULL DEFAULT 0,
    "tokensEarnedLifetime" BIGINT NOT NULL DEFAULT 0,
    "tokensReversedLifetime" BIGINT NOT NULL DEFAULT 0,
    "lastContributionAt" TIMESTAMP(3),
    "lastMintAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberTokenBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT,
    "ruleId" TEXT,
    "suggestedTokenAmount" BIGINT NOT NULL,
    "approvedTokenAmount" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "aiReason" TEXT,
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submittedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenAdvanceRequest" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "epochId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "requestedAmount" BIGINT NOT NULL,
    "approvedAmount" BIGINT,
    "advanceRateBps" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "contributionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "relatedParty" BOOLEAN NOT NULL DEFAULT false,
    "requestedBy" TEXT NOT NULL,
    "secondApprovedBy" TEXT,
    "proposalId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "publicRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenAdvanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenPolicyVersion" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "effectiveEpoch" INTEGER NOT NULL,
    "monthlyInflationRateBps" INTEGER NOT NULL,
    "maxAdvanceRateBps" INTEGER NOT NULL,
    "memberMintCapRateBps" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "proposalId" TEXT,
    "publicRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenPolicyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "totalTokenBalanceSnapshot" BIGINT NOT NULL,
    "activeGovernanceBalanceSnapshot" BIGINT NOT NULL,
    "totalSupplySnapshot" BIGINT NOT NULL,
    "governancePercentageSnapshot" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalMemberSnapshot" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "activeGovernanceToken" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalMemberSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberSigner" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberIdHash" TEXT NOT NULL,
    "signerAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "enrolledAt" TIMESTAMP(3),
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberSigner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignerChallenge" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberIdHash" TEXT NOT NULL,
    "signerAddress" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "deadline" BIGINT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignerChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityController" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 1,
    "guardians" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityController_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityApprover" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityApprover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "kind" "ChainActionKind" NOT NULL,
    "requiredRole" "SignatureRole" NOT NULL,
    "requiredCount" INTEGER NOT NULL DEFAULT 1,
    "typedData" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "recordHash" TEXT,
    "contributionId" TEXT,
    "proposalId" TEXT,
    "memberIdHash" TEXT,
    "nonce" TEXT NOT NULL,
    "deadline" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'collecting',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "signatureRequestId" TEXT NOT NULL,
    "signerAddress" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "role" "SignatureRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainAction" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "kind" "ChainActionKind" NOT NULL,
    "status" "ChainActionStatus" NOT NULL DEFAULT 'awaiting_signatures',
    "signatureRequestId" TEXT,
    "callData" JSONB NOT NULL,
    "recordHash" TEXT,
    "contributionId" TEXT,
    "proposalId" TEXT,
    "memberIdHash" TEXT,
    "amount" DECIMAL(78,0),
    "idempotencyKey" TEXT,
    "attemptEpoch" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChainAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainTransaction" (
    "id" TEXT NOT NULL,
    "chainActionId" TEXT NOT NULL,
    "txHash" TEXT,
    "assignedNonce" INTEGER,
    "gasWei" DECIMAL(78,0),
    "blockNumber" INTEGER,
    "blockHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "revertReason" TEXT,
    "broadcastAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChainEvent" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "txHash" TEXT NOT NULL,
    "recordHash" TEXT,
    "memberIdHash" TEXT,
    "proposalId" TEXT,
    "ledgerSeq" BIGINT,
    "args" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncCheckpoint" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "lastBlock" INTEGER NOT NULL DEFAULT 0,
    "lastLogIndex" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenRuleVersion" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberEpochMintCounter" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "memberIdHash" TEXT NOT NULL,
    "epochNumber" INTEGER NOT NULL,
    "regularMinted" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberEpochMintCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberChainBalance" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "memberIdHash" TEXT NOT NULL,
    "balance" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "ledgerSeq" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberChainBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalExecution" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "executedAt" TIMESTAMP(3),
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicRecord_recordHash_key" ON "PublicRecord"("recordHash");

-- CreateIndex
CREATE INDEX "PublicRecord_status_updatedAt_idx" ON "PublicRecord"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "PublicRecord_sourceTable_sourceId_idx" ON "PublicRecord"("sourceTable", "sourceId");

-- CreateIndex
CREATE INDEX "PublicRecord_communityId_idx" ON "PublicRecord"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "Community_slug_key" ON "Community"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityTokenPolicy_communityId_key" ON "CommunityTokenPolicy"("communityId");

-- CreateIndex
CREATE INDEX "TokenEpoch_communityId_status_idx" ON "TokenEpoch"("communityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TokenEpoch_communityId_epochNumber_key" ON "TokenEpoch"("communityId", "epochNumber");

-- CreateIndex
CREATE INDEX "TokenMintEvent_advanceRequestId_idx" ON "TokenMintEvent"("advanceRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenMintEvent_contributionId_budgetSource_key" ON "TokenMintEvent"("contributionId", "budgetSource");

-- CreateIndex
CREATE UNIQUE INDEX "TokenReversalEvent_originalMintEventId_key" ON "TokenReversalEvent"("originalMintEventId");

-- CreateIndex
CREATE INDEX "Proposal_communityId_status_idx" ON "Proposal"("communityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityTokenState_communityId_key" ON "CommunityTokenState"("communityId");

-- CreateIndex
CREATE INDEX "MemberTokenBalance_communityId_idx" ON "MemberTokenBalance"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberTokenBalance_communityId_memberId_key" ON "MemberTokenBalance"("communityId", "memberId");

-- CreateIndex
CREATE INDEX "Contribution_communityId_status_idx" ON "Contribution"("communityId", "status");

-- CreateIndex
CREATE INDEX "Contribution_memberId_idx" ON "Contribution"("memberId");

-- CreateIndex
CREATE INDEX "TokenAdvanceRequest_communityId_status_idx" ON "TokenAdvanceRequest"("communityId", "status");

-- CreateIndex
CREATE INDEX "TokenAdvanceRequest_epochId_idx" ON "TokenAdvanceRequest"("epochId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenPolicyVersion_policyId_version_key" ON "TokenPolicyVersion"("policyId", "version");

-- CreateIndex
CREATE INDEX "Vote_proposalId_idx" ON "Vote"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_proposalId_memberId_key" ON "Vote"("proposalId", "memberId");

-- CreateIndex
CREATE INDEX "ProposalMemberSnapshot_proposalId_idx" ON "ProposalMemberSnapshot"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalMemberSnapshot_proposalId_memberId_key" ON "ProposalMemberSnapshot"("proposalId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_endpoint_key_key" ON "IdempotencyKey"("endpoint", "key");

-- CreateIndex
CREATE INDEX "MemberSigner_communityId_memberId_idx" ON "MemberSigner"("communityId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberSigner_communityId_memberIdHash_key" ON "MemberSigner"("communityId", "memberIdHash");

-- CreateIndex
CREATE INDEX "SignerChallenge_communityId_memberIdHash_idx" ON "SignerChallenge"("communityId", "memberIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityController_communityId_key" ON "CommunityController"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityApprover_communityId_address_key" ON "CommunityApprover"("communityId", "address");

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_digest_key" ON "SignatureRequest"("digest");

-- CreateIndex
CREATE INDEX "SignatureRequest_communityId_status_idx" ON "SignatureRequest"("communityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Signature_signatureRequestId_signerAddress_key" ON "Signature"("signatureRequestId", "signerAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ChainAction_recordHash_key" ON "ChainAction"("recordHash");

-- CreateIndex
CREATE UNIQUE INDEX "ChainAction_idempotencyKey_key" ON "ChainAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ChainAction_status_updatedAt_idx" ON "ChainAction"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ChainAction_communityId_idx" ON "ChainAction"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "ChainTransaction_txHash_key" ON "ChainTransaction"("txHash");

-- CreateIndex
CREATE INDEX "ChainTransaction_chainActionId_idx" ON "ChainTransaction"("chainActionId");

-- CreateIndex
CREATE INDEX "ChainEvent_communityId_blockNumber_logIndex_idx" ON "ChainEvent"("communityId", "blockNumber", "logIndex");

-- CreateIndex
CREATE INDEX "ChainEvent_recordHash_idx" ON "ChainEvent"("recordHash");

-- CreateIndex
CREATE UNIQUE INDEX "ChainEvent_txHash_logIndex_key" ON "ChainEvent"("txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "SyncCheckpoint_communityId_key" ON "SyncCheckpoint"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "TokenRuleVersion_communityId_ruleVersion_key" ON "TokenRuleVersion"("communityId", "ruleVersion");

-- CreateIndex
CREATE UNIQUE INDEX "MemberEpochMintCounter_communityId_memberIdHash_epochNumber_key" ON "MemberEpochMintCounter"("communityId", "memberIdHash", "epochNumber");

-- CreateIndex
CREATE INDEX "MemberChainBalance_communityId_idx" ON "MemberChainBalance"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberChainBalance_communityId_memberIdHash_key" ON "MemberChainBalance"("communityId", "memberIdHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalExecution_proposalId_key" ON "ProposalExecution"("proposalId");

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "SignatureRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainTransaction" ADD CONSTRAINT "ChainTransaction_chainActionId_fkey" FOREIGN KEY ("chainActionId") REFERENCES "ChainAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

