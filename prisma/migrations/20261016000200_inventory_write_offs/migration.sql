BEGIN;

ALTER TABLE "InventoryStockLot"
ADD COLUMN "writtenOffQuantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "writtenOffDefectiveQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "InventoryStockLot"
ADD CONSTRAINT "InventoryStockLot_writtenOff_bounds"
CHECK (
    "writtenOffQuantity" >= 0
    AND "writtenOffDefectiveQuantity" >= 0
    AND "writtenOffDefectiveQuantity" <= "writtenOffQuantity"
    AND "writtenOffQuantity" <= "quantity"
    AND "writtenOffDefectiveQuantity" <= "defectiveQuantity"
    AND "remainingQuantity" + "writtenOffQuantity" <= "quantity"
    AND "remainingDefectiveQuantity" +
        "writtenOffDefectiveQuantity" <= "defectiveQuantity"
);

CREATE TABLE "InventoryWriteOff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,

    "name" TEXT NOT NULL,
    "color" TEXT,
    "size" TEXT,

    "quantity" INTEGER NOT NULL,
    "defectiveQuantity" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,2) NOT NULL,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryWriteOff_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "InventoryWriteOff_quantity_bounds"
        CHECK (
            "quantity" >= 0
            AND "defectiveQuantity" >= 0
            AND "defectiveQuantity" <= "quantity"
        ),

    CONSTRAINT "InventoryWriteOff_cost_bounds"
        CHECK (
            "totalCost" >= 0
            AND "totalCost" <> 'NaN'::numeric
            AND ("quantity" > 0 OR "totalCost" = 0)
        ),

    CONSTRAINT "InventoryWriteOff_businessId_fkey"
        FOREIGN KEY ("businessId")
        REFERENCES "Business"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT "InventoryWriteOff_inventoryItemId_fkey"
        FOREIGN KEY ("inventoryItemId")
        REFERENCES "InventoryItem"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryWriteOff_businessId_requestId_key"
ON "InventoryWriteOff"("businessId", "requestId");

CREATE INDEX "InventoryWriteOff_businessId_createdAt_idx"
ON "InventoryWriteOff"("businessId", "createdAt");

CREATE INDEX "InventoryWriteOff_inventoryItemId_idx"
ON "InventoryWriteOff"("inventoryItemId");

COMMIT;