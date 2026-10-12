-- CreateEnum
CREATE TYPE "OrderFinancialEntryKind" AS ENUM ('SALE', 'RETURN', 'EXCHANGE_ADJUSTMENT', 'COST_ADJUSTMENT');

-- CreateTable
CREATE TABLE "OrderFinancialEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderNumber" INTEGER,
    "fulfillmentCycle" INTEGER NOT NULL,
    "eventKey" TEXT NOT NULL,
    "kind" "OrderFinancialEntryKind" NOT NULL,
    "productRevenueDelta" DECIMAL(18,2) NOT NULL,
    "deliveryRevenueDelta" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "costOfGoodsDelta" DECIMAL(18,2) NOT NULL,
    "costComplete" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderFinancialEntryItem" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "sourceOrderItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "revenueDelta" DECIMAL(18,2) NOT NULL,
    "costDelta" DECIMAL(18,2) NOT NULL,
    "costComplete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrderFinancialEntryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderFinancialEntry_businessId_occurredAt_idx" ON "OrderFinancialEntry"("businessId", "occurredAt");

-- CreateIndex
CREATE INDEX "OrderFinancialEntry_orderId_fulfillmentCycle_idx" ON "OrderFinancialEntry"("orderId", "fulfillmentCycle");

-- CreateIndex
CREATE UNIQUE INDEX "OrderFinancialEntry_businessId_eventKey_key" ON "OrderFinancialEntry"("businessId", "eventKey");

-- CreateIndex
CREATE INDEX "OrderFinancialEntryItem_entryId_idx" ON "OrderFinancialEntryItem"("entryId");

-- CreateIndex
CREATE INDEX "OrderFinancialEntryItem_sourceOrderItemId_idx" ON "OrderFinancialEntryItem"("sourceOrderItemId");

-- AddForeignKey
ALTER TABLE "OrderFinancialEntry" ADD CONSTRAINT "OrderFinancialEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFinancialEntry" ADD CONSTRAINT "OrderFinancialEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderFinancialEntryItem" ADD CONSTRAINT "OrderFinancialEntryItem_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "OrderFinancialEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
