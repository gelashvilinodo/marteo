import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";

type RankingsSnapshot = {
    products: Array<{
        key: string;
        name: string;
        imageUrl: string | null;
        quantity: string;
    }>;
    customers: Array<{
        id: string;
        firstName: string | null;
        lastName: string | null;
        phone: string;
        orders: string;
    }>;
};

export async function getStatisticsRankings(
    prisma: Pick<ReturnType<typeof createPrismaClient>, "$queryRaw">,
    businessId: string,
    from: string,
    to: string,
) {
    const start = new Date(`${from}T00:00:00+04:00`);
    const end = new Date(
        new Date(`${to}T00:00:00+04:00`).getTime() + 86400000,
    );

    const [result] = await prisma.$queryRaw<
        Array<{ snapshot: RankingsSnapshot }>
    >(Prisma.sql`
        WITH product_movements AS (
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
                i."quantityDelta" AS quantity
            FROM "OrderFinancialEntryItem" i
            JOIN "OrderFinancialEntry" f ON f.id = i."entryId"
            LEFT JOIN "OrderItem" oi
                ON oi.id = i."sourceOrderItemId"
            WHERE f."businessId" = ${businessId}
                AND f."occurredAt" >= ${start}
                AND f."occurredAt" < ${end}
        ),
        product_totals AS (
            SELECT
                product_key,
                MAX(name) AS name,
                MAX(image_url) AS image_url,
                SUM(quantity) AS quantity
            FROM product_movements
            GROUP BY product_key
            HAVING SUM(quantity) > 0
        ),
        top_products AS (
            SELECT *
            FROM product_totals
            ORDER BY quantity DESC, name ASC, product_key ASC
            LIMIT 5
        ),
        first_completions AS (
            SELECT
                f."orderId" AS order_id,
                MIN(f."occurredAt") AS completed_at
            FROM "OrderFinancialEntry" f
            WHERE f."businessId" = ${businessId}
                AND f.kind = 'SALE'
                AND f."orderId" IS NOT NULL
            GROUP BY f."orderId"
        ),
        customer_totals AS (
            SELECT
                c.id,
                c."firstName" AS first_name,
                c."lastName" AS last_name,
                c.phone,
                COUNT(*) AS orders
            FROM first_completions f
            JOIN "Order" o ON o.id = f.order_id
            JOIN "Customer" c ON c.id = o."customerId"
            WHERE o."businessId" = ${businessId}
                AND c."businessId" = ${businessId}
                AND f.completed_at >= ${start}
                AND f.completed_at < ${end}
            GROUP BY c.id, c."firstName", c."lastName", c.phone
        ),
        top_customers AS (
            SELECT *
            FROM customer_totals
            ORDER BY
                orders DESC,
                COALESCE(first_name, '') ASC,
                phone ASC,
                id ASC
            LIMIT 5
        )
        SELECT JSONB_BUILD_OBJECT(
            'products',
            COALESCE(
                (
                    SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'key', product_key,
                            'name', name,
                            'imageUrl', image_url,
                            'quantity', quantity::text
                        )
                        ORDER BY quantity DESC, name ASC, product_key ASC
                    )
                    FROM top_products
                ),
                '[]'::jsonb
            ),
            'customers',
            COALESCE(
                (
                    SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                            'id', id,
                            'firstName', first_name,
                            'lastName', last_name,
                            'phone', phone,
                            'orders', orders::text
                        )
                        ORDER BY
                            orders DESC,
                            COALESCE(first_name, '') ASC,
                            phone ASC,
                            id ASC
                    )
                    FROM top_customers
                ),
                '[]'::jsonb
            )
        ) AS snapshot
    `);

    if (!result) {
        throw new Error("სტატისტიკის რეიტინგები ვერ ჩაიტვირთა.");
    }

    function quantity(value: string) {
        const number = Number(value);

        if (!Number.isSafeInteger(number) || number < 0) {
            throw new Error("რეიტინგის რაოდენობა ვერ დამუშავდა.");
        }

        return number;
    }

    return {
        products: result.snapshot.products.map(product => ({
            ...product,
            quantity: quantity(product.quantity),
        })),
        customers: result.snapshot.customers.map(customer => ({
            ...customer,
            orders: quantity(customer.orders),
        })),
    };
}

export type StatisticsRankings = Awaited<
    ReturnType<typeof getStatisticsRankings>
>;