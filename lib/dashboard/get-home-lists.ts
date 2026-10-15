import "server-only";

import { createPgReader } from "@/lib/database/pg-reader";

export type HomeRecentOrder = {
    id: string;
    number: number | null;
    recipientName: string;
    status: string;
    total: string;
    invalidReturns: boolean;
};

export type HomeTopProduct = {
    key: string;
    name: string;
    imageUrl: string | null;
    quantity: string;
    revenue: string;
};

export type HomeLists = {
    orders: HomeRecentOrder[];
    products: HomeTopProduct[];
};

export async function getHomeLists(
    businessId: string,
    from: string,
    to: string,
    section: "all" | "orders" | "products" = "all",
): Promise<HomeLists> {
    const includeOrders = section !== "products";
    const includeProducts = section !== "orders";
    const start = new Date(`${from}T00:00:00+04:00`);
    const end = new Date(
        new Date(`${to}T00:00:00+04:00`).getTime() +
        86_400_000,
    );

    const reader = createPgReader();

    try {
        const [row] = await reader.$queryRaw<
            Array<{ data: HomeLists }>
        >`
            WITH recent AS (
                SELECT
                    o.id,
                    o.number,
                    o."createdAt",
                    o."fulfillmentCycle",
                    o."stockReturnedAt",
                    o."courierFee",
                    o.status::text AS status,
                    COALESCE(
                        NULLIF(
                            TRIM(CONCAT_WS(
                                ' ',
                                o."recipientFirstName",
                                o."recipientLastName"
                            )),
                            ''
                        ),
                        o."recipientPhone"
                    ) AS recipient_name
                FROM "Order" o
                WHERE ${includeOrders}::boolean
    AND o."businessId" = ${businessId}
    AND o."deletedAt" IS NULL
                ORDER BY o."createdAt" DESC, o.id DESC
                LIMIT 5
            ),
            received_returns AS (
                SELECT
                    ri."orderItemId",
                    SUM(ri.quantity) AS quantity
                FROM recent o
                JOIN "OrderReturn" r ON r."orderId" = o.id
                JOIN "OrderReturnItem" ri ON ri."returnId" = r.id
                WHERE r.status = 'RECEIVED'
                    AND r."fulfillmentCycle" = o."fulfillmentCycle"
                GROUP BY ri."orderItemId"
            ),
            recent_totals AS (
                SELECT
                    o.id,
                    o.number,
                    o."createdAt",
                    o.recipient_name,
                    o.status,
                    o."courierFee" + COALESCE(
                        SUM(
                            CASE
                                WHEN o."stockReturnedAt" IS NOT NULL
                                THEN 0
                                ELSE (
                                    i.quantity -
                                    COALESCE(r.quantity, 0)
                                ) * i."unitPrice"
                            END
                        ),
                        0
                    ) AS total,
                    COALESCE(
                        BOOL_OR(
                            COALESCE(r.quantity, 0) < 0
                            OR COALESCE(r.quantity, 0) > i.quantity
                        ),
                        FALSE
                    ) AS invalid_returns
                FROM recent o
                LEFT JOIN "OrderItem" i
                    ON i."orderId" = o.id
                    AND i."isActive" = TRUE
                LEFT JOIN received_returns r
                    ON r."orderItemId" = i.id
                GROUP BY
                    o.id,
                    o.number,
                    o."createdAt",
                    o.recipient_name,
                    o.status,
                    o."courierFee"
            ),
            product_movements AS (
                SELECT
                    CASE
                        WHEN oi."inventoryItemId" IS NOT NULL
                        THEN 'inventory:' || oi."inventoryItemId"
                        WHEN oi.source = 'MANUAL'
                        THEN 'manual:' || JSONB_BUILD_ARRAY(
                            LOWER(TRIM(i.name)),
                            COALESCE(oi.color, ''),
                            COALESCE(oi.size, '')
                        )::text
                        ELSE 'historical:' || i."sourceOrderItemId"
                    END AS product_key,
                    i.name,
                    oi."imageUrl" AS image_url,
                    i."quantityDelta" AS quantity,
                    i."revenueDelta" AS revenue
                FROM "OrderFinancialEntry" f
                JOIN "OrderFinancialEntryItem" i
                    ON i."entryId" = f.id
                LEFT JOIN "OrderItem" oi
                    ON oi.id = i."sourceOrderItemId"
                WHERE ${includeProducts}::boolean
    AND f."businessId" = ${businessId}
    AND f."occurredAt" >= ${start}
                    AND f."occurredAt" < ${end}
            ),
            top_products AS (
                SELECT
                    product_key,
                    MAX(name) AS name,
                    MAX(image_url) AS image_url,
                    SUM(quantity) AS quantity,
                    SUM(revenue) AS revenue
                FROM product_movements
                GROUP BY product_key
                HAVING SUM(quantity) > 0
                ORDER BY
                    SUM(quantity) DESC,
                    MAX(name) ASC,
                    product_key ASC
                LIMIT 5
            )
            SELECT JSONB_BUILD_OBJECT(
                'orders',
                COALESCE(
                    (
                        SELECT JSONB_AGG(
                            JSONB_BUILD_OBJECT(
                                'id', o.id,
                                'number', o.number,
                                'recipientName', o.recipient_name,
                                'status', o.status,
                                'total', ROUND(o.total, 2)::text,
                                'invalidReturns', o.invalid_returns
                            )
                            ORDER BY o."createdAt" DESC, o.id DESC
                        )
                        FROM recent_totals o
                    ),
                    '[]'::jsonb
                ),
                'products',
                COALESCE(
                    (
                        SELECT JSONB_AGG(
                            JSONB_BUILD_OBJECT(
                                'key', p.product_key,
                                'name', p.name,
                                'imageUrl', p.image_url,
                                'quantity', p.quantity::text,
                                'revenue', ROUND(p.revenue, 2)::text
                            )
                            ORDER BY
                                p.quantity DESC,
                                p.name ASC,
                                p.product_key ASC
                        )
                        FROM top_products p
                    ),
                    '[]'::jsonb
                )
            ) AS data
        `;

        if (!row) {
            throw new Error("მთავარი გვერდის სიები ვერ ჩაიტვირთა.");
        }

        if (row.data.orders.some(order => order.invalidReturns)) {
            throw new Error(
                "შეკვეთის დაბრუნებული რაოდენობა არასწორია.",
            );
        }

        return row.data;
    } finally {
        await reader.$disconnect();
    }
}