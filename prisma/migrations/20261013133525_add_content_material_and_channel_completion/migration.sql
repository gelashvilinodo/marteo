-- AlterTable
ALTER TABLE "ContentChannel" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ContentItem" ADD COLUMN     "materialUrl" TEXT;
