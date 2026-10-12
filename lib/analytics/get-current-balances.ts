import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";

type BalanceRow = {
    receivable: string;
    refundable: string;
    receivableOrders: number;
    refundableOrders: number;
    invalidItems: number;
};

export async function getCurrentBalances(
    prisma: Pick<
        ReturnType<typeof createPrismaClient>,
        "$queryRaw"
    >,
    businessId: string,
) {
    const [row] = await prisma.$queryRaw<BalanceRow[]>(
        Prisma.sql`
            WITH scoped_orders AS (
                SELECT
                    o.id,
                    o.status,
                    o."courierFee",
                    o."stockReturnedAt",
                    o."fulfillmentCycle"
                FROM "Order" o
                WHERE o."businessId" = ${businessId}
            ),
            received AS (
                SELECT
                    ri."orderItemId",
                    SUM(ri.quantity) AS quantity
                FROM "OrderReturnItem" ri
                JOIN "OrderReturn" r
                    ON r.id = ri."returnId"
                JOIN scoped_orders o
                    ON o.id = r."orderId"
                    AND o."fulfillmentCycle" =
                        r."fulfillmentCycle"
                WHERE r.status = 'RECEIVED'
                GROUP BY ri."orderItemId"
            ),
            product_totals AS (
                SELECT
                    i."orderId",
                    SUM(
                        CASE
                            WHEN o."stockReturnedAt" IS NOT NULL
                            THEN 0
                            ELSE i."unitPrice" * (
                                i.quantity -
                                COALESCE(r.quantity, 0)
                            )
                        END
                    ) AS total,
                    COUNT(*) FILTER (
                        WHERE COALESCE(r.quantity, 0) < 0
                            OR COALESCE(r.quantity, 0) >
                                i.quantity
                    ) AS invalid_items
                FROM "OrderItem" i
                JOIN scoped_orders o
                    ON o.id = i."orderId"
                LEFT JOIN received r
                    ON r."orderItemId" = i.id
                WHERE i."isActive" = TRUE
                GROUP BY i."orderId"
            ),
            paid_totals AS (
                SELECT
                    p."orderId",
                    SUM(p.amount) AS total
                FROM "OrderPayment" p
                JOIN scoped_orders o
                    ON o.id = p."orderId"
                GROUP BY p."orderId"
            ),
            balances AS (
    SELECT
        o.status,
        (
            o.status NOT IN ('CANCELED', 'RETURNED')
            AND NOT (
                o.status = 'PROCESSING'
                AND o."stockReturnedAt" IS NOT NULL
            )
        ) AS should_collect,
        COALESCE(i.total, 0) +
            o."courierFee" AS payable,
                    COALESCE(p.total, 0) AS paid,
                    COALESCE(i.invalid_items, 0) AS invalid_items
                FROM scoped_orders o
                LEFT JOIN product_totals i
                    ON i."orderId" = o.id
                LEFT JOIN paid_totals p
                    ON p."orderId" = o.id
            )
            SELECT
                COALESCE(
                    SUM(GREATEST(payable - paid, 0))
    FILTER (
        WHERE should_collect
    ),
                    0
                )::text AS receivable,
                COALESCE(
                    SUM(GREATEST(paid - payable, 0)),
                    0
                )::text AS refundable,
                COUNT(*) FILTER (
    WHERE payable > paid
        AND should_collect
)::int AS "receivableOrders",
                COUNT(*) FILTER (
                    WHERE paid > payable
                )::int AS "refundableOrders",
                COALESCE(
                    SUM(invalid_items),
                    0
                )::int AS "invalidItems"
            FROM balances
        `,
    );

    if (!row) {
        throw new Error(
            "მიმდინარე ფინანსური ნაშთები ვერ ჩაიტვირთა.",
        );
    }

    if (row.invalidItems > 0) {
        throw new Error(
            "დაბრუნებული რაოდენობა შეკვეთის რაოდენობას არ შეესაბამება.",
        );
    }

    return {
        receivable: new Prisma.Decimal(
            row.receivable,
        ).toFixed(2),
        refundable: new Prisma.Decimal(
            row.refundable,
        ).toFixed(2),
        receivableOrders: row.receivableOrders,
        refundableOrders: row.refundableOrders,
    };
}