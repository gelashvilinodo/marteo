import "server-only";

import { createPgReader } from "@/lib/database/pg-reader";

export type HomeTrendPoint = {
    date: string;
    sales: string;
    profit: string | null;
};

export type HomeTrend = {
    bucket: "day" | "month" | "year";
    points: HomeTrendPoint[];
};

export async function getHomeTrend(
    businessId: string,
    from: string,
    to: string,
    profitReady: boolean,
): Promise<HomeTrend> {
    const firstDay = new Date(`${from}T00:00:00Z`);
    const lastDay = new Date(`${to}T00:00:00Z`);

    const days =
        Math.round(
            (lastDay.getTime() - firstDay.getTime()) /
            86_400_000,
        ) + 1;

    const bucket =
        days <= 31
            ? "day"
            : days <= 366
                ? "month"
                : "year";

    const step =
        bucket === "day"
            ? "1 day"
            : bucket === "month"
                ? "1 month"
                : "1 year";

    const start = new Date(`${from}T00:00:00+04:00`);
    const end = new Date(
        new Date(`${to}T00:00:00+04:00`).getTime() +
        86_400_000,
    );

    const reader = createPgReader();

    try {
        const points = await reader.$queryRaw<HomeTrendPoint[]>`
            WITH movements AS (
                SELECT
                    (
                        f."occurredAt" + INTERVAL '4 hours'
                    )::date AS day,
                    f."productRevenueDelta" +
                        f."deliveryRevenueDelta" AS sales,
                    f."costOfGoodsDelta" AS costs,
                    0::numeric AS expenses,
                    f."costComplete" AS complete
                FROM "OrderFinancialEntry" f
                WHERE f."businessId" = ${businessId}
                    AND f."occurredAt" >= ${start}
                    AND f."occurredAt" < ${end}

                UNION ALL

                SELECT
                    (
                        e."expenseDate" + INTERVAL '4 hours'
                    )::date AS day,
                    0::numeric AS sales,
                    0::numeric AS costs,
                    e.amount AS expenses,
                    TRUE AS complete
                FROM "Expense" e
                WHERE e."businessId" = ${businessId}
                    AND e."expenseDate" >= ${start}
                    AND e."expenseDate" < ${end}
                    UNION ALL

SELECT
    (w."createdAt" + INTERVAL '4 hours')::date AS day,
    0::numeric AS sales,
    0::numeric AS costs,
    w."totalCost" AS expenses,
    TRUE AS complete
FROM "InventoryWriteOff" w
WHERE w."businessId" = ${businessId}
    AND w."createdAt" >= ${start}
    AND w."createdAt" < ${end}
            ),
            grouped AS (
                SELECT
                    DATE_TRUNC(
                        ${bucket}::text,
                        day::timestamp
                    )::date AS date,
                    SUM(sales) AS sales,
                    SUM(costs) AS costs,
                    SUM(expenses) AS expenses,
                    BOOL_AND(complete) AS complete
                FROM movements
                GROUP BY 1
            ),
            buckets AS (
                SELECT value::date AS date
                FROM GENERATE_SERIES(
                    DATE_TRUNC(
                        ${bucket}::text,
                        ${from}::date::timestamp
                    ),
                    DATE_TRUNC(
                        ${bucket}::text,
                        ${to}::date::timestamp
                    ),
                    ${step}::interval
                ) AS series(value)
            )
            SELECT
                b.date::text AS date,
                ROUND(
                    COALESCE(g.sales, 0),
                    2
                )::text AS sales,
                CASE
                    WHEN ${profitReady}::boolean
                        AND COALESCE(g.complete, TRUE)
                    THEN ROUND(
                        COALESCE(g.sales, 0) -
                        COALESCE(g.costs, 0) -
                        COALESCE(g.expenses, 0),
                        2
                    )::text
                    ELSE NULL
                END AS profit
            FROM buckets b
            LEFT JOIN grouped g ON g.date = b.date
            ORDER BY b.date ASC
        `;

        return { bucket, points };
    } finally {
        await reader.$disconnect();
    }
}