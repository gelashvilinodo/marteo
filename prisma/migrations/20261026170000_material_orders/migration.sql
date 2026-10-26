-- AlterEnum
ALTER TYPE "OrderItemSource" ADD VALUE 'MATERIAL';

-- AlterTable
ALTER TABLE "OrderFinancialEntryItem" ALTER COLUMN "quantityDelta" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "materialId" TEXT,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'PCS',
ALTER COLUMN "quantity" SET DEFAULT 1,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,6);

-- AlterTable
ALTER TABLE "OrderReturnItem" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'PCS',
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(18,6);

-- CreateTable
CREATE TABLE "MaterialOrderAllocation" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "purchaseItemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "returnedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "returnedCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transferredQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "transferredCost" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "MaterialOrderAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialOrderAllocation_orderItemId_idx" ON "MaterialOrderAllocation"("orderItemId");

-- CreateIndex
CREATE INDEX "MaterialOrderAllocation_purchaseItemId_idx" ON "MaterialOrderAllocation"("purchaseItemId");

-- CreateIndex
CREATE INDEX "MaterialOrderAllocation_materialId_idx" ON "MaterialOrderAllocation"("materialId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialOrderAllocation" ADD CONSTRAINT "MaterialOrderAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialOrderAllocation" ADD CONSTRAINT "MaterialOrderAllocation_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialOrderAllocation" ADD CONSTRAINT "MaterialOrderAllocation_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "MaterialPurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
