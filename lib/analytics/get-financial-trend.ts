import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import { resolveOrdersPeriod } from "@/lib/orders/orders-period";

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
): Promise<FinancialTrendPoint[]> {
    const range = resolveOrdersPeriod("week", "", "");

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
                day::text AS date,
                SUM(sales)::text AS sales,
                SUM(cost_of_goods)::text AS "costOfGoods",
                SUM(expenses)::text AS expenses,
                BOOL_AND(cost_complete) AS "costComplete"
            FROM movements
            GROUP BY day
            ORDER BY day ASC
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

    return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(
            firstDay + index * 86_400_000,
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