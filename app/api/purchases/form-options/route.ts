import type { ComponentProps } from "react";
import type NewPurchasePanel from "@/components/dashboard/purchases/NewPurchasePanel";

import { getPgDashboardContext } from "@/lib/auth/pg-dashboard-context";
import { createPgReader } from "@/lib/database/pg-reader";
import { orderJson } from "@/lib/orders/order-http";

type PanelProps = ComponentProps<typeof NewPurchasePanel>;

type FormOptions = Pick<
    PanelProps,
    "inventoryOptions" | "attributeOptions"
>;

export async function GET() {
    const context = await getPgDashboardContext();

    if (!context) {
        return orderJson(
            { success: false, message: "გაიარე ავტორიზაცია." },
            401,
        );
    }

    if (!context.membership) {
        return orderJson(
            { success: false, message: "ბიზნესი ვერ მოიძებნა." },
            403,
        );
    }

    const businessId = context.membership.businessId;
    const reader = createPgReader();

    try {
        const [row] = await reader.$queryRaw<
            Array<{ data: FormOptions }>
        >`
            WITH received_items AS (
                SELECT
                    pi."inventoryItemId",
                    pi."unitPurchasePrice",
                    pi."remainingDefectiveQuantity",
                    pi."createdAt",
                    pi.id,
                    p."purchaseDate"
                FROM "PurchaseItem" pi
                JOIN "Purchase" p ON p.id = pi."purchaseId"
                WHERE p."businessId" = ${businessId}
                    AND p."receiptStatus" = 'RECEIVED'
            ),
            balances AS (
                SELECT
                    "inventoryItemId",
                    SUM("remainingDefectiveQuantity") AS defective
                FROM received_items
                GROUP BY "inventoryItemId"
            ),
            latest_prices AS (
                SELECT DISTINCT ON ("inventoryItemId")
                    "inventoryItemId",
                    "unitPurchasePrice"
                FROM received_items
                ORDER BY
                    "inventoryItemId",
                    "purchaseDate" DESC,
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
                    (
                        i."currentStock" - b.defective
                    )::int AS "currentStock",
                    l."unitPurchasePrice"::text AS "unitPurchasePrice",
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
                JOIN latest_prices l ON l."inventoryItemId" = i.id
                WHERE i."businessId" = ${businessId}
                    AND p."businessId" = ${businessId}
                    AND i."isActive" = TRUE
            ),
            attributes AS (
                SELECT type, name
                FROM "ProductAttribute"
                WHERE "businessId" = ${businessId}
            )
            SELECT JSONB_BUILD_OBJECT(
                'inventoryOptions',
                COALESCE(
                    (
                        SELECT JSONB_AGG(
                            TO_JSONB(i)
                            ORDER BY i.name, i.id
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
                    'category',
                    COALESCE(
                        (
                            SELECT JSONB_AGG(name ORDER BY name)
                            FROM attributes WHERE type = 'CATEGORY'
                        ),
                        '[]'::jsonb
                    ),
                    'brand',
                    COALESCE(
                        (
                            SELECT JSONB_AGG(name ORDER BY name)
                            FROM attributes WHERE type = 'BRAND'
                        ),
                        '[]'::jsonb
                    ),
                    'color',
                    COALESCE(
                        (
                            SELECT JSONB_AGG(name ORDER BY name)
                            FROM attributes WHERE type = 'COLOR'
                        ),
                        '[]'::jsonb
                    ),
                    'size',
                    COALESCE(
                        (
                            SELECT JSONB_AGG(name ORDER BY name)
                            FROM attributes WHERE type = 'SIZE'
                        ),
                        '[]'::jsonb
                    )
                )
            ) AS data
        `;

        if (!row) {
            throw new Error("Missing purchase form options");
        }

        return orderJson({
            success: true,
            data: row.data,
        });
    } catch (cause: unknown) {
        console.error(
            "Purchase form options failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return orderJson(
            {
                success: false,
                message: "პარტიის ფორმის მონაცემები ვერ ჩაიტვირთა. სცადე ხელახლა.",
            },
            500,
        );
    } finally {
        await reader.$disconnect();
    }
}