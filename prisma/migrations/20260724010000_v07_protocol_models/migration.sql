-- CreateEnum
CREATE TYPE "ChainActionKind" AS ENUM ('execute_mint', 'execute_reversal', 'create_proposal', 'cast_vote', 'relay_votes', 'finalize_proposal', 'execute_proposal', 'roll_epoch', 'enroll_member', 'rotate_key');

-- CreateEnum
CREATE TYPE "ChainActionStatus" AS ENUM ('awaiting_signatures', 'ready_to_submit', 'submitting', 'submitted', 'confirming', 'verified', 'reverted', 'expired', 'superseded');

-- CreateEnum
CREATE TYPE "SignatureRole" AS ENUM ('approver', 'member');

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
CREATE UNIQUE INDEX "ProposalExecution_proposalId_key" ON "ProposalExecution"("proposalId");

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_signatureRequestId_fkey" FOREIGN KEY ("signatureRequestId") REFERENCES "SignatureRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChainTransaction" ADD CONSTRAINT "ChainTransaction_chainActionId_fkey" FOREIGN KEY ("chainActionId") REFERENCES "ChainAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

