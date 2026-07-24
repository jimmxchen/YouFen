-- AlterTable
ALTER TABLE "TokenMintEvent" ADD COLUMN     "ledgerSeq" INTEGER;

-- AlterTable
ALTER TABLE "TokenReversalEvent" ADD COLUMN     "ledgerSeq" INTEGER;
