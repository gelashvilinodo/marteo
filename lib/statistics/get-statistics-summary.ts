import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import { resolveOrdersPeriod } from "@/lib/orders/orders-period";

export type StatisticsSearchParams = Record<
    string,
    string | string[] | undefined
>;

type SummaryRow = {
    completedOrders: string;
    soldUnits: string;
    newCustomers: string;
    returningCustomers: string;
    createdOrders: string;
    completedCreatedOrders: string;
    completionRate: string | null;
    returnedUnits: string;
    exchanges: string;
};

export async function getStatisticsSummary(
    prisma: Pick<ReturnType<typeof createPrismaClient>, "$queryRaw">,
    businessId: string,
    params: StatisticsSearchParams,
) {
    const text = (key: string) =>
        typeof params[key] === "string" ? params[key].trim() : "";

    const range = resolveOrdersPeriod(
        text("period") || "month",
        text("from"),
        text("to"),
    );

    const [summary] = await prisma.$queryRaw<SummaryRow[]>(Prisma.sql`
        WITH first_completions AS (
            SELECT
                COALESCE(f."orderId", 'historical:' || f.id) AS order_key,
                f."orderId" AS order_id,
                MIN(f."occurredAt") AS completed_at
            FROM "OrderFinancialEntry" f
            WHERE f."businessId" = ${businessId}
                AND f.kind = 'SALE'
            GROUP BY
                COALESCE(f."orderId", 'historical:' || f.id),
                f."orderId"
        ),
        period_completions AS (
            SELECT *
            FROM first_completions
            WHERE completed_at >= ${range.start}
                AND completed_at < ${range.end}
        ),
        customer_first_completion AS (
            SELECT
                o."customerId" AS customer_id,
                MIN(f.completed_at) AS first_completed_at
            FROM first_completions f
            JOIN "Order" o ON o.id = f.order_id
            WHERE o."businessId" = ${businessId}
            GROUP BY o."customerId"
        ),
        period_customers AS (
            SELECT DISTINCT o."customerId" AS customer_id
            FROM period_completions f
            JOIN "Order" o ON o.id = f.order_id
            WHERE o."businessId" = ${businessId}
        ),
        customer_counts AS (
            SELECT
                COUNT(*) FILTER (
                    WHERE first.first_completed_at >= ${range.start}
                        AND first.first_completed_at < ${range.end}
                ) AS new_customers,
                COUNT(*) FILTER (
                    WHERE first.first_completed_at < ${range.start}
                ) AS returning_customers
            FROM period_customers active
            JOIN customer_first_completion first
                ON first.customer_id = active.customer_id
        ),
        created_cohort AS (
            SELECT
                COUNT(*) AS created_orders,
                COUNT(*) FILTER (
                    WHERE first.completed_at < ${range.end}
                ) AS completed_created_orders
            FROM "Order" o
            LEFT JOIN first_completions first ON first.order_id = o.id
            WHERE o."businessId" = ${businessId}
                AND o."createdAt" >= ${range.start}
                AND o."createdAt" < ${range.end}
        ),
        units AS (
            SELECT COALESCE(SUM(i."quantityDelta"), 0) AS sold_units
            FROM "OrderFinancialEntryItem" i
            JOIN "OrderFinancialEntry" f ON f.id = i."entryId"
            WHERE f."businessId" = ${businessId}
                AND f."occurredAt" >= ${range.start}
                AND f."occurredAt" < ${range.end}
        ),
        received_returns AS (
            SELECT COALESCE(SUM(i.quantity), 0) AS returned_units
            FROM "OrderReturnItem" i
            JOIN "OrderReturn" r ON r.id = i."returnId"
            JOIN "Order" o ON o.id = r."orderId"
            WHERE o."businessId" = ${businessId}
                AND r.status = 'RECEIVED'
                AND r."receivedAt" >= ${range.start}
                AND r."receivedAt" < ${range.end}
        ),
        started_exchanges AS (
            SELECT COUNT(*) AS exchanges
            FROM "OrderExchange" e
            JOIN "Order" o ON o.id = e."orderId"
            WHERE o."businessId" = ${businessId}
                AND e."createdAt" >= ${range.start}
                AND e."createdAt" < ${range.end}
        )
        SELECT
            (SELECT COUNT(*) FROM period_completions)::text
                AS "completedOrders",
            units.sold_units::text AS "soldUnits",
            customers.new_customers::text AS "newCustomers",
            customers.returning_customers::text AS "returningCustomers",
            cohort.created_orders::text AS "createdOrders",
            cohort.completed_created_orders::text
                AS "completedCreatedOrders",
            CASE
                WHEN cohort.created_orders = 0 THEN NULL
                ELSE ROUND(
                    cohort.completed_created_orders::numeric * 100 /
                    cohort.created_orders,
                    1
                )::text
            END AS "completionRate",
            returns.returned_units::text AS "returnedUnits",
            exchanges.exchanges::text AS exchanges
        FROM units
        CROSS JOIN customer_counts customers
        CROSS JOIN created_cohort cohort
        CROSS JOIN received_returns returns
        CROSS JOIN started_exchanges exchanges
    `);

    if (!summary) {
        throw new Error("სტატისტიკის მონაცემები ვერ ჩაიტვირთა.");
    }

    function integer(value: string) {
        const number = Number(value);

        if (!Number.isSafeInteger(number)) {
            throw new Error("სტატისტიკის რაოდენობა ვერ დამუშავდა.");
        }

        return number;
    }

    return {
        period: range.period,
        from: range.from,
        to: range.to,
        periodError: range.error,
        completedOrders: integer(summary.completedOrders),
        soldUnits: integer(summary.soldUnits),
        newCustomers: integer(summary.newCustomers),
        returningCustomers: integer(summary.returningCustomers),
        createdOrders: integer(summary.createdOrders),
        completedCreatedOrders: integer(summary.completedCreatedOrders),
        completionRate: summary.completionRate,
        returnedUnits: integer(summary.returnedUnits),
        exchanges: integer(summary.exchanges),
    };
}

export type StatisticsSummary = Awaited<
    ReturnType<typeof getStatisticsSummary>
>;