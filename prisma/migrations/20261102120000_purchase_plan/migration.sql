CREATE TYPE "PurchasePlanSource" AS ENUM ('AI', 'MANUAL');

CREATE TABLE "PurchasePlanItem" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "source" "PurchasePlanSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchasePlanItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PurchasePlanItem_quantity_check" CHECK ("quantity" > 0 AND "quantity" <= 100000)
);

CREATE UNIQUE INDEX "PurchasePlanItem_businessId_inventoryItemId_key" ON "PurchasePlanItem"("businessId", "inventoryItemId");
CREATE INDEX "PurchasePlanItem_businessId_createdAt_idx" ON "PurchasePlanItem"("businessId", "createdAt");

ALTER TABLE "PurchasePlanItem" ADD CONSTRAINT "PurchasePlanItem_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchasePlanItem" ADD CONSTRAINT "PurchasePlanItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
