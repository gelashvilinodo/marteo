-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT,
    "description" TEXT,
    "color" TEXT,
    "size" TEXT,
    "characteristics" TEXT,
    "unit" TEXT NOT NULL,
    "imageUrl" TEXT,
    "currentStock" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialPurchase" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "lastRequestId" TEXT,
    "requestId" TEXT NOT NULL,
    "name" TEXT,
    "country" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "receiptStatus" "PurchaseReceiptStatus" NOT NULL DEFAULT 'RECEIVED',
    "shippingCost" DECIMAL(18,2) NOT NULL,
    "customsCost" DECIMAL(18,2) NOT NULL,
    "otherCost" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialPurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "defectiveQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "remainingQuantity" DECIMAL(18,6) NOT NULL,
    "unitPurchasePrice" DECIMAL(18,6) NOT NULL,
    "allocatedCost" DECIMAL(18,2) NOT NULL,
    "totalCost" DECIMAL(18,2) NOT NULL,
    "remainingCost" DECIMAL(18,2) NOT NULL,
    "finalUnitCost" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "MaterialPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Material_businessId_name_idx" ON "Material"("businessId", "name");

-- CreateIndex
CREATE INDEX "MaterialPurchase_businessId_purchaseDate_idx" ON "MaterialPurchase"("businessId", "purchaseDate");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialPurchase_businessId_number_key" ON "MaterialPurchase"("businessId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialPurchase_businessId_requestId_key" ON "MaterialPurchase"("businessId", "requestId");

-- CreateIndex
CREATE INDEX "MaterialPurchaseItem_materialId_idx" ON "MaterialPurchaseItem"("materialId");

-- CreateIndex
CREATE INDEX "MaterialPurchaseItem_purchaseId_idx" ON "MaterialPurchaseItem"("purchaseId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialPurchase" ADD CONSTRAINT "MaterialPurchase_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialPurchaseItem" ADD CONSTRAINT "MaterialPurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "MaterialPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialPurchaseItem" ADD CONSTRAINT "MaterialPurchaseItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep future stock writers within the same invariants as this purchase flow.
ALTER TABLE "Material" ADD CONSTRAINT "Material_stock_nonnegative" CHECK ("currentStock" >= 0);
ALTER TABLE "MaterialPurchase" ADD CONSTRAINT "MaterialPurchase_costs_nonnegative" CHECK ("shippingCost" >= 0 AND "customsCost" >= 0 AND "otherCost" >= 0);
ALTER TABLE "MaterialPurchaseItem" ADD CONSTRAINT "MaterialPurchaseItem_quantities_valid" CHECK ("quantity" > 0 AND "defectiveQuantity" >= 0 AND "defectiveQuantity" <= "quantity" AND "remainingQuantity" >= 0 AND "remainingQuantity" <= "quantity");
ALTER TABLE "MaterialPurchaseItem" ADD CONSTRAINT "MaterialPurchaseItem_costs_valid" CHECK ("unitPurchasePrice" >= 0 AND "allocatedCost" >= 0 AND "totalCost" >= 0 AND "remainingCost" >= 0 AND "remainingCost" <= "totalCost" AND "finalUnitCost" >= 0);
