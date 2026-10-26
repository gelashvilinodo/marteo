-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "Production" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "productionDate" TIMESTAMP(3) NOT NULL,
    "status" "ProductionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "note" TEXT,
    "overheadCost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "additionalCosts" JSONB NOT NULL,
    "materialsCost" DECIMAL(18,2) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionInput" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ProductionInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionMaterialAllocation" (
    "id" TEXT NOT NULL,
    "inputId" TEXT NOT NULL,
    "purchaseItemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ProductionMaterialAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOutput" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "rowKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "inventoryItemId" TEXT,
    "stockLotId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "brand" TEXT,
    "description" TEXT,
    "color" TEXT,
    "size" TEXT,
    "imageUrl" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "costShare" DECIMAL(5,2) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "salePrice" DECIMAL(12,2),

    CONSTRAINT "ProductionOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Production_businessId_productionDate_idx" ON "Production"("businessId", "productionDate");

-- CreateIndex
CREATE UNIQUE INDEX "Production_businessId_number_key" ON "Production"("businessId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionInput_productionId_materialId_key" ON "ProductionInput"("productionId", "materialId");

-- CreateIndex
CREATE INDEX "ProductionMaterialAllocation_purchaseItemId_idx" ON "ProductionMaterialAllocation"("purchaseItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOutput_stockLotId_key" ON "ProductionOutput"("stockLotId");

-- CreateIndex
CREATE INDEX "ProductionOutput_inventoryItemId_idx" ON "ProductionOutput"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOutput_productionId_rowKey_key" ON "ProductionOutput"("productionId", "rowKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRequest_businessId_requestId_key" ON "ProductionRequest"("businessId", "requestId");

-- AddForeignKey
ALTER TABLE "Production" ADD CONSTRAINT "Production_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionInput" ADD CONSTRAINT "ProductionInput_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionInput" ADD CONSTRAINT "ProductionInput_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialAllocation" ADD CONSTRAINT "ProductionMaterialAllocation_inputId_fkey" FOREIGN KEY ("inputId") REFERENCES "ProductionInput"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionMaterialAllocation" ADD CONSTRAINT "ProductionMaterialAllocation_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "MaterialPurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOutput" ADD CONSTRAINT "ProductionOutput_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOutput" ADD CONSTRAINT "ProductionOutput_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOutput" ADD CONSTRAINT "ProductionOutput_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "InventoryStockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRequest" ADD CONSTRAINT "ProductionRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRequest" ADD CONSTRAINT "ProductionRequest_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
