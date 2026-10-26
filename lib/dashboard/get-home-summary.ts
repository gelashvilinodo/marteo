import "server-only";

import { createPgReader } from "@/lib/database/pg-reader";
import { resolveOrdersPeriod } from "@/lib/orders/orders-period";

export type HomeSearchParams = Record<
    string,
    string | string[] | undefined
>;

type SummaryRow = {
    sales: string;
    profit: string | null;
    partialProfit: string;
    orders: string;
    stock: string;
    isNewBusiness: boolean;
};

export async function getHomeSummary(
    businessId: string,
    params: HomeSearchParams,
    options: {
        finance?: boolean;
        orders?: boolean;
        stock?: boolean;
        businessState?: boolean;
    } = {},
) {
    const includeFinance = options.finance ?? true;
    const includeOrders = options.orders ?? true;
    const includeStock = options.stock ?? true;
    const includeBusinessState = options.businessState ?? true;
    const text = (key: string) => {
        const value = params[key];
        return typeof value === "string" ? value.trim() : "";
    };

    const range = resolveOrdersPeriod(
        text("period") || "month",
        text("from"),
        text("to"),
    );

    const reader = createPgReader();

    try {
        const [row] = await reader.$queryRaw<SummaryRow[]>`
            WITH financial AS (
                SELECT
                    COALESCE(SUM(
                        f."productRevenueDelta"
                    ), 0) AS sales,
                    COALESCE(SUM(
                        f."costOfGoodsDelta"
                    ), 0) AS costs,
                    COUNT(*) FILTER (
                        WHERE f."costComplete" = FALSE
                    ) AS incomplete,
                    COALESCE(SUM(f."productRevenueDelta" - f."costOfGoodsDelta")
                        FILTER (WHERE f."costComplete"), 0) AS known_result
                FROM "OrderFinancialEntry" f
                WHERE ${includeFinance}::boolean
    AND f."businessId" = ${businessId}
    AND NOT EXISTS (SELECT 1 FROM "Order" pending WHERE pending.id=f."orderId" AND pending."businessId"=f."businessId" AND pending."analyticsPendingCost"=TRUE)
    AND f."occurredAt" >= ${range.start}
                    AND f."occurredAt" < ${range.end}
            ),
            expenses AS (
    SELECT
        COALESCE((
            SELECT SUM(e.amount)
            FROM "Expense" e
            WHERE ${includeFinance}::boolean
                AND e."businessId" = ${businessId}
                AND e."expenseDate" >= ${range.start}
                AND e."expenseDate" < ${range.end}
        ), 0)
        +
        COALESCE((
            SELECT SUM(w."totalCost")
            FROM "InventoryWriteOff" w
            WHERE ${includeFinance}::boolean
                AND w."businessId" = ${businessId}
                AND w."createdAt" >= ${range.start}
                AND w."createdAt" < ${range.end}
        ), 0) AS total
),
            orders AS (
                SELECT COUNT(*) AS total
                FROM "Order" o
                WHERE ${includeOrders}::boolean
    AND o."businessId" = ${businessId}
    AND o."deletedAt" IS NULL
                    AND o."createdAt" >= ${range.start}
                    AND o."createdAt" < ${range.end}
            ),
                        stock AS (
                SELECT COALESCE(
                    SUM(lot."remainingQuantity"),
                    0
                ) AS total
                FROM "InventoryStockLot" lot
                JOIN "InventoryItem" i
                    ON i.id = lot."inventoryItemId"
                LEFT JOIN "PurchaseItem" source
                    ON source.id = lot."purchaseItemId"
                LEFT JOIN "Purchase" p
                    ON p.id = source."purchaseId"
                WHERE ${includeStock}::boolean
                    AND i."businessId" = ${businessId}
                    AND i."isActive" = TRUE
                    AND (
                        lot."purchaseItemId" IS NULL
                        OR (
                            p."businessId" = ${businessId}
                            AND p."receiptStatus" = 'RECEIVED'
                        )
                    )
            )
            SELECT
                ROUND(financial.sales, 2)::text AS sales,
                CASE
    WHEN NOT ${includeFinance}::boolean THEN NULL
    WHEN financial.incomplete > 0
                        OR EXISTS (
                            SELECT 1
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
                    THEN NULL
                    ELSE ROUND(
                        financial.sales -
                        financial.costs -
                        expenses.total,
                        2
                    )::text
                END AS profit,
                ROUND(financial.known_result - expenses.total, 2)::text AS "partialProfit",
                orders.total::text AS orders,
                stock.total::text AS stock,
                CASE WHEN ${includeBusinessState}::boolean THEN NOT (
    EXISTS (
        SELECT 1 FROM "Order"
                        WHERE "businessId" = ${businessId}
                    )
                    OR EXISTS (
                        SELECT 1 FROM "Purchase"
                        WHERE "businessId" = ${businessId}
                    )
                    OR EXISTS (
                        SELECT 1 FROM "Expense"
                        WHERE "businessId" = ${businessId}
                    )
                    OR EXISTS (
                        SELECT 1 FROM "Product"
                        WHERE "businessId" = ${businessId}
                    )
                    OR EXISTS (
                        SELECT 1 FROM "InventoryItem"
                        WHERE "businessId" = ${businessId}
                    )
                    OR EXISTS (
                        SELECT 1 FROM "Customer"
                        WHERE "businessId" = ${businessId}
                    )
                    OR EXISTS (
                        SELECT 1 FROM "OrderFinancialEntry"
                        WHERE "businessId" = ${businessId}
                    )
                ) ELSE FALSE END AS "isNewBusiness"
            FROM financial
            CROSS JOIN expenses
            CROSS JOIN orders
            CROSS JOIN stock
        `;

        if (!row) {
            throw new Error("მთავარი გვერდის მონაცემები ვერ ჩაიტვირთა.");
        }

        return {
            ...row,
            period: range.period,
            from: range.from,
            to: range.to,
            periodError: range.error,
        };
    } finally {
        await reader.$disconnect();
    }
}

export type HomeSummary = Awaited<
    ReturnType<typeof getHomeSummary>
>;