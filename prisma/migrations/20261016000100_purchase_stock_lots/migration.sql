BEGIN;

SET LOCAL lock_timeout = '10s';

-- გადატანის განმავლობაში მონაცემები არ უნდა იცვლებოდეს.
LOCK TABLE
    "Business",
    "InventoryItem",
    "Purchase",
    "PurchaseItem",
    "OrderItem",
    "OrderItemAllocation"
IN ACCESS EXCLUSIVE MODE;

-- ძველი მონაცემების შემოწმება.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "PurchaseItem" pi
        JOIN "Purchase" p ON p.id = pi."purchaseId"
        JOIN "InventoryItem" i ON i.id = pi."inventoryItemId"
        WHERE
            p."businessId" <> i."businessId"
            OR pi.quantity < 1
            OR pi."remainingQuantity" < 0
            OR pi."remainingQuantity" > pi.quantity
            OR pi."defectiveQuantity" < 0
            OR pi."defectiveQuantity" > pi.quantity
            OR pi."remainingDefectiveQuantity" < 0
            OR pi."remainingDefectiveQuantity" > pi."remainingQuantity"
            OR pi."finalUnitCost" < 0
            OR pi."remainingCost" < 0
            OR (
                p."receiptStatus" = 'IN_TRANSIT'
                AND (
                    pi."remainingQuantity" <> 0
                    OR pi."remainingDefectiveQuantity" <> 0
                )
            )
    ) THEN
        RAISE EXCEPTION
            'Stock migration stopped: invalid purchase balances or ownership.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "OrderItemAllocation" a
        JOIN "PurchaseItem" pi ON pi.id = a."purchaseItemId"
        JOIN "Purchase" p ON p.id = pi."purchaseId"
        JOIN "OrderItem" oi ON oi.id = a."orderItemId"
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE
            p."receiptStatus" <> 'RECEIVED'
            OR p."businessId" <> o."businessId"
            OR oi.source <> 'INVENTORY'
            OR oi."inventoryItemId" IS DISTINCT FROM pi."inventoryItemId"
            OR a.quantity <= 0
            OR a."returnedQuantity" < 0
            OR a."transferredQuantity" < 0
            OR (
                a."returnedQuantity"::bigint +
                a."transferredQuantity"::bigint
            ) > a.quantity
    ) THEN
        RAISE EXCEPTION
            'Stock migration stopped: invalid order allocations.';
    END IF;

    IF EXISTS (
        WITH used AS (
            SELECT
                a."purchaseItemId",
                SUM(
                    CASE
                        WHEN oi."stockRestoredAt" IS NOT NULL THEN 0
                        ELSE
                            a.quantity::bigint -
                            a."returnedQuantity" -
                            a."transferredQuantity"
                    END
                ) AS quantity
            FROM "OrderItemAllocation" a
            JOIN "OrderItem" oi ON oi.id = a."orderItemId"
            GROUP BY a."purchaseItemId"
        )
        SELECT 1
        FROM "PurchaseItem" pi
        JOIN "Purchase" p ON p.id = pi."purchaseId"
        LEFT JOIN used u ON u."purchaseItemId" = pi.id
        WHERE p."receiptStatus" = 'RECEIVED'
            AND (
                pi.quantity::bigint - pi."remainingQuantity"
            ) <> COALESCE(u.quantity, 0)
    ) THEN
        RAISE EXCEPTION
            'Stock migration stopped: purchase usage does not match remaining quantity.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "InventoryItem" i
        LEFT JOIN (
            SELECT
                pi."inventoryItemId",
                SUM(pi."remainingQuantity") AS quantity
            FROM "PurchaseItem" pi
            JOIN "Purchase" p ON p.id = pi."purchaseId"
            WHERE p."receiptStatus" = 'RECEIVED'
            GROUP BY pi."inventoryItemId"
        ) balances ON balances."inventoryItemId" = i.id
        WHERE i."currentStock" IS DISTINCT FROM
            COALESCE(balances.quantity, 0)
    ) THEN
        RAISE EXCEPTION
            'Stock migration stopped: inventory totals do not match purchase balances.';
    END IF;
END;
$$;

CREATE TABLE "InventoryStockLot" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "purchaseItemId" TEXT,
    "sourcePurchaseItemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "defectiveQuantity" INTEGER NOT NULL DEFAULT 0,
    "remainingDefectiveQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "remainingCost" DECIMAL(18,2),
    "availableAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryStockLot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderItemAllocation"
    ADD COLUMN "stockLotId" TEXT,
    ALTER COLUMN "purchaseItemId" DROP NOT NULL;

-- ყოველი მიღებული სტრიქონის ნაშთი გადადის უცვლელად.
-- NULL თვითღირებულება NULL-ადვე რჩება.
INSERT INTO "InventoryStockLot" (
    "id",
    "inventoryItemId",
    "purchaseItemId",
    "sourcePurchaseItemId",
    "quantity",
    "remainingQuantity",
    "defectiveQuantity",
    "remainingDefectiveQuantity",
    "unitCost",
    "remainingCost",
    "availableAt",
    "createdAt",
    "updatedAt"
)
SELECT
    pi.id,
    pi."inventoryItemId",
    pi.id,
    NULL,
    pi.quantity,
    pi."remainingQuantity",
    pi."defectiveQuantity",
    pi."remainingDefectiveQuantity",
    pi."finalUnitCost",
    pi."remainingCost",
    p."purchaseDate",
    pi."createdAt",
    pi."updatedAt"
FROM "PurchaseItem" pi
JOIN "Purchase" p ON p.id = pi."purchaseId"
WHERE p."receiptStatus" = 'RECEIVED';

-- შეკვეთების ფასებსა და თვითღირებულებებს არ ვეხებით.
UPDATE "OrderItemAllocation" a
SET "stockLotId" = lot.id
FROM "InventoryStockLot" lot
WHERE lot."purchaseItemId" = a."purchaseItemId";

ALTER TABLE "OrderItemAllocation"
    DROP CONSTRAINT "OrderItemAllocation_purchaseItemId_fkey";

DROP INDEX "OrderItemAllocation_orderItemId_purchaseItemId_condition_key";

CREATE INDEX "InventoryStockLot_inventoryItemId_availableAt_id_idx"
    ON "InventoryStockLot" ("inventoryItemId", "availableAt", "id");

CREATE INDEX "InventoryStockLot_purchaseItemId_idx"
    ON "InventoryStockLot" ("purchaseItemId");

CREATE INDEX "InventoryStockLot_sourcePurchaseItemId_idx"
    ON "InventoryStockLot" ("sourcePurchaseItemId");

CREATE INDEX "OrderItemAllocation_stockLotId_idx"
    ON "OrderItemAllocation" ("stockLotId");

CREATE UNIQUE INDEX "OrderItemAllocation_orderItemId_stockLotId_condition_key"
    ON "OrderItemAllocation" ("orderItemId", "stockLotId", "condition");

ALTER TABLE "OrderItemAllocation"
    ADD CONSTRAINT "OrderItemAllocation_purchaseItemId_fkey"
    FOREIGN KEY ("purchaseItemId")
    REFERENCES "PurchaseItem" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderItemAllocation"
    ADD CONSTRAINT "OrderItemAllocation_stockLotId_fkey"
    FOREIGN KEY ("stockLotId")
    REFERENCES "InventoryStockLot" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryStockLot"
    ADD CONSTRAINT "InventoryStockLot_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId")
    REFERENCES "InventoryItem" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryStockLot"
    ADD CONSTRAINT "InventoryStockLot_purchaseItemId_fkey"
    FOREIGN KEY ("purchaseItemId")
    REFERENCES "PurchaseItem" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryStockLot"
    ADD CONSTRAINT "InventoryStockLot_sourcePurchaseItemId_fkey"
    FOREIGN KEY ("sourcePurchaseItemId")
    REFERENCES "PurchaseItem" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- გადატანის შედეგების შემოწმება.
DO $$
BEGIN
    IF (
        SELECT COUNT(*) FROM "InventoryStockLot"
    ) <> (
        SELECT COUNT(*)
        FROM "PurchaseItem" pi
        JOIN "Purchase" p ON p.id = pi."purchaseId"
        WHERE p."receiptStatus" = 'RECEIVED'
    ) THEN
        RAISE EXCEPTION
            'Stock migration stopped: transferred row count mismatch.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "PurchaseItem" pi
        JOIN "Purchase" p ON p.id = pi."purchaseId"
        LEFT JOIN "InventoryStockLot" lot ON lot.id = pi.id
        WHERE p."receiptStatus" = 'RECEIVED'
            AND (
                lot.id IS NULL
                OR lot."purchaseItemId" IS DISTINCT FROM pi.id
                OR lot."inventoryItemId" IS DISTINCT FROM pi."inventoryItemId"
                OR lot.quantity IS DISTINCT FROM pi.quantity
                OR lot."remainingQuantity" IS DISTINCT FROM pi."remainingQuantity"
                OR lot."defectiveQuantity" IS DISTINCT FROM pi."defectiveQuantity"
                OR lot."remainingDefectiveQuantity" IS DISTINCT FROM pi."remainingDefectiveQuantity"
                OR lot."unitCost" IS DISTINCT FROM pi."finalUnitCost"
                OR lot."remainingCost" IS DISTINCT FROM pi."remainingCost"
                OR lot."availableAt" IS DISTINCT FROM p."purchaseDate"
            )
    ) THEN
        RAISE EXCEPTION
            'Stock migration stopped: transferred balances or costs changed.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "OrderItemAllocation" a
        LEFT JOIN "InventoryStockLot" lot ON lot.id = a."stockLotId"
        WHERE lot.id IS NULL
            OR lot."purchaseItemId" IS DISTINCT FROM a."purchaseItemId"
    ) THEN
        RAISE EXCEPTION
            'Stock migration stopped: an order allocation was not linked.';
    END IF;
END;
$$;

COMMIT;