import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { resolveOrdersPeriod } from "@/lib/orders/orders-period";
import { expenseCategories } from "./expense-categories";

type Row = {
    id: string;
    amount: string;
    complete: boolean;
};

export async function getExpenseBreakdown(
    prisma: {
        $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
    },
    businessId: string,
    from: string,
    to: string,
) {
    const range = resolveOrdersPeriod("custom", from, to);

    const rows = await prisma.$queryRaw<Row[]>(
        Prisma.sql`
            SELECT
                'COGS' AS id,
                COALESCE(
                    SUM(f."costOfGoodsDelta"),
                    0
                )::text AS amount,
                COALESCE(
                    BOOL_AND(f."costComplete"),
                    TRUE
                ) AS complete
            FROM "OrderFinancialEntry" f
            WHERE f."businessId" = ${businessId}
                            AND NOT EXISTS (
                    SELECT 1
                    FROM "Order" pending
                    WHERE pending.id = f."orderId"
                        AND pending."businessId" = f."businessId"
                        AND pending."analyticsPendingCost" = TRUE
                )
                AND f."occurredAt" >= ${range.start}
                AND f."occurredAt" < ${range.end}

            UNION ALL

            SELECT
                e.category::text AS id,
                SUM(e.amount)::text AS amount,
                TRUE AS complete
            FROM "Expense" e
            WHERE e."businessId" = ${businessId}
                AND e."expenseDate" >= ${range.start}
                AND e."expenseDate" < ${range.end}
            GROUP BY e.category
            UNION ALL

SELECT
    'INVENTORY_WRITE_OFF' AS id,
    COALESCE(SUM(w."totalCost"), 0)::text AS amount,
    TRUE AS complete
FROM "InventoryWriteOff" w
WHERE w."businessId" = ${businessId}
    AND w."createdAt" >= ${range.start}
    AND w."createdAt" < ${range.end}
        `,
    );

    const total = rows.reduce(
        (sum, row) => sum.plus(row.amount),
        new Prisma.Decimal(0),
    );

    return {
        from: range.from,
        to: range.to,
        total: total.toFixed(2),
        complete: rows.every(row => row.complete),
        segments: rows
            .filter(row => !new Prisma.Decimal(row.amount).isZero())
            .map(row => ({
                id: row.id,
                label:
                    row.id === "COGS"
                        ? "გაყიდული პროდუქტების ხარჯი"
                        : row.id === "INVENTORY_WRITE_OFF"
                            ? "მარაგის ჩამოწერა"
                            : expenseCategories.find(
                                category => category.value === row.id,
                            )?.label ?? "სხვა ხარჯი",
                amount: new Prisma.Decimal(
                    row.amount,
                ).toFixed(2),
            })),
    };
}

export type ExpenseBreakdownData =
    Awaited<ReturnType<typeof getExpenseBreakdown>>;