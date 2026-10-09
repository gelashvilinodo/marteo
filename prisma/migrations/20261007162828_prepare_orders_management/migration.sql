/*
  Warnings:

  - A unique constraint covering the columns `[businessId,number]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[businessId,clientRequestId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "nextOrderNumber" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "clientRequestId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "number" INTEGER,
ADD COLUMN     "stockReturnedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "condition" "InventoryCondition" NOT NULL DEFAULT 'GOOD';

-- CreateIndex
CREATE INDEX "Order_businessId_deletedAt_createdAt_idx" ON "Order"("businessId", "deletedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_businessId_number_key" ON "Order"("businessId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_businessId_clientRequestId_key" ON "Order"("businessId", "clientRequestId");
