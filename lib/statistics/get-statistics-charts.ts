import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";

export type StatisticsBucket = "day" | "week" | "month";

type ChartSnapshot = {
    orders: Array<{
        from: string;
        to: string;
        count: number;
    }>;
    payments: Array<{
        method: "CASH" | "CARD" | "BANK_TRANSFER" | "UNKNOWN";
        amount: string;
    }>;
};

export async function getStatisticsCharts(
    prisma: Pick<ReturnType<typeof createPrismaClient>, "$queryRaw">,
    businessId: string,
    from: string,
    to: string,
) {
    const startDate = new Date(`${from}T00:00:00.000Z`);
    const endDate = new Date(`${to}T00:00:00.000Z`);
    const days =
        Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

    if (!Number.isSafeInteger(days) || days < 1) {
        throw new Error("დიაგრამის პერიოდი არასწორია.");
    }

    const bucket: StatisticsBucket =
        days <= 31 ? "day" : days <= 120 ? "week" : "month";

    const interval =
        bucket === "day"
            ? "1 day"
            : bucket === "week"
                ? "1 week"
                : "1 month";

    const start = new Date(`${from}T00:00:00+04:00`);
    const end = new Date(
        new Date(`${to}T00:00:00+04:00`).getTime() + 86400000,
    );

    const [result] = await prisma.$queryRaw<
        Array<{ snapshot: ChartSnapshot }>
    >(Prisma.sql`
        WITH first_completions AS (
            SELECT
                COALESCE(f."orderId", 'historical:' || f.id) AS order_key,
                MIN(f."occurredAt") AS completed_at
            FROM "OrderFinancialEntry" f
            WHERE f."businessId" = ${businessId}
                AND NOT EXISTS (
                    SELECT 1
                    FROM "Order" pending
                    WHERE pending.id = f."orderId"
                        AND pending."businessId" = f."businessId"
                        AND pending."analyticsPendingCost" = TRUE
                )
                AND f.kind = 'SALE'
            GROUP BY COALESCE(
                f."orderId",
                'historical:' || f.id
            )
        ),
        order_counts AS (
            SELECT
                DATE_TRUNC(
                    ${bucket},
                    completed_at + INTERVAL '4 hours'
                )::date AS bucket_date,
                COUNT(*)::int AS count
            FROM first_completions
            WHERE completed_at >= ${start}
                AND completed_at < ${end}
            GROUP BY 1
        ),
        buckets AS (
            SELECT generated::date AS bucket_date
            FROM GENERATE_SERIES(
                DATE_TRUNC(
                    ${bucket},
                    ${from}::date::timestamp
                ),
                DATE_TRUNC(
                    ${bucket},
                    ${to}::date::timestamp
                ),
                ${interval}::interval
            ) AS generated
        ),
        payment_totals AS (
            SELECT
                p.method::text AS method,
                SUM(p.amount) AS amount
            FROM "OrderPayment" p
            JOIN "Order" o ON o.id = p."orderId"
            WHERE o."businessId" = ${businessId}
                AND o."analyticsPendingCost" = FALSE
                AND p.amount > 0
                AND p."createdAt" >= ${start}
                AND p."createdAt" < ${end}
            GROUP BY p.method
        ),
        methods AS (
            SELECT *
            FROM (
                VALUES
                    ('CASH', 1),
                    ('CARD', 2),
                    ('BANK_TRANSFER', 3),
                    ('UNKNOWN', 4)
            ) AS available(method, position)
        )
        SELECT JSONB_BUILD_OBJECT(
            'orders',
            (
                SELECT JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'from',
                        GREATEST(
                            b.bucket_date,
                            ${from}::date
                        )::text,
                        'to',
                        LEAST(
                            (
                                b.bucket_date::timestamp +
                                ${interval}::interval -
                                INTERVAL '1 day'
                            )::date,
                            ${to}::date
                        )::text,
                        'count', COALESCE(c.count, 0)
                    )
                    ORDER BY b.bucket_date
                )
                FROM buckets b
                LEFT JOIN order_counts c
                    ON c.bucket_date = b.bucket_date
            ),
            'payments',
            (
                SELECT JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'method', m.method,
                        'amount', COALESCE(p.amount, 0)::text
                    )
                    ORDER BY m.position
                )
                FROM methods m
                LEFT JOIN payment_totals p
                    ON p.method = m.method
            )
        ) AS snapshot
    `);

    if (!result) {
        throw new Error("დიაგრამების მონაცემები ვერ ჩაიტვირთა.");
    }

    const payments = result.snapshot.payments.map(payment => ({
        ...payment,
        amount: new Prisma.Decimal(payment.amount).toFixed(2),
    }));

    const receivedTotal = payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
    );

    return {
        bucket,
        orders: result.snapshot.orders,
        payments,
        receivedTotal: receivedTotal.toFixed(2),
    };
}

export type StatisticsCharts = Awaited<
    ReturnType<typeof getStatisticsCharts>
>;