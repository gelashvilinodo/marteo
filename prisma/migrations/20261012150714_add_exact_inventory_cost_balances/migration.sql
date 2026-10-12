-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "totalCost" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "OrderItemAllocation" ADD COLUMN     "returnedCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalCost" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "remainingCost" DECIMAL(18,2);
