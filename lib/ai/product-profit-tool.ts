import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { getInventoryPage } from "@/lib/inventory/get-inventory-page";
import type { AiToolContext } from "./marteo-ai-tools";

export const PRODUCT_PROFIT_TOOL: Omit<Anthropic.Tool, "input_schema"> = {
    name: "get_product_profit",
    description:
        "Profit per product for a period, from the sales ledger (returns and cancellations already subtracted): quantity sold, revenue, cost of goods, profit = revenue - cost of goods, margin percent. product searches the product name; omit it to rank all products by profit. General business expenses (ads, rent, courier) are not split per product and are not included. When some cost is unknown, profit is null and known_profit covers only the sales with known cost. The app shows the products as cards.",
};

type Row = {
    inventoryItemId: string | null;
    name: string;
    color: string | null;
    size: string | null;
    quantity: string;
    revenue: string;
    cost: string;
    costComplete: boolean;
    knownRevenue: string;
    knownCost: string;
};

function amount(value: number) {
    return (Math.round(value * 100) / 100).toFixed(2);
}

export async function productProfitTool(
    context: AiToolContext,
    range: { from: string; to: string },
    input: Record<string, unknown>,
    limit: number,
) {
    const query = typeof input.product === "string" ? input.product.trim().slice(0, 60) : "";
    const start = new Date(`${range.from}T00:00:00+04:00`);
    const end = new Date(new Date(`${range.to}T00:00:00+04:00`).getTime() + 86_400_000);

    // მარაგის პროდუქტი ვარიანტით ჯგუფდება, ხელით ჩაწერილი — სახელით.
    const rows = await context.prisma.$queryRaw<Row[]>`
        SELECT oi."inventoryItemId", MAX(fi.name) AS name, MAX(oi.color) AS color, MAX(oi.size) AS size,
            SUM(fi."quantityDelta")::text AS quantity,
            SUM(fi."revenueDelta")::text AS revenue,
            SUM(fi."costDelta")::text AS cost,
            BOOL_AND(fi."costComplete") AS "costComplete",
            COALESCE(SUM(fi."revenueDelta") FILTER (WHERE fi."costComplete"), 0)::text AS "knownRevenue",
            COALESCE(SUM(fi."costDelta") FILTER (WHERE fi."costComplete"), 0)::text AS "knownCost"
        FROM "OrderFinancialEntry" f
        JOIN "OrderFinancialEntryItem" fi ON fi."entryId" = f.id
        LEFT JOIN "OrderItem" oi ON oi.id = fi."sourceOrderItemId"
        WHERE f."businessId" = ${context.businessId}
            AND f."occurredAt" >= ${start} AND f."occurredAt" < ${end}
            AND (${query} = '' OR strpos(lower(fi.name), lower(${query})) > 0)
        GROUP BY COALESCE('inventory:' || oi."inventoryItemId", 'manual:' || lower(trim(fi.name))), oi."inventoryItemId"
        HAVING SUM(fi."quantityDelta") <> 0 OR SUM(fi."revenueDelta") <> 0
        ORDER BY SUM(fi."revenueDelta") - SUM(fi."costDelta") DESC, MAX(fi.name) ASC
        LIMIT ${limit}
    `;

    const products = rows.map((row) => {
        const revenue = Number(row.revenue);
        const profit = row.costComplete ? revenue - Number(row.cost) : null;
        const known = Number(row.knownRevenue) - Number(row.knownCost);
        return { row, revenue, profit, known };
    });

    const ids = rows.flatMap((row) => row.inventoryItemId ? [row.inventoryItemId] : []);
    if (ids.length > 0) {
        const page = await getInventoryPage(context.prisma, context.businessId, { ids }, ids.length);
        const items = ids.flatMap((id) => page.products.filter((item) => item.id === id));
        if (items.length > 0) {
            context.cards.push({
                kind: "stock",
                total: items.length,
                items,
                notes: Object.fromEntries(products.flatMap(({ row, revenue, profit, known }) => row.inventoryItemId
                    ? [[row.inventoryItemId, profit === null
                        ? `გაიყიდა ${Number(row.quantity)} ცალი · შემოსავალი ${amount(revenue)} ₾ · თვითღირებულება ნაწილობრივ უცნობია (ცნობილი მოგება ${amount(known)} ₾)`
                        : `გაიყიდა ${Number(row.quantity)} ცალი · შემოსავალი ${amount(revenue)} ₾ · მოგება ${amount(profit)} ₾`]]
                    : [])),
            });
        }
    }

    const total = products.reduce((sum, item) => sum + (item.profit ?? 0), 0);

    return {
        range,
        currency: "GEL",
        search: query || null,
        products: products.map(({ row, revenue, profit, known }) => ({
            name: row.name,
            variant: [row.color, row.size].filter(Boolean).join(" / ") || null,
            quantity_sold: Number(row.quantity),
            revenue: amount(revenue),
            cost_of_goods: profit === null ? null : row.cost,
            profit: profit === null ? null : amount(profit),
            known_profit: profit === null ? amount(known) : undefined,
            margin_percent: profit === null || revenue === 0 ? null : Math.round((profit / revenue) * 1000) / 10,
        })),
        total_profit_of_listed: products.every((item) => item.profit !== null) ? amount(total) : null,
        note: "Profit here is revenue minus cost of goods for these products only; general business expenses are not included.",
    };
}
