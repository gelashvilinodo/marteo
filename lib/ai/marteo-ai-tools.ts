import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { createPrismaClient } from "@/lib/prisma";
import { getHomeSummary } from "@/lib/dashboard/get-home-summary";
import { getHomeLists } from "@/lib/dashboard/get-home-lists";
import { getOrdersSummary } from "@/lib/orders/get-orders-summary";
import { getInventoryPage } from "@/lib/inventory/get-inventory-page";
import { getCustomersPage } from "@/lib/customers/get-customers-page";
import { getOrderRecords } from "@/lib/orders/get-order-records";
import { serializeOrderRecord } from "@/lib/orders/serialize-order-record";
import { AI_CARD_LIMIT, orderCard, type AiCardGroup } from "./ai-cards";
import { ADVICE_TOOLS, runAdviceTool } from "./advice-tools";
import { PRODUCT_PROFIT_TOOL, productProfitTool } from "./product-profit-tool";
import { CalendarInputError, CONTENT_CALENDAR_TOOL, contentCalendarTool } from "./content-calendar-tool";
import { POST_DRAFT_TOOL, PostDraftInputError, postDraftTool } from "./post-draft-tool";

// ყველა ხელსაწყო მხოლოდ კითხულობს და აბრუნებს ჯამებს ან მოკლე სიებს.
// ბიზნესი ყოველთვის სესიიდან მოდის და არასდროს მოდელის არგუმენტიდან.
export type AiToolContext = {
    businessId: string;
    prisma: ReturnType<typeof createPrismaClient>;
    now: Date;
    // შესაძენი სია მხოლოდ შესყიდვების მქონე ბიზნესებს აქვს.
    purchasePlan: boolean;
    // ნაპოვნი ჩანაწერები ჩატში ბარათებად ჩანს; მოდელი მხოლოდ მოკლე მონაცემებს იღებს.
    cards: AiCardGroup[];
};

const DAY = 86_400_000;
const TBILISI_OFFSET = 4 * 60 * 60 * 1000;

const PERIODS = [
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "last_7_days",
    "last_30_days",
    "this_year",
    "last_year",
    "all_time",
    "custom",
] as const;

type Period = typeof PERIODS[number];
type Range = { from: string; to: string };

const PERIOD_DESCRIPTION =
    "Calendar period in Tbilisi time. this_week starts on Monday, this_month on the 1st, this_year on January 1; all of them end today. all_time covers everything up to today. Use custom with from/to for any other range.";

const limitProperty = {
    type: "integer",
    minimum: 1,
    description: "How many results to return. Set it whenever the user asks for a specific number (\"one product\" = 1, \"top 3\" = 3).",
} as const;

const periodProperties = {
    period: { type: "string", enum: PERIODS, description: PERIOD_DESCRIPTION },
    from: { type: "string", description: "Start date YYYY-MM-DD, only for custom." },
    to: { type: "string", description: "End date YYYY-MM-DD (inclusive), only for custom." },
} as const;

const DATA_TOOLS: Anthropic.Tool[] = [
    {
        name: "get_business_summary",
        description:
            "Sales revenue, net profit, order count for a period, plus current units in stock. Profit is null when some product costs are still unknown; then partial_profit covers only orders with known costs.",
        input_schema: { type: "object", properties: periodProperties, required: ["period"] },
    },
    {
        name: "compare_periods",
        description:
            "Compares sales, profit and order count between two periods and returns the percent changes, already calculated. If previous_period is omitted, the matching earlier period is used (this_month -> last_month, today -> yesterday, otherwise the same number of days just before).",
        input_schema: {
            type: "object",
            properties: {
                current_period: periodProperties.period,
                current_from: periodProperties.from,
                current_to: periodProperties.to,
                previous_period: periodProperties.period,
                previous_from: periodProperties.from,
                previous_to: periodProperties.to,
            },
            required: ["current_period"],
        },
    },
    {
        name: "get_order_status_counts",
        description: "Number of orders created in a period, grouped by status.",
        input_schema: { type: "object", properties: periodProperties, required: ["period"] },
    },
    {
        name: "get_top_products",
        description: "The best-selling products in a period by quantity sold (up to 5), with revenue. The app shows them to the user as product cards with photos, in this order.",
        input_schema: { type: "object", properties: { ...periodProperties, limit: limitProperty }, required: ["period"] },
    },
    {
        name: "get_stock",
        description:
            "Product stock levels (not materials). filter low = 1 to 4 units left, exhausted = 0 units. query searches product names. Returns at most 15 rows plus totals. The app shows the found products to the user as cards with photos.",
        input_schema: {
            type: "object",
            properties: {
                filter: { type: "string", enum: ["low", "exhausted", "all"] },
                query: { type: "string", description: "Optional product name search." },
                limit: limitProperty,
            },
            required: ["filter"],
        },
    },
    {
        name: "get_stock_value",
        description:
            "How much money is in product stock now (not materials): cost_value = good units x purchase cost, sale_value = good units x sale price, and expected_profit when both are complete. Defective units are left out. When some costs or sale prices are missing, the total is null; then known_cost_value / known_sale_value cover only the variants that have them, and without_cost / without_sale_price name those variants (up to 20). query and category narrow it to matching products. show = missing_sale_price or missing_cost also shows those in-stock variants to the user as cards with photos and a details button, where the price can be filled in.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Optional product name search." },
                category: { type: "string", description: "Optional exact category name." },
                show: {
                    type: "string",
                    enum: ["missing_sale_price", "missing_cost"],
                    description: "Use it when the user asks which products have no sale price or no cost.",
                },
            },
        },
    },
    {
        name: "find_orders",
        description:
            "Finds orders by order number, customer name, product name, status and/or creation period, newest first. Returns found (the total count) and details of the 5 newest: status, payment status, date, customer, total and products (name, color, size, quantity, unit price, returned quantity). With product it also returns buyers: who bought that product (up to 20, canceled orders left out unless status is given) with their order count and quantity. The app shows all found orders to the user as cards.",
        input_schema: {
            type: "object",
            properties: {
                number: { type: "integer", description: "Order number, without #." },
                customer: { type: "string", description: "Part of the customer's first or last name." },
                product: { type: "string", description: "Part of a product name, for example from the conversation. Use it for \"who bought this product\"." },
                status: { type: "string", enum: ["PROCESSING", "SHIPPED", "COMPLETED", "CANCELED", "RETURNED"] },
                ...periodProperties,
                limit: limitProperty,
            },
        },
    },
    {
        name: "find_customers",
        description:
            "Finds the business's customers (buyers) by name, phone or address. filter repeat = 2 or more completed orders, top = the customer with the most completed orders. Returns found (the total count) and up to 20 customers with completed order count and last completed order date. The app shows them to the user as cards with phone and address.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Part of the name, phone or address. Omit to list all." },
                filter: { type: "string", enum: ["all", "repeat", "top"] },
                sort: {
                    type: "string",
                    enum: ["orders-desc", "last-order-desc", "name-asc"],
                    description: "orders-desc = most completed orders first.",
                },
                limit: limitProperty,
            },
        },
    },
];

export const AI_TOOLS: Anthropic.Tool[] = [
    ...DATA_TOOLS,
    {
        ...PRODUCT_PROFIT_TOOL,
        input_schema: {
            type: "object",
            properties: {
                ...periodProperties,
                product: { type: "string", description: "Part of the product name, for example from the conversation." },
                limit: limitProperty,
            },
            required: ["period"],
        },
    },
    CONTENT_CALENDAR_TOOL,
    POST_DRAFT_TOOL,
    ...ADVICE_TOOLS,
];

// როცა მომხმარებელი კონკრეტულ რაოდენობას ითხოვს („ერთი პროდუქტი“), მეტი ბარათი არ ჩანს.
function readLimit(input: Record<string, unknown>, max: number) {
    const value = Number(input.limit);
    return Number.isSafeInteger(value) && value >= 1 ? Math.min(value, max) : max;
}

class ToolInputError extends Error {}

// ტოპ პროდუქტები ბარათებად, იმავე რიგით. ხელით დამატებულ (მარაგის გარეშე)
// პროდუქტს ბარათი არ აქვს და მხოლოდ ტექსტში ჩანს.
async function pushTopProductCards(
    context: AiToolContext,
    products: Array<{ key: string; name: string; quantity: string; revenue: string }>,
) {
    const ranked = products.flatMap((product, index) =>
        product.key.startsWith("inventory:") ? [{ ...product, rank: index + 1, id: product.key.slice("inventory:".length) }] : []);
    if (ranked.length === 0) return;

    const page = await getInventoryPage(context.prisma, context.businessId, { ids: ranked.map((row) => row.id) }, ranked.length);
    const items = ranked.flatMap((row) => page.products.filter((item) => item.id === row.id));
    if (items.length === 0) return;

    context.cards.push({
        kind: "stock",
        total: items.length,
        items,
        notes: Object.fromEntries(ranked.map((row) => [
            row.id,
            `#${row.rank} · გაიყიდა ${Number(row.quantity)} ცალი · შემოსავალი ${Number(row.revenue).toFixed(2)} ₾`,
        ])),
    });
}

function tbilisiToday(now: Date) {
    return new Date(now.getTime() + TBILISI_OFFSET).toISOString().slice(0, 10);
}

function shiftDays(date: string, days: number) {
    return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * DAY).toISOString().slice(0, 10);
}

function isDate(value: unknown): value is string {
    return typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function resolveRange(period: unknown, from: unknown, to: unknown, now: Date): Range {
    const today = tbilisiToday(now);
    const weekday = (new Date(`${today}T00:00:00.000Z`).getUTCDay() + 6) % 7;
    const monthStart = `${today.slice(0, 7)}-01`;
    const year = Number(today.slice(0, 4));

    switch (period as Period) {
        case "today": return { from: today, to: today };
        case "yesterday": return { from: shiftDays(today, -1), to: shiftDays(today, -1) };
        case "this_week": return { from: shiftDays(today, -weekday), to: today };
        case "last_week": return { from: shiftDays(today, -weekday - 7), to: shiftDays(today, -weekday - 1) };
        case "this_month": return { from: monthStart, to: today };
        case "last_month": {
            const end = shiftDays(monthStart, -1);
            return { from: `${end.slice(0, 7)}-01`, to: end };
        }
        case "last_7_days": return { from: shiftDays(today, -6), to: today };
        case "last_30_days": return { from: shiftDays(today, -29), to: today };
        case "this_year": return { from: `${year}-01-01`, to: today };
        case "last_year": return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
        case "all_time": return { from: "2000-01-01", to: today };
        case "custom":
            if (!isDate(from) || !isDate(to) || from > to) {
                throw new ToolInputError("custom period needs valid from and to dates (YYYY-MM-DD, from <= to).");
            }
            return { from, to };
        default:
            throw new ToolInputError(`Unknown period. Use one of: ${PERIODS.join(", ")}.`);
    }
}

function previousRange(period: unknown, current: Range, now: Date): Range {
    const matching: Partial<Record<Period, Period>> = {
        today: "yesterday",
        this_week: "last_week",
        this_month: "last_month",
        this_year: "last_year",
    };
    const match = matching[period as Period];
    if (match) return resolveRange(match, "", "", now);

    const days = Math.round((Date.parse(current.to) - Date.parse(current.from)) / DAY) + 1;
    return { from: shiftDays(current.from, -days), to: shiftDays(current.from, -1) };
}

async function summarize(businessId: string, range: Range) {
    const summary = await getHomeSummary(
        businessId,
        { period: "custom", from: range.from, to: range.to },
        { stock: false, businessState: false },
    );

    return {
        sales: summary.sales,
        profit: summary.profit,
        partial_profit: summary.profit === null ? summary.partialProfit : undefined,
        orders: Number(summary.orders),
    };
}

function percentChange(current: string | number | null, previous: string | number | null) {
    if (current === null || previous === null) return null;

    const before = Number(previous);
    if (before === 0) return null;

    return Math.round(((Number(current) - before) / Math.abs(before)) * 1000) / 10;
}

const STATUS_LABELS: Record<string, string> = {
    PROCESSING: "მუშავდება",
    SHIPPED: "გაგზავნილი",
    COMPLETED: "დასრულებული",
    CANCELED: "გაუქმებული",
    RETURNED: "დაბრუნებული",
};

const PAYMENT_LABELS: Record<string, string> = {
    UNPAID: "გადაუხდელი",
    PAID: "გადახდილი",
    COURIER_ONLY_PAID: "მხოლოდ კურიერი გადახდილი",
    PARTIALLY_PAID: "ნაწილობრივ გადახდილი",
    UNKNOWN: "უცნობი",
};

type OrderRow = {
    id: string;
    found: number;
    number: number | null;
    createdAt: Date;
    status: string;
    paymentStatus: string;
    customer: string | null;
    items: number;
    total: string;
};

type OrderLineRow = {
    orderId: string;
    name: string;
    color: string | null;
    size: string | null;
    quantity: string;
    unitPrice: string;
    returned: string;
};

type BuyerRow = {
    customer: string | null;
    orders: number;
    quantity: string;
};

// მარაგის ღირებულება იგივე გამოთვლით, რაც მარაგების გვერდზე: თვითღირებულება პარტიებიდან, ფასი ვარიანტიდან.
async function stockValue(context: AiToolContext, input: Record<string, unknown>) {
    const query = typeof input.query === "string" ? input.query.trim().slice(0, 60) : "";
    const category = typeof input.category === "string" ? input.category.trim().slice(0, 60) : "";
    const page = await getInventoryPage(context.prisma, context.businessId, { q: query, category }, 5000);
    const inStock = page.products.filter((item) => item.goodStock > 0);

    let costCents = 0;
    let saleCents = 0;
    let withoutCost = 0;
    let withoutPrice = 0;
    for (const item of inStock) {
        if (item.goodStockValueCents === null) withoutCost++;
        else costCents += Number(item.goodStockValueCents);
        if (item.salePrice === null) withoutPrice++;
        else saleCents += Math.round(Number(item.salePrice) * 100) * item.goodStock;
    }

    const noCost = inStock.filter((item) => item.goodStockValueCents === null);
    const noPrice = inStock.filter((item) => item.salePrice === null);
    const shown = input.show === "missing_cost" ? noCost : input.show === "missing_sale_price" ? noPrice : [];
    if (shown.length > 0) {
        const note = input.show === "missing_cost" ? "თვითღირებულება არ არის შევსებული" : "გასაყიდი ფასი არ არის მითითებული";
        context.cards.push({
            kind: "stock",
            total: shown.length,
            items: shown.slice(0, AI_CARD_LIMIT),
            notes: Object.fromEntries(shown.slice(0, AI_CARD_LIMIT).map((item) => [item.id, note])),
        });
    }
    const label = (item: typeof inStock[number]) => ({ name: item.name, color: item.color, size: item.size, in_stock: item.goodStock });

    const money = (cents: number) => (cents / 100).toFixed(2);
    const costComplete = withoutCost === 0;
    const saleComplete = withoutPrice === 0;
    return {
        currency: "GEL",
        variants_in_stock: inStock.length,
        units_in_stock: inStock.reduce((sum, item) => sum + item.goodStock, 0),
        cost_value: costComplete ? money(costCents) : null,
        sale_value: saleComplete ? money(saleCents) : null,
        expected_profit: costComplete && saleComplete ? money(saleCents - costCents) : null,
        ...(costComplete ? {} : { known_cost_value: money(costCents), variants_without_cost: withoutCost, without_cost: noCost.slice(0, 20).map(label) }),
        ...(saleComplete ? {} : { known_sale_value: money(saleCents), variants_without_sale_price: withoutPrice, without_sale_price: noPrice.slice(0, 20).map(label) }),
        ...(page.totalProducts > page.products.length ? { note: `Only the first ${page.products.length} variants were counted.` } : {}),
    };
}

async function findOrders(context: AiToolContext, input: Record<string, unknown>) {
    const number = Number.isSafeInteger(input.number) && Number(input.number) > 0 ? Number(input.number) : null;
    const customer = typeof input.customer === "string" ? input.customer.trim().slice(0, 60) : "";
    const product = typeof input.product === "string" ? input.product.trim().slice(0, 60) : "";
    const status = typeof input.status === "string" && input.status in STATUS_LABELS ? input.status : "";
    const range = input.period ? resolveRange(input.period, input.from, input.to, context.now) : null;
    // createdAt UTC-ში ინახება დროის სარტყლის გარეშე; ISO სტრიქონი პირდაპირ ედრება.
    const start = range ? new Date(Date.parse(`${range.from}T00:00:00.000Z`) - TBILISI_OFFSET).toISOString() : null;
    const end = range ? new Date(Date.parse(`${range.to}T00:00:00.000Z`) + DAY - TBILISI_OFFSET).toISOString() : null;

    if (number === null && !customer && !product && !status && !range) {
        throw new ToolInputError("Give an order number, a customer name, a product name, a status or a period.");
    }

    // დაბრუნებული რაოდენობები ჯამს აკლდება, როგორც მთავარ გვერდზე.
    const rows = await context.prisma.$queryRaw<OrderRow[]>`
        SELECT o.id, (COUNT(*) OVER ())::int AS found, o.number, o."createdAt", o.status::text AS status, o."paymentStatus"::text AS "paymentStatus",
            NULLIF(TRIM(CONCAT_WS(' ', o."recipientFirstName", o."recipientLastName")), '') AS customer,
            COUNT(i.id)::int AS items,
            ROUND(o."courierFee" + COALESCE(SUM(CASE WHEN o."stockReturnedAt" IS NOT NULL THEN 0
                ELSE (i.quantity - COALESCE(r.quantity, 0)) * i."unitPrice" END), 0), 2)::text AS total
        FROM "Order" o
        LEFT JOIN "OrderItem" i ON i."orderId" = o.id AND i."isActive" = TRUE
        LEFT JOIN LATERAL (
            SELECT SUM(ri.quantity) AS quantity
            FROM "OrderReturnItem" ri
            JOIN "OrderReturn" ret ON ret.id = ri."returnId"
            WHERE ri."orderItemId" = i.id AND ret.status = 'RECEIVED' AND ret."fulfillmentCycle" = o."fulfillmentCycle"
        ) r ON TRUE
        WHERE o."businessId" = ${context.businessId}
            AND o."deletedAt" IS NULL
            AND (${number}::int IS NULL OR o.number = ${number}::int)
            AND (${customer} = '' OR strpos(lower(CONCAT_WS(' ', o."recipientFirstName", o."recipientLastName")), lower(${customer})) > 0)
            AND (${product} = '' OR EXISTS (
                SELECT 1 FROM "OrderItem" pi
                WHERE pi."orderId" = o.id AND pi."isActive" = TRUE AND strpos(lower(pi.name), lower(${product})) > 0
            ))
            AND (${status} = '' OR o.status::text = ${status})
            AND (${start}::timestamp IS NULL OR o."createdAt" >= ${start}::timestamp)
            AND (${end}::timestamp IS NULL OR o."createdAt" < ${end}::timestamp)
        GROUP BY o.id
        ORDER BY o."createdAt" DESC, o.id DESC
        LIMIT ${readLimit(input, AI_CARD_LIMIT)}
    `;

    // ვინ იყიდა პროდუქტი — ყველა ნაპოვნი შეკვეთიდან, არა მხოლოდ ბარათებად ნაჩვენებიდან.
    const buyers = !product ? [] : await context.prisma.$queryRaw<BuyerRow[]>`
        SELECT NULLIF(TRIM(CONCAT_WS(' ', o."recipientFirstName", o."recipientLastName")), '') AS customer,
            COUNT(DISTINCT o.id)::int AS orders, SUM(i.quantity)::text AS quantity
        FROM "Order" o
        JOIN "OrderItem" i ON i."orderId" = o.id AND i."isActive" = TRUE AND strpos(lower(i.name), lower(${product})) > 0
        WHERE o."businessId" = ${context.businessId}
            AND o."deletedAt" IS NULL
            AND (${number}::int IS NULL OR o.number = ${number}::int)
            AND (${customer} = '' OR strpos(lower(CONCAT_WS(' ', o."recipientFirstName", o."recipientLastName")), lower(${customer})) > 0)
            AND ((${status} = '' AND o.status::text <> 'CANCELED') OR o.status::text = ${status})
            AND (${start}::timestamp IS NULL OR o."createdAt" >= ${start}::timestamp)
            AND (${end}::timestamp IS NULL OR o."createdAt" < ${end}::timestamp)
        GROUP BY 1
        ORDER BY 2 DESC, SUM(i.quantity) DESC, 1
        LIMIT 20
    `;

    const records = await getOrderRecords(context.prisma, context.businessId, rows.map((row) => row.id), false);
    const cards = rows
        .map((row) => records.find((record) => record.id === row.id))
        .filter((record) => record !== undefined)
        .map((record) => orderCard(serializeOrderRecord(record, false)));
    context.cards.push({ kind: "orders", total: input.limit ? cards.length : rows[0]?.found ?? 0, items: cards });

    const detailed = rows.slice(0, 5);
    const ids = detailed.map((row) => row.id);
    // შეკვეთის პროდუქტები — მხოლოდ ამავე ბიზნესის ნაპოვნი შეკვეთებიდან.
    const lines = ids.length === 0 ? [] : await context.prisma.$queryRaw<OrderLineRow[]>`
        SELECT i."orderId", i.name, i.color, i.size, i.quantity::text AS quantity,
            i."unitPrice"::text AS "unitPrice", COALESCE(r.quantity, 0)::text AS returned
        FROM "OrderItem" i
        JOIN "Order" o ON o.id = i."orderId"
        LEFT JOIN LATERAL (
            SELECT SUM(ri.quantity) AS quantity
            FROM "OrderReturnItem" ri
            JOIN "OrderReturn" ret ON ret.id = ri."returnId"
            WHERE ri."orderItemId" = i.id AND ret.status = 'RECEIVED' AND ret."fulfillmentCycle" = o."fulfillmentCycle"
        ) r ON TRUE
        WHERE i."orderId" = ANY(${ids}::text[])
            AND o."businessId" = ${context.businessId}
            AND i."isActive" = TRUE
        ORDER BY i."orderId", i.id
    `;

    return {
        currency: "GEL",
        ...(range ? { range } : {}),
        found: rows[0]?.found ?? 0,
        ...(product ? {
            buyers: buyers.map((row) => ({ customer: row.customer, orders: row.orders, quantity: Number(row.quantity) })),
        } : {}),
        orders: detailed.map((row) => ({
            number: row.number,
            date: tbilisiToday(row.createdAt),
            status: STATUS_LABELS[row.status] ?? row.status,
            payment: PAYMENT_LABELS[row.paymentStatus] ?? row.paymentStatus,
            customer: row.customer,
            items: row.items,
            total: row.total,
            products: lines
                .filter((line) => line.orderId === row.id)
                .slice(0, 40)
                .map((line) => ({
                    name: line.name,
                    color: line.color,
                    size: line.size,
                    quantity: Number(line.quantity),
                    unit_price: line.unitPrice,
                    ...(Number(line.returned) > 0 ? { returned: Number(line.returned) } : {}),
                })),
        })),
    };
}

async function runTool(name: string, input: Record<string, unknown>, context: AiToolContext): Promise<unknown> {
    const { businessId, now } = context;

    switch (name) {
        case "get_business_summary": {
            const range = resolveRange(input.period, input.from, input.to, now);
            const [summary, stock] = await Promise.all([
                summarize(businessId, range),
                getHomeSummary(businessId, {}, { finance: false, orders: false, businessState: false }),
            ]);
            return { range, currency: "GEL", ...summary, units_in_stock_now: Number(stock.stock) };
        }
        case "compare_periods": {
            const current = resolveRange(input.current_period, input.current_from, input.current_to, now);
            const previous = input.previous_period
                ? resolveRange(input.previous_period, input.previous_from, input.previous_to, now)
                : previousRange(input.current_period, current, now);
            const [a, b] = await Promise.all([summarize(businessId, current), summarize(businessId, previous)]);
            return {
                currency: "GEL",
                current: { range: current, ...a },
                previous: { range: previous, ...b },
                change_percent: {
                    sales: percentChange(a.sales, b.sales),
                    profit: percentChange(a.profit, b.profit),
                    orders: percentChange(a.orders, b.orders),
                },
                note: "change_percent is null when the previous value is 0 or profit is unknown.",
            };
        }
        case "get_order_status_counts": {
            const range = resolveRange(input.period, input.from, input.to, now);
            const start = new Date(Date.parse(`${range.from}T00:00:00.000Z`) - TBILISI_OFFSET);
            const end = new Date(Date.parse(`${range.to}T00:00:00.000Z`) + DAY - TBILISI_OFFSET);
            const summary = await getOrdersSummary(context.prisma, businessId, start, end);
            const statuses = summary.grouped.map((group) => ({
                status: STATUS_LABELS[group.status] ?? group.status,
                count: group._count._all,
            }));
            return { range, total: statuses.reduce((sum, item) => sum + item.count, 0), statuses };
        }
        case "get_top_products": {
            const range = resolveRange(input.period, input.from, input.to, now);
            const lists = await getHomeLists(businessId, range.from, range.to, "products");
            lists.products = lists.products.slice(0, readLimit(input, 5));
            await pushTopProductCards(context, lists.products);
            return {
                range: input.period === "all_time" ? "all_time" : range,
                currency: "GEL",
                products: lists.products.map((product) => ({
                    name: product.name,
                    quantity: Number(product.quantity),
                    revenue: product.revenue,
                })),
            };
        }
        case "get_stock": {
            const filter = ["low", "exhausted", "all"].includes(String(input.filter)) ? String(input.filter) : "all";
            const query = typeof input.query === "string" ? input.query.slice(0, 60) : "";
            const page = await getInventoryPage(context.prisma, businessId, { status: filter, q: query, sort: "quantity-asc" }, readLimit(input, AI_CARD_LIMIT));
            context.cards.push({ kind: "stock", total: input.limit ? page.products.length : page.totalProducts, items: page.products });
            return {
                matching_variants: page.totalProducts,
                low_variants_total: page.counts.low.species,
                exhausted_variants_total: page.counts.exhausted.species,
                items: page.products.slice(0, 15).map((item) => ({
                    name: item.name,
                    color: item.color,
                    size: item.size,
                    in_stock: item.goodStock,
                    defective: item.defectiveStock,
                    status: item.goodStock === 0 ? "ამოწურული" : item.goodStock < 5 ? "მცირე მარაგი" : "მარაგშია",
                })),
            };
        }
        case "find_orders":
            return findOrders(context, input);
        case "get_stock_value":
            return stockValue(context, input);
        case "get_product_profit": {
            const range = resolveRange(input.period, input.from, input.to, now);
            const result = await productProfitTool(context, range, input, readLimit(input, AI_CARD_LIMIT));
            return input.period === "all_time" ? { ...result, range: "all_time" } : result;
        }
        case "get_content_calendar":
            try {
                return await contentCalendarTool(context, input);
            } catch (error) {
                if (error instanceof CalendarInputError) throw new ToolInputError(error.message);
                throw error;
            }
        case "prepare_post_draft":
            try {
                return postDraftTool(context, input);
            } catch (error) {
                if (error instanceof PostDraftInputError) throw new ToolInputError(error.message);
                throw error;
            }
        case "get_business_advice":
        case "get_purchase_list":
            return runAdviceTool(name, input, context);
        case "find_customers": {
            const query = typeof input.query === "string" ? input.query.trim().slice(0, 60) : "";
            const filter = ["repeat", "top"].includes(String(input.filter)) ? String(input.filter) : "all";
            const sort = ["orders-desc", "last-order-desc", "name-asc"].includes(String(input.sort)) ? String(input.sort) : "orders-desc";
            const page = await getCustomersPage(context.prisma, businessId, { q: query, filter, sort });
            page.customers = page.customers.slice(0, readLimit(input, page.customers.length));
            context.cards.push({ kind: "customers", total: input.limit ? page.customers.length : page.totalCount, items: page.customers });
            // ტელეფონი და მისამართი მოდელს არ ეგზავნება — ისინი მხოლოდ ბარათზე ჩანს.
            return {
                found: page.totalCount,
                customers: page.customers.map((item) => ({
                    name: [item.firstName, item.lastName].filter(Boolean).join(" ") || null,
                    completed_orders: item.completedOrders,
                    last_completed_order: item.lastOrderAt ? tbilisiToday(new Date(item.lastOrderAt)) : null,
                })),
            };
        }
        default:
            throw new ToolInputError(`Unknown tool ${name}.`);
    }
}

// შეცდომა მოდელს ტექსტად უბრუნდება, რომ არგუმენტი თვითონ გაასწოროს.
export async function executeAiTool(
    block: Anthropic.ToolUseBlock,
    context: AiToolContext,
): Promise<Anthropic.ToolResultBlockParam> {
    const input = block.input && typeof block.input === "object" ? block.input as Record<string, unknown> : {};

    try {
        const result = await runTool(block.name, input, context);
        return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) };
    } catch (error) {
        if (!(error instanceof ToolInputError)) {
            console.error("Marteo AI tool failed", block.name, error instanceof Error ? error.name : "UnknownError");
        }
        return {
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: error instanceof ToolInputError ? error.message : "Data could not be loaded.",
        };
    }
}
