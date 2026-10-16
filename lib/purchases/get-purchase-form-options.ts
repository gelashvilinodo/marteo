import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { ComponentProps } from "react";
import type NewPurchasePanel from "@/components/dashboard/purchases/NewPurchasePanel";

type FormOptions = Pick<
    ComponentProps<typeof NewPurchasePanel>,
    "inventoryOptions" | "attributeOptions"
>;

type QueryReader = {
    $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
};

export async function getPurchaseFormOptions(
    reader: QueryReader,
    businessId: string,
): Promise<FormOptions> {
    const [row] = await reader.$queryRaw<
        Array<{ data: FormOptions }>
    >(Prisma.sql`
        WITH eligible_lots AS (
            SELECT
                lot.id,
                lot."inventoryItemId",
                lot."remainingQuantity",
                lot."remainingDefectiveQuantity",
                lot."availableAt",
                lot."createdAt",
                source."unitPurchasePrice"
            FROM "InventoryStockLot" lot
            JOIN "InventoryItem" i
                ON i.id = lot."inventoryItemId"
            LEFT JOIN "PurchaseItem" source
                ON source.id = lot."purchaseItemId"
            LEFT JOIN "Purchase" purchase
                ON purchase.id = source."purchaseId"
            WHERE i."businessId" = ${businessId}
                AND i."isActive" = TRUE
                AND (
                    lot."purchaseItemId" IS NULL
                    OR (
                        purchase."businessId" = ${businessId}
                        AND purchase."receiptStatus" = 'RECEIVED'
                    )
                )
        ),
        balances AS (
            SELECT
                "inventoryItemId",
                SUM("remainingQuantity") AS total,
                SUM("remainingDefectiveQuantity") AS defective
            FROM eligible_lots
            GROUP BY "inventoryItemId"
        ),
        latest_prices AS (
            SELECT DISTINCT ON ("inventoryItemId")
                "inventoryItemId",
                "unitPurchasePrice"
            FROM eligible_lots
            WHERE "unitPurchasePrice" IS NOT NULL
            ORDER BY
                "inventoryItemId",
                "availableAt" DESC,
                "createdAt" DESC,
                id DESC
        ),
        inventory AS (
            SELECT
                i.id,
                i."productId",
                i.sku,
                p.name,
                COALESCE(p.category, '') AS category,
                COALESCE(p.brand, '') AS brand,
                COALESCE(p.description, '') AS description,
                COALESCE(i.color, '') AS color,
                COALESCE(i.size, '') AS size,
                COALESCE(i."imageUrl", '') AS "imageUrl",
                (b.total - b.defective)::int AS "currentStock",
                COALESCE(
                    price."unitPurchasePrice"::text,
                    ''
                ) AS "unitPurchasePrice",
                COALESCE(
                    i."pricingMethod"::text,
                    'MANUAL'
                ) AS "pricingMethod",
                CASE
                    WHEN i."pricingMethod" IS NOT NULL
                        AND i."pricingMethod" <> 'MANUAL'
                    THEN COALESCE(i."pricingValue"::text, '')
                    ELSE COALESCE(i."salePrice"::text, '')
                END AS "pricingValue"
            FROM "InventoryItem" i
            JOIN "Product" p ON p.id = i."productId"
            JOIN balances b ON b."inventoryItemId" = i.id
            LEFT JOIN latest_prices price
                ON price."inventoryItemId" = i.id
            WHERE i."businessId" = ${businessId}
                AND p."businessId" = ${businessId}
                AND i."isActive" = TRUE
        ),
        attributes AS (
            SELECT
                COALESCE(
                    JSONB_AGG(name ORDER BY name)
                        FILTER (WHERE type = 'CATEGORY'),
                    '[]'::jsonb
                ) AS categories,
                COALESCE(
                    JSONB_AGG(name ORDER BY name)
                        FILTER (WHERE type = 'BRAND'),
                    '[]'::jsonb
                ) AS brands,
                COALESCE(
                    JSONB_AGG(name ORDER BY name)
                        FILTER (WHERE type = 'COLOR'),
                    '[]'::jsonb
                ) AS colors,
                COALESCE(
                    JSONB_AGG(name ORDER BY name)
                        FILTER (WHERE type = 'SIZE'),
                    '[]'::jsonb
                ) AS sizes
            FROM "ProductAttribute"
            WHERE "businessId" = ${businessId}
        )
        SELECT JSONB_BUILD_OBJECT(
            'inventoryOptions',
            COALESCE(
                (
                    SELECT JSONB_AGG(
                        TO_JSONB(i) ORDER BY i.name, i.id
                    )
                    FROM inventory i
                ),
                '[]'::jsonb
            ),
            'attributeOptions',
            JSONB_BUILD_OBJECT(
                'name',
                COALESCE(
                    (
                        SELECT JSONB_AGG(n.name ORDER BY n.name)
                        FROM (
                            SELECT DISTINCT name
                            FROM "Product"
                            WHERE "businessId" = ${businessId}
                        ) n
                    ),
                    '[]'::jsonb
                ),
                'category', a.categories,
                'brand', a.brands,
                'color', a.colors,
                'size', a.sizes
            )
        ) AS data
        FROM attributes a
    `);

    if (!row) {
        throw new Error("Purchase form options were not returned");
    }

    return row.data;
}