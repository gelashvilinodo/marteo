import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import { resolveOrdersPeriod } from "@/lib/orders/orders-period";
import type { AnalyticsSearchParams } from "./get-analytics-page";

export type FinancialMovement = {
    key: string;
    source: "financial" | "payment" | "expense" | "purchase" | "writeoff";
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

    const allowed = [
        "all",
        "financial",
        "payment",
        "expense",
        "purchase",
        "writeoff",
    ];

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
                f."createdAt" AS created_at,
                f."orderNumber" AS order_number,
                'შეკვეთის ფინანსური ჩანაწერი'::text AS title,
                f."productRevenueDelta" AS amount,
                f."costOfGoodsDelta" AS cost,
                f."costComplete" AS cost_complete,
COALESCE(
    f."orderId",
    'historical:' || f.id
) AS order_key
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
                'payment:' || p.id,
                'payment'::text,
                CASE
                    WHEN p.amount < 0 THEN 'REFUND'
                    ELSE 'PAYMENT'
                END,
                p."createdAt",
p."createdAt",
o.number,
                p.method::text,
                                p.amount,
                NULL::numeric,
                TRUE,
                o.id
            FROM "OrderPayment" p
            JOIN "Order" o ON o.id = p."orderId"
            WHERE o."businessId" = ${businessId}
                AND o."analyticsPendingCost" = FALSE
                AND p."createdAt" >= ${range.start}
                AND p."createdAt" < ${range.end}

            UNION ALL

            SELECT
                'expense:' || e.id,
                'expense'::text,
                e.category::text,
                e."expenseDate",
e."createdAt",
NULL::integer,
                COALESCE(NULLIF(e.title, ''), 'ხარჯი'),
                                -e.amount,
                NULL::numeric,
                TRUE,
                NULL::text
            FROM "Expense" e
            WHERE e."businessId" = ${businessId}
                AND e."expenseDate" >= ${range.start}
                                AND e."expenseDate" < ${range.end}

            UNION ALL

            SELECT
                'purchase:' || p.id,
                'purchase'::text,
                'PURCHASE'::text,
                p."purchaseDate",
p."createdAt",
p.number,
                COALESCE(NULLIF(p.name, ''), 'პარტიის შეძენა'),
                -(
                    COALESCE(
                        (
                            SELECT SUM(
                                pi.quantity::numeric *
                                pi."unitPurchasePrice"
                            )
                            FROM "PurchaseItem" pi
                            WHERE pi."purchaseId" = p.id
                        ),
                        0::numeric
                    ) +
                    p."shippingCost" +
                    p."customsCost" +
                    p."otherCost"
                ),
                                NULL::numeric,
                TRUE,
                NULL::text
            FROM "Purchase" p
            WHERE p."businessId" = ${businessId}
                AND p."purchaseDate" >= ${range.start}
                AND p."purchaseDate" < ${range.end}

UNION ALL

SELECT
    'writeoff:' || w.id,
    'writeoff'::text,
    'INVENTORY_WRITE_OFF'::text,
    w."createdAt",
    w."createdAt",
    NULL::integer,
    concat_ws(
        ' · ',
        w.name,
        NULLIF(w.color, ''),
        NULLIF(w.size, ''),
        w.quantity::text || ' ერთეული'
    ),
    -w."totalCost",
    NULL::numeric,
    TRUE,
    NULL::text
FROM "InventoryWriteOff" w
WHERE w."businessId" = ${businessId}
    AND w."createdAt" >= ${range.start}
    AND w."createdAt" < ${range.end}
    AND w.quantity > 0
),
selected_movements AS (
            SELECT *
            FROM movements
            WHERE (
                ${source} = 'all' OR source = ${source}
            )
        ),
        order_groups AS (
            SELECT
                order_key,

                COALESCE(
                    MAX(key) FILTER (WHERE source = 'financial'),
                    MAX(key) FILTER (WHERE source = 'payment')
                ) AS key,

                CASE
                    WHEN COUNT(*) FILTER (
                        WHERE source = 'financial'
                    ) > 0
                    THEN 'financial'
                    ELSE 'payment'
                END AS source,

                'ORDER_SUMMARY'::text AS kind,
                MAX(occurred_at) AS occurred_at,
                MAX(created_at) AS created_at,
                MAX(order_number) AS order_number,

                CASE
                    WHEN COUNT(*) FILTER (
                        WHERE source = 'financial'
                    ) > 0
                    THEN 'გაყიდვის თანხა; გადახდები იხილე დეტალებში'
                    ELSE 'მიღებული თანხა, დაბრუნებების გამოკლებით'
                END AS title,

                CASE
                    WHEN COUNT(*) FILTER (
                        WHERE source = 'financial'
                    ) > 0
                    THEN COALESCE(
                        SUM(amount) FILTER (
                            WHERE source = 'financial'
                        ),
                        0::numeric
                    )
                    ELSE COALESCE(
                        SUM(amount) FILTER (
                            WHERE source = 'payment'
                        ),
                        0::numeric
                    )
                END AS amount,

                SUM(cost) FILTER (
                    WHERE source = 'financial'
                ) AS cost,

                COALESCE(
                    BOOL_AND(cost_complete) FILTER (
                        WHERE source = 'financial'
                    ),
                    TRUE
                ) AS cost_complete

            FROM selected_movements
            WHERE order_key IS NOT NULL
            GROUP BY order_key
        ),
        filtered AS (
            SELECT
                key,
                source,
                kind,
                occurred_at,
created_at,
order_number,
                title,
                amount,
                cost,
                cost_complete
            FROM order_groups

            UNION ALL

            SELECT
                key,
                source,
                kind,
                occurred_at,
created_at,
order_number,
                title,
                amount,
                cost,
                cost_complete
            FROM selected_movements
            WHERE order_key IS NULL
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
            ORDER BY
    (occurred_at + INTERVAL '4 hours')::date DESC,
    created_at DESC,
    occurred_at DESC,
    key DESC
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
                        ORDER BY
    (r.occurred_at + INTERVAL '4 hours')::date DESC,
    r.created_at DESC,
    r.occurred_at DESC,
    r.key DESC
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