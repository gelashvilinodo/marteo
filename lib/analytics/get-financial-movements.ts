import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import { resolveOrdersPeriod } from "@/lib/orders/orders-period";
import type { AnalyticsSearchParams } from "./get-analytics-page";

export type FinancialMovement = {
    key: string;
    source: "financial" | "payment" | "expense";
    kind: string;
    occurredAt: string;
    orderNumber: number | null;
    title: string;
    amount: string;
    cost: string | null;
    costComplete: boolean;
};

type Snapshot = {
    rows: FinancialMovement[];
    total: number;
    page: number;
    pages: number;
};

export async function getFinancialMovements(
    prisma: Pick<
        ReturnType<typeof createPrismaClient>,
        "$queryRaw"
    >,
    businessId: string,
    from: string,
    to: string,
    params: AnalyticsSearchParams,
) {
    const text = (key: string) =>
        typeof params[key] === "string"
            ? params[key].trim()
            : "";

    const allowed = ["all", "financial", "payment", "expense"];

    const source = allowed.includes(text("movement"))
        ? text("movement")
        : "all";

    const rawPage = Number(text("page"));
    const requestedPage =
        Number.isSafeInteger(rawPage) && rawPage > 0
            ? Math.min(rawPage, 1_000_000_000)
            : 1;

    const range = resolveOrdersPeriod("custom", from, to);
    const pageSize = 20;

    const [result] = await prisma.$queryRaw<
        Array<{ snapshot: Snapshot }>
    >(Prisma.sql`
        WITH movements AS (
            SELECT
                'financial:' || f.id AS key,
                'financial'::text AS source,
                f.kind::text AS kind,
                f."occurredAt" AS occurred_at,
                f."orderNumber" AS order_number,
                'შეკვეთის ფინანსური ჩანაწერი'::text AS title,
                (
                    f."productRevenueDelta" +
                    f."deliveryRevenueDelta"
                ) AS amount,
                f."costOfGoodsDelta" AS cost,
                f."costComplete" AS cost_complete
            FROM "OrderFinancialEntry" f
            WHERE f."businessId" = ${businessId}
                AND f."occurredAt" >= ${range.start}
                AND f."occurredAt" < ${range.end}

            UNION ALL

            SELECT
                'payment:' || p.id,
                'payment'::text,
                CASE
                    WHEN p.amount < 0 THEN 'REFUND'
                    ELSE 'PAYMENT'
                END,
                p."createdAt",
                o.number,
                p.method::text,
                p.amount,
                NULL::numeric,
                TRUE
            FROM "OrderPayment" p
            JOIN "Order" o ON o.id = p."orderId"
            WHERE o."businessId" = ${businessId}
                AND p."createdAt" >= ${range.start}
                AND p."createdAt" < ${range.end}

            UNION ALL

            SELECT
                'expense:' || e.id,
                'expense'::text,
                e.category::text,
                e."expenseDate",
                NULL::integer,
                COALESCE(NULLIF(e.title, ''), 'ხარჯი'),
                -e.amount,
                NULL::numeric,
                TRUE
            FROM "Expense" e
            WHERE e."businessId" = ${businessId}
                AND e."expenseDate" >= ${range.start}
                AND e."expenseDate" < ${range.end}
        ),
        filtered AS (
            SELECT *
            FROM movements
            WHERE (
                ${source} = 'all' OR source = ${source}
            )
        ),
        totals AS (
            SELECT
                COUNT(*)::int AS total,
                GREATEST(
                    1,
                    CEIL(COUNT(*)::numeric / ${pageSize})
                )::int AS pages
            FROM filtered
        ),
        paging AS (
            SELECT
                total,
                pages,
                LEAST(${requestedPage}, pages)::int AS page
            FROM totals
        ),
        page_rows AS (
            SELECT *
            FROM filtered
            ORDER BY occurred_at DESC, key DESC
            LIMIT ${pageSize}
            OFFSET (
                SELECT (page - 1)::bigint * ${pageSize}
                FROM paging
            )
        )
        SELECT jsonb_build_object(
            'total', pg.total,
            'page', pg.page,
            'pages', pg.pages,
            'rows', COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'key', r.key,
                            'source', r.source,
                            'kind', r.kind,
                            'occurredAt',
                                to_char(
                                    r.occurred_at,
                                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                                ),
                            'orderNumber', r.order_number,
                            'title', r.title,
                            'amount', r.amount::text,
                            'cost', r.cost::text,
                            'costComplete', r.cost_complete
                        )
                        ORDER BY r.occurred_at DESC, r.key DESC
                    )
                    FROM page_rows r
                ),
                '[]'::jsonb
            )
        ) AS snapshot
        FROM paging pg
    `);

    if (!result) {
        throw new Error("ფინანსური მოძრაობები ვერ ჩაიტვირთა.");
    }

    const money = (value: string) =>
        new Prisma.Decimal(value).toFixed(2);

    return {
        ...result.snapshot,
        source,
        rows: result.snapshot.rows.map(row => ({
            ...row,
            amount: money(row.amount),
            cost: row.cost === null ? null : money(row.cost),
        })),
    };
}

export type FinancialMovementsData = Awaited<
    ReturnType<typeof getFinancialMovements>
>;