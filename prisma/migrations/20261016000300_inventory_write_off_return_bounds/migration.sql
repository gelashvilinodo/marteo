BEGIN;

ALTER TABLE "InventoryStockLot"
DROP CONSTRAINT "InventoryStockLot_writtenOff_bounds";

ALTER TABLE "InventoryStockLot"
ADD CONSTRAINT "InventoryStockLot_writtenOff_bounds"
CHECK (
    "quantity" >= 0
    AND "remainingQuantity" >= 0
    AND "remainingDefectiveQuantity" >= 0
    AND "remainingDefectiveQuantity" <= "remainingQuantity"
    AND "writtenOffQuantity" >= 0
    AND "writtenOffDefectiveQuantity" >= 0
    AND "writtenOffDefectiveQuantity" <= "writtenOffQuantity"
    AND "remainingQuantity" + "writtenOffQuantity" <= "quantity"
);

COMMIT;