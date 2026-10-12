import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import { resolveOrdersPeriod } from "@/lib/orders/orders-period";

export type AnalyticsSearchParams = Record<
    string,
    string | string[] | undefined
>;

type CashSummary = {
    received: string;
    refunded: string;
    netReceived: string;
    recordedExpenses: string;
    productRevenue: string;
    deliveryRevenue: string;
    costOfGoods: string;
    incompleteEntries: number;
    unrecordedCompleted: number;
    financialEntryCount: number;
};

export async function getAnalyticsPage(
    prisma: Pick<
        ReturnType<typeof createPrismaClient>,
        "$queryRaw"
    >,
    businessId: string,
    params: AnalyticsSearchParams,
) {
    const text = (key: string) =>
        typeof params[key] === "string"
            ? params[key].trim()
            : "";

    const range = resolveOrdersPeriod(
        text("period") || "month",
        text("from"),
        text("to"),
    );

    const [summary] = await prisma.$queryRaw<CashSummary[]>(
        Prisma.sql`
            WITH payments AS (
                SELECT
                    COALESCE(
                        SUM(p.amount) FILTER (WHERE p.amount > 0),
                        0
                    ) AS received,
                    COALESCE(
                        SUM(-p.amount) FILTER (WHERE p.amount < 0),
                        0
                    ) AS refunded,
                    COALESCE(SUM(p.amount), 0) AS net_received
                FROM "OrderPayment" p
                JOIN "Order" o ON o.id = p."orderId"
                WHERE o."businessId" = ${businessId}
                    AND p."createdAt" >= ${range.start}
                    AND p."createdAt" < ${range.end}
            ),
            expenses AS (
                SELECT COALESCE(SUM(e.amount), 0) AS total
                FROM "Expense" e
                WHERE e."businessId" = ${businessId}
                    AND e."expenseDate" >= ${range.start}
                    AND e."expenseDate" < ${range.end}
),
financial AS (
    SELECT
        COALESCE(SUM(f."productRevenueDelta"), 0) AS product_revenue,
        COALESCE(SUM(f."deliveryRevenueDelta"), 0) AS delivery_revenue,
        COALESCE(SUM(f."costOfGoodsDelta"), 0) AS cost_of_goods,
        COUNT(*) FILTER (
            WHERE f."costComplete" = FALSE
        )::int AS incomplete_entries,
        COUNT(*)::int AS entry_count
    FROM "OrderFinancialEntry" f
    WHERE f."businessId" = ${businessId}
        AND f."occurredAt" >= ${range.start}
        AND f."occurredAt" < ${range.end}
),
unrecorded AS (
    SELECT COUNT(*)::int AS total
    FROM "Order" o
    WHERE o."businessId" = ${businessId}
        AND o.status = 'COMPLETED'
        AND NOT EXISTS (
            SELECT 1
            FROM "OrderFinancialEntry" f
            WHERE f."businessId" = ${businessId}
                AND f."orderId" = o.id
                AND f.kind = 'SALE'
        )
)
SELECT
                payments.received::text AS received,
                payments.refunded::text AS refunded,
                payments.net_received::text AS "netReceived",
                expenses.total::text AS "recordedExpenses",
financial.product_revenue::text AS "productRevenue",
financial.delivery_revenue::text AS "deliveryRevenue",
financial.cost_of_goods::text AS "costOfGoods",
financial.incomplete_entries AS "incompleteEntries",
financial.entry_count AS "financialEntryCount",
unrecorded.total AS "unrecordedCompleted"
            FROM payments
CROSS JOIN expenses
CROSS JOIN financial
CROSS JOIN unrecorded
        `,
    );

    if (!summary) {
        throw new Error("ანალიტიკის მონაცემები ვერ ჩაიტვირთა.");
    }

    const amount = (value: string) =>
        new Prisma.Decimal(value).toFixed(2);

    const sales = new Prisma.Decimal(summary.productRevenue)
        .plus(summary.deliveryRevenue);

    const profitReady =
        summary.incompleteEntries === 0 &&
        summary.unrecordedCompleted === 0;

    const profit = profitReady
        ? sales
            .minus(summary.costOfGoods)
            .minus(summary.recordedExpenses)
            .toFixed(2)
        : null;

    return {
        period: range.period,
        from: range.from,
        to: range.to,
        periodError: range.error,
        received: amount(summary.received),
        refunded: amount(summary.refunded),
        netReceived: amount(summary.netReceived),
        recordedExpenses: amount(summary.recordedExpenses),
        productRevenue: amount(summary.productRevenue),
        deliveryRevenue: amount(summary.deliveryRevenue),
        sales: sales.toFixed(2),
        costOfGoods: amount(summary.costOfGoods),
        profit,
        profitReady,
        incompleteEntries: summary.incompleteEntries,
        unrecordedCompleted: summary.unrecordedCompleted,
        financialEntryCount: summary.financialEntryCount,
    };
}

export type AnalyticsPageData = Awaited<
    ReturnType<typeof getAnalyticsPage>
>;