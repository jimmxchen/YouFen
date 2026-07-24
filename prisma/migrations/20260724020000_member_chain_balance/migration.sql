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

-- CreateIndex
CREATE INDEX "MemberChainBalance_communityId_idx" ON "MemberChainBalance"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberChainBalance_communityId_memberIdHash_key" ON "MemberChainBalance"("communityId", "memberIdHash");

