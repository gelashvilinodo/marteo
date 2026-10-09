-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Customer_businessId_deletedAt_createdAt_idx" ON "Customer"("businessId", "deletedAt", "createdAt");
