-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'submitting', 'confirming', 'verified', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "PublicRecordType" AS ENUM ('token_mint', 'advance_mint', 'token_reversal', 'epoch_summary', 'policy_version', 'proposal_snapshot', 'proposal_result');

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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
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
    "resultPublicRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
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
