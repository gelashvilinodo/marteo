-- AlterTable
ALTER TABLE "OrderItemAllocation" ADD COLUMN     "transferredCost" DECIMAL(18,2) DEFAULT 0,
ADD COLUMN     "transferredQuantity" INTEGER NOT NULL DEFAULT 0;
