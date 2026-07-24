-- Business models: non-breaking extension (W1-A).
-- Only additive statements: ALTER TYPE ADD VALUE, ALTER TABLE ADD COLUMN,
-- CREATE TABLE, CREATE INDEX / UNIQUE INDEX. No DROP, no ALTER COLUMN TYPE.
--
-- DEPLOYMENT / HANDOFF NOTE (Postgres): the `ALTER TYPE ... ADD VALUE`
-- statements below CANNOT run in the same transaction as any statement that
-- USES the newly added enum value. Prisma applies each migration inside a
-- single transaction, so on a real Postgres deploy the enum additions must be
-- split out and committed BEFORE any migration/query that references the new
-- values (e.g. inserting a PublicRecord with recordType='epoch_budget_created'
-- or status='recorded'). Split this migration into: (1) a migration containing
-- only the ALTER TYPE ADD VALUE statements, committed first; then (2) the
-- remaining ALTER TABLE / CREATE TABLE / CREATE INDEX statements. This repo has
-- never applied a migration against a real database, so ordering is safe here,
-- but the split is REQUIRED for any production rollout.

-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE 'recorded';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PublicRecordType" ADD VALUE 'epoch_budget_created';
ALTER TYPE "PublicRecordType" ADD VALUE 'budget_advance';
ALTER TYPE "PublicRecordType" ADD VALUE 'advance_debt_repayment';
ALTER TYPE "PublicRecordType" ADD VALUE 'inflation_rate_change';
ALTER TYPE "PublicRecordType" ADD VALUE 'proposal_created';

-- AlterTable
ALTER TABLE "PublicRecord" ADD COLUMN     "chainEligible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "goal" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "contributionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'member',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "CommunityTokenPolicy" ADD COLUMN     "isTransferable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pendingPolicyEffectiveEpoch" INTEGER,
ADD COLUMN     "pendingPolicyVersionId" TEXT,
ADD COLUMN     "rules" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "TokenEpoch" ADD COLUMN     "effectiveRegularBudget" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "endTime" TIMESTAMP(3),
ADD COLUMN     "maxAdvanceAmount" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "startTime" TIMESTAMP(3),
ADD COLUMN     "unusedRegularBudget" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TokenMintEvent" ADD COLUMN     "activeGovernanceAfter" BIGINT,
ADD COLUMN     "activeGovernanceBefore" BIGINT,
ADD COLUMN     "advanceRequestId" TEXT,
ADD COLUMN     "contributionId" TEXT,
ADD COLUMN     "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "governanceStatus" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "ownershipPercentageAfter" DOUBLE PRECISION,
ADD COLUMN     "ownershipPercentageBefore" DOUBLE PRECISION,
ADD COLUMN     "proposalId" TEXT,
ADD COLUMN     "relatedParty" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ruleId" TEXT,
ADD COLUMN     "secondApprovedBy" TEXT;

-- AlterTable
ALTER TABLE "TokenReversalEvent" ADD COLUMN     "activeGovernanceBalanceAfter" BIGINT,
ADD COLUMN     "pendingGovernanceBalanceAfter" BIGINT,
ADD COLUMN     "proposalId" TEXT;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "advanceAmount" BIGINT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "endTime" TIMESTAMP(3),
ADD COLUMN     "epochIdSnapshot" TEXT,
ADD COLUMN     "minimumVoterCount" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "options" JSONB,
ADD COLUMN     "policyChangePayload" JSONB,
ADD COLUMN     "relatedPartyNote" TEXT,
ADD COLUMN     "snapshotBlock" INTEGER,
ADD COLUMN     "specialMintAmount" BIGINT,
ADD COLUMN     "specialMintRecipientId" TEXT,
ADD COLUMN     "startTime" TIMESTAMP(3),
ADD COLUMN     "type" TEXT;

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

