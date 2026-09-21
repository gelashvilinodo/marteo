/*
  Warnings:

  - A unique constraint covering the columns `[orderItemId,purchaseItemId,condition]` on the table `OrderItemAllocation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PurchaseReceiptStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED');

-- CreateEnum
CREATE TYPE "InventoryCondition" AS ENUM ('GOOD', 'DEFECTIVE');

-- DropIndex
DROP INDEX "OrderItemAllocation_orderItemId_purchaseItemId_key";

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "condition" "InventoryCondition" NOT NULL DEFAULT 'GOOD';

-- AlterTable
ALTER TABLE "OrderItemAllocation" ADD COLUMN     "condition" "InventoryCondition" NOT NULL DEFAULT 'GOOD';

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "receiptStatus" "PurchaseReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN     "receivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "defectNote" TEXT,
ADD COLUMN     "defectiveQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "remainingDefectiveQuantity" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "OrderItemAllocation_orderItemId_purchaseItemId_condition_key" ON "OrderItemAllocation"("orderItemId", "purchaseItemId", "condition");

-- Validate purchased and remaining quantities
ALTER TABLE "PurchaseItem"
ADD CONSTRAINT "PurchaseItem_quantity_positive"
CHECK ("quantity" > 0),

ADD CONSTRAINT "PurchaseItem_remainingQuantity_valid"
CHECK (
    "remainingQuantity" >= 0
    AND "remainingQuantity" <= "quantity"
),

ADD CONSTRAINT "PurchaseItem_defectiveQuantity_valid"
CHECK (
    "defectiveQuantity" >= 0
    AND "defectiveQuantity" <= "quantity"
),

ADD CONSTRAINT "PurchaseItem_remainingDefectiveQuantity_valid"
CHECK (
    "remainingDefectiveQuantity" >= 0
    AND "remainingDefectiveQuantity" <= "remainingQuantity"
);