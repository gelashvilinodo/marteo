import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import { resolveOrdersPeriod } from "@/lib/orders/orders-period";

export type FinancialTrendPeriod =
    | "week"
    | "month"
    | "year";

type TrendRow = {
    date: string;
    sales: string;
    costOfGoods: string;
    expenses: string;
    costComplete: boolean;
};

export type FinancialTrendPoint = {
    date: string;
    sales: string;
    costs: string;
    profit: string | null;
};

export async function getFinancialTrend(
    prisma: Pick<
        ReturnType<typeof createPrismaClient>,
        "$queryRaw"
    >,
    businessId: string,
    period: FinancialTrendPeriod = "week",
    now = new Date(),
): Promise<FinancialTrendPoint[]> {
    const today = new Date(
        now.getTime() + 4 * 60 * 60 * 1000,
    ).toISOString().slice(0, 10);

    const localDay = new Date(
        `${today}T00:00:00.000Z`,
    );

    const yearFrom = new Date(
        Date.UTC(
            localDay.getUTCFullYear(),
            localDay.getUTCMonth() - 11,
            1,
        ),
    ).toISOString().slice(0, 10);

    const range =
        period === "year"
            ? resolveOrdersPeriod(
                "custom",
                yearFrom,
                today,
                now,
            )
            : resolveOrdersPeriod(
                period,
                "",
                "",
                now,
            );

    const bucket =
        period === "year" ? "month" : "day";

    const rows = await prisma.$queryRaw<TrendRow[]>(
        Prisma.sql`
            WITH movements AS (
                SELECT
                    (
                        f."occurredAt" + INTERVAL '4 hours'
                    )::date AS day,
                    f."productRevenueDelta" +
                        f."deliveryRevenueDelta" AS sales,
                    f."costOfGoodsDelta" AS cost_of_goods,
                    0::numeric AS expenses,
                    f."costComplete" AS cost_complete
                FROM "OrderFinancialEntry" f
                WHERE f."businessId" = ${businessId}
                    AND f."occurredAt" >= ${range.start}
                    AND f."occurredAt" < ${range.end}

                UNION ALL

                SELECT
                    (
                        e."expenseDate" + INTERVAL '4 hours'
                    )::date AS day,
                    0::numeric AS sales,
                    0::numeric AS cost_of_goods,
                    e.amount AS expenses,
                    TRUE AS cost_complete
                FROM "Expense" e
                WHERE e."businessId" = ${businessId}
                    AND e."expenseDate" >= ${range.start}
                    AND e."expenseDate" < ${range.end}
            )
            SELECT
                date_trunc(${bucket}, day)::date::text AS date,
                SUM(sales)::text AS sales,
                SUM(cost_of_goods)::text AS "costOfGoods",
                SUM(expenses)::text AS expenses,
                BOOL_AND(cost_complete) AS "costComplete"
            FROM movements
            GROUP BY 1
ORDER BY 1 ASC
        `,
    );

    const byDate = new Map(
        rows.map(row => [row.date, row]),
    );

    const profitReady = rows.every(
        row => row.costComplete,
    );

    const firstDay = new Date(
        `${range.from}T00:00:00.000Z`,
    ).getTime();

    const count =
        period === "year"
            ? 12
            : period === "month"
                ? 30
                : 7;

    const firstMonth = new Date(firstDay);

    return Array.from({ length: count }, (_, index) => {
        const date = (
            period === "year"
                ? new Date(
                    Date.UTC(
                        firstMonth.getUTCFullYear(),
                        firstMonth.getUTCMonth() + index,
                        1,
                    ),
                )
                : new Date(
                    firstDay + index * 86_400_000,
                )
        ).toISOString().slice(0, 10);

        const row = byDate.get(date);

        const sales = new Prisma.Decimal(
            row?.sales ?? "0",
        );

        const costs = new Prisma.Decimal(
            row?.costOfGoods ?? "0",
        ).plus(row?.expenses ?? "0");

        return {
            date,
            sales: sales.toFixed(2),
            costs: costs.toFixed(2),
            profit: profitReady
                ? sales.minus(costs).toFixed(2)
                : null,
        };
    });
}