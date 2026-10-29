import { Prisma } from "@/generated/prisma/client";
import type { InventoryProduct } from "@/components/dashboard/inventory/InventoryView";

export type InventoryFilter = "all" | "low" | "exhausted" | "defective";
export type InventorySort = "name-asc" | "name-desc" | "quantity-asc" | "quantity-desc" | "date-desc" | "date-asc";
export type InventoryControls = {
    query: string; category: string; color: string; size: string; sort: InventorySort;
};
export type InventoryChartData = {
    statuses: { good: number; low: number; exhausted: number; defective: number };
    categories: { key: string; label: string; quantity: string; valueCents: string | null }[];
};
export type InventoryPageData = {
    products: InventoryProduct[];
    totalProducts: number;
    currentPage: number;
    totalPages: number;
    filter: InventoryFilter;
    controls: InventoryControls;
    options: { categories: string[]; colors: string[]; sizes: string[] };
    counts: Record<InventoryFilter, { species: number; quantity: number }>;
    chart: InventoryChartData;
};
export type InventorySearchParams = Record<string, string | string[] | undefined>;
const PAGE_SIZE = 20;

type StocktakePage = Pick<InventoryPageData, "totalProducts" | "filter" | "controls"> & {
    products: Array<Pick<InventoryProduct, "id" | "sku" | "name" | "brand" | "category" | "color" | "size" | "totalStock" | "defectiveStock">>;
};
export function getInventoryPage(prisma: Pick<Prisma.TransactionClient, "$queryRaw">, businessId: string, params: InventorySearchParams, pageSize: number, purpose: "stocktake"): Promise<StocktakePage>;
export function getInventoryPage(prisma: Pick<Prisma.TransactionClient, "$queryRaw">, businessId: string, params: InventorySearchParams, pageSize?: number): Promise<InventoryPageData>;
export async function getInventoryPage(
    prisma: Pick<Prisma.TransactionClient, "$queryRaw">,
    businessId: string,
    params: InventorySearchParams,
    pageSize = PAGE_SIZE,
    purpose: "page" | "stocktake" = "page",
): Promise<InventoryPageData | StocktakePage> {
    const text = (key: string) => typeof params[key] === "string" ? params[key].trim() : "";
    const filters: InventoryFilter[] = ["all", "low", "exhausted", "defective"];
    const sorts: InventorySort[] = ["name-asc", "name-desc", "quantity-asc", "quantity-desc", "date-desc", "date-asc"];
    const filter = filters.includes(text("status") as InventoryFilter) ? text("status") as InventoryFilter : "all";
    const sort = sorts.includes(text("sort") as InventorySort) ? text("sort") as InventorySort : "name-asc";
    const controls: InventoryControls = {
        query: text("q"), category: text("category"), color: text("color"), size: text("size"), sort,
    };
    const rawPage = Number(text("page"));
    const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1_000_000_000) : 1;
    const conditions: Prisma.Sql[] = [];
    if (filter === "low") conditions.push(Prisma.sql`b."goodStock" > 0 AND b."goodStock" < 5`);
    if (filter === "exhausted") conditions.push(Prisma.sql`b."goodStock" = 0`);
    if (filter === "defective") conditions.push(Prisma.sql`b."defectiveStock" > 0`);
    if (controls.category) conditions.push(Prisma.sql`trim(b.category) = ${controls.category}`);
    if (controls.color) conditions.push(Prisma.sql`trim(b.color) = ${controls.color}`);
    if (controls.size) conditions.push(Prisma.sql`trim(b.size) = ${controls.size}`);
    for (const word of controls.query.normalize("NFKC").toLowerCase().split(/\s+/).filter(Boolean)) {
        // strpos treats %, _ and backslashes as literal search characters.
        conditions.push(Prisma.sql`strpos(b.searchable, ${word}) > 0`);
    }
    const where = conditions.length ? Prisma.join(conditions, " AND ") : Prisma.sql`TRUE`;
    const nameOrder = Prisma.sql`lower(normalize(trim(b.name), NFKC)) COLLATE "C"`;
    const quantity = filter === "defective" ? Prisma.sql`b."defectiveStock"` : Prisma.sql`b."goodStock"`;
    const orders: Record<InventorySort, Prisma.Sql> = {
        "name-asc": Prisma.sql`${nameOrder} ASC`,
        "name-desc": Prisma.sql`${nameOrder} DESC`,
        "quantity-asc": Prisma.sql`${quantity} ASC, ${nameOrder} ASC`,
        "quantity-desc": Prisma.sql`${quantity} DESC, ${nameOrder} ASC`,
        "date-asc": Prisma.sql`b."createdAt" ASC, ${nameOrder} ASC`,
        "date-desc": Prisma.sql`b."createdAt" DESC, ${nameOrder} ASC`,
    };
    const order = Prisma.sql`${orders[sort]}, b."productId" ASC, b.color ASC NULLS LAST, b.size ASC NULLS LAST, b.id ASC`;
    type Snapshot = Pick<InventoryPageData, "products" | "totalProducts" | "currentPage" | "totalPages" | "options" | "counts" | "chart">;
    // Document exports do not need chart totals, filter menus, photos or prices.
    const snapshot = purpose === "stocktake" ? Prisma.sql`jsonb_build_object(
        'products', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'id', b.id, 'sku', b.sku, 'name', b.name, 'brand', p.brand,
            'category', b.category, 'color', b.color, 'size', b.size,
            'totalStock', b."totalStock", 'defectiveStock', b."defectiveStock"
        ) ORDER BY ${order}) FROM page_rows b JOIN "Product" p ON p.id=b."productId"), '[]'::jsonb),
        'totalProducts', pg.total
    )` : Prisma.sql`jsonb_build_object(
            'products', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'id', b.id, 'createdAt', to_char(b."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                'sku', b.sku, 'name', b.name, 'brand', p.brand, 'category', b.category,
                'description', p.description, 'color', b.color, 'size', b.size, 'imageUrl', i."imageUrl",
                'salePrice', i."salePrice"::text,
'averageUnitCost', b."averageUnitCost"::text,
'totalStock', b."totalStock",
'goodStock', b."goodStock",
                'defectiveStock', b."defectiveStock", 'goodStockValueCents', b."goodStockValueCents"::text
            ) ORDER BY ${order}) FROM page_rows b JOIN "InventoryItem" i ON i.id=b.id JOIN "Product" p ON p.id=b."productId"), '[]'::jsonb),
            'totalProducts', pg.total, 'currentPage', pg.page, 'totalPages', pg.pages,
            'options', jsonb_build_object(
                'categories', coalesce((SELECT jsonb_agg(v ORDER BY v COLLATE "C") FROM (SELECT DISTINCT trim(category) AS v FROM base WHERE nullif(trim(category), '') IS NOT NULL) o), '[]'::jsonb),
                'colors', coalesce((SELECT jsonb_agg(v ORDER BY v COLLATE "C") FROM (SELECT DISTINCT trim(color) AS v FROM base WHERE nullif(trim(color), '') IS NOT NULL) o), '[]'::jsonb),
                'sizes', coalesce((SELECT jsonb_agg(v ORDER BY v COLLATE "C") FROM (SELECT DISTINCT trim(size) AS v FROM base WHERE nullif(trim(size), '') IS NOT NULL) o), '[]'::jsonb)
            ),
            'counts', (SELECT jsonb_build_object(
                'all', jsonb_build_object('species', count(*), 'quantity', coalesce(sum("totalStock"), 0)),
                'low', jsonb_build_object('species', count(*) FILTER (WHERE "goodStock" > 0 AND "goodStock" < 5), 'quantity', coalesce(sum("goodStock") FILTER (WHERE "goodStock" > 0 AND "goodStock" < 5), 0)),
                'exhausted', jsonb_build_object('species', count(*) FILTER (WHERE "goodStock" = 0), 'quantity', 0),
                'defective', jsonb_build_object('species', count(*) FILTER (WHERE "defectiveStock" > 0), 'quantity', coalesce(sum("defectiveStock"), 0))
            ) FROM base),
            'chart', jsonb_build_object(
                'statuses', (SELECT jsonb_build_object(
                    'good', count(*) FILTER (WHERE "goodStock" >= 5),
                    'low', count(*) FILTER (WHERE "goodStock" > 0 AND "goodStock" < 5),
                    'defective', count(*) FILTER (WHERE "goodStock" = 0 AND "defectiveStock" > 0),
                    'exhausted', count(*) FILTER (WHERE "goodStock" = 0 AND "defectiveStock" = 0)
                ) FROM base),
                'categories', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.key) FROM categories c), '[]'::jsonb)
            )
        )`;
    // One statement gives counts and the page the same database snapshot.
    // Only the page joins descriptions, photos and sale prices.
    const [row] = await prisma.$queryRaw<{ snapshot: Snapshot | Omit<StocktakePage, "filter" | "controls"> }[]>(Prisma.sql`
                WITH balances AS (
            SELECT
                lot."inventoryItemId" AS id,
                SUM(lot."remainingQuantity") AS total,
                SUM(lot."remainingDefectiveQuantity") AS defective,
                ${purpose === "stocktake" ? Prisma.sql`NULL::numeric AS "averageUnitCost", NULL::numeric AS cents` : Prisma.sql`CASE
                    WHEN BOOL_OR(
                        lot."remainingQuantity" > 0
                        AND lot."remainingCost" IS NULL
                        AND lot."unitCost" IS NULL
                    ) THEN NULL
                    ELSE ROUND(
                        SUM(
                            CASE
                                WHEN lot."remainingQuantity" = 0 THEN 0
                                ELSE COALESCE(
                                    lot."remainingCost",
                                    lot."unitCost" * lot."remainingQuantity"
                                )
                            END
                        ) / NULLIF(SUM(lot."remainingQuantity"), 0),
                        2
                    )
                END AS "averageUnitCost",
                CASE
                    WHEN BOOL_OR(
                        lot."remainingQuantity" >
                            lot."remainingDefectiveQuantity"
                        AND lot."remainingCost" IS NULL
                        AND lot."unitCost" IS NULL
                    ) THEN NULL
                    ELSE ROUND(
                        SUM(
                            CASE
                                WHEN lot."remainingQuantity" =
                                    lot."remainingDefectiveQuantity"
                                THEN 0
                                ELSE COALESCE(
                                    lot."remainingCost" /
                                        NULLIF(lot."remainingQuantity", 0),
                                    lot."unitCost"
                                ) * (
                                    lot."remainingQuantity" -
                                    lot."remainingDefectiveQuantity"
                                )
                            END
                        ) * 100
                    )
                END AS cents`}

            FROM "InventoryStockLot" lot
            JOIN "InventoryItem" i
                ON i.id = lot."inventoryItemId"
            LEFT JOIN "PurchaseItem" source
                ON source.id = lot."purchaseItemId"
            LEFT JOIN "Purchase" pu
                ON pu.id = source."purchaseId"
            WHERE i."businessId" = ${businessId}
                AND i."isActive" = TRUE
                AND (
                    lot."purchaseItemId" IS NULL
                    OR (
                        pu."businessId" = ${businessId}
                        AND pu."receiptStatus" = 'RECEIVED'
                    )
                )
            GROUP BY lot."inventoryItemId"
        ), base AS (
            SELECT i.id, i."productId", i."createdAt", i.color, i.size, i.sku,
                p.name, p.category, ba.total AS "totalStock",
                ba.defective AS "defectiveStock",
                ba.total - ba.defective AS "goodStock",
                ba.cents AS "goodStockValueCents",
                ba."averageUnitCost" AS "averageUnitCost",
                lower(normalize(concat_ws(' ', p.name, i.sku, p.brand, p.category, i.color, i.size), NFKC)) AS searchable
            FROM "InventoryItem" i
            JOIN "Product" p ON p.id = i."productId"
            JOIN balances ba ON ba.id = i.id
            WHERE i."businessId" = ${businessId} AND p."businessId" = ${businessId} AND i."isActive" = TRUE
        ), filtered AS (
            SELECT b.* FROM base b WHERE ${where}
        ), totals AS (
            SELECT count(*)::int AS total, greatest(1, ceil(count(*)::numeric / ${pageSize}))::int AS pages FROM filtered
        ), paging AS (
            SELECT total, pages, least(${requestedPage}, pages)::int AS page FROM totals
        ), page_rows AS (
            SELECT b.* FROM filtered b ORDER BY ${order}
            LIMIT ${pageSize} OFFSET (SELECT (page - 1)::bigint * ${pageSize} FROM paging)
        ) ${purpose === "page" ? Prisma.sql`, categories AS (
            SELECT lower(normalize(coalesce(nullif(trim(category), ''), 'კატეგორიის გარეშე'), NFKC)) COLLATE "C" AS key,
                min(coalesce(nullif(trim(category), ''), 'კატეგორიის გარეშე')) AS label,
                sum("goodStock")::text AS quantity,
                CASE
                    WHEN BOOL_OR("goodStockValueCents" IS NULL)
                    THEN NULL
                    ELSE sum("goodStockValueCents")
                END::text AS "valueCents"
            FROM base WHERE "goodStock" > 0 GROUP BY 1
        )` : Prisma.empty}
        SELECT ${snapshot} AS snapshot FROM paging pg
    `);
    if (!row) throw new Error("Inventory snapshot was not returned");
    return { ...row.snapshot, filter, controls };
}
