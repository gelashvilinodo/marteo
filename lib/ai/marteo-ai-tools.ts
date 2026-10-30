import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type { createPrismaClient } from "@/lib/prisma";
import { getHomeSummary } from "@/lib/dashboard/get-home-summary";
import { getHomeLists } from "@/lib/dashboard/get-home-lists";
import { getOrdersSummary } from "@/lib/orders/get-orders-summary";
import { getInventoryPage } from "@/lib/inventory/get-inventory-page";

// ყველა ხელსაწყო მხოლოდ კითხულობს და აბრუნებს ჯამებს ან მოკლე სიებს.
// ბიზნესი ყოველთვის სესიიდან მოდის და არასდროს მოდელის არგუმენტიდან.
export type AiToolContext = {
    businessId: string;
    prisma: ReturnType<typeof createPrismaClient>;
    now: Date;
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
    "custom",
] as const;

type Period = typeof PERIODS[number];
type Range = { from: string; to: string };

const PERIOD_DESCRIPTION =
    "Calendar period in Tbilisi time. this_week starts on Monday, this_month on the 1st, this_year on January 1; all of them end today. Use custom with from/to for any other range.";

const periodProperties = {
    period: { type: "string", enum: PERIODS, description: PERIOD_DESCRIPTION },
    from: { type: "string", description: "Start date YYYY-MM-DD, only for custom." },
    to: { type: "string", description: "End date YYYY-MM-DD (inclusive), only for custom." },
} as const;

export const AI_TOOLS: Anthropic.Tool[] = [
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
        description: "The 5 best-selling products in a period by quantity sold, with revenue.",
        input_schema: { type: "object", properties: periodProperties, required: ["period"] },
    },
    {
        name: "get_stock",
        description:
            "Product stock levels (not materials). filter low = 1 to 4 units left, exhausted = 0 units. query searches product names. Returns at most 15 rows plus totals.",
        input_schema: {
            type: "object",
            properties: {
                filter: { type: "string", enum: ["low", "exhausted", "all"] },
                query: { type: "string", description: "Optional product name search." },
            },
            required: ["filter"],
        },
    },
    {
        name: "find_orders",
        description:
            "Finds up to 5 orders by order number or by customer name, newest first. Returns status, payment status, date, customer, total and the products in each order (name, color, size, quantity, unit price, returned quantity).",
        input_schema: {
            type: "object",
            properties: {
                number: { type: "integer", description: "Order number, without #." },
                customer: { type: "string", description: "Part of the customer's first or last name." },
            },
        },
    },
];

class ToolInputError extends Error {}

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

async function findOrders(context: AiToolContext, input: Record<string, unknown>) {
    const number = Number.isSafeInteger(input.number) && Number(input.number) > 0 ? Number(input.number) : null;
    const customer = typeof input.customer === "string" ? input.customer.trim().slice(0, 60) : "";

    if (number === null && !customer) {
        throw new ToolInputError("Give an order number or a customer name.");
    }

    // დაბრუნებული რაოდენობები ჯამს აკლდება, როგორც მთავარ გვერდზე.
    const rows = await context.prisma.$queryRaw<OrderRow[]>`
        SELECT o.id, o.number, o."createdAt", o.status::text AS status, o."paymentStatus"::text AS "paymentStatus",
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
        GROUP BY o.id
        ORDER BY o."createdAt" DESC, o.id DESC
        LIMIT 5
    `;

    const ids = rows.map((row) => row.id);
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
        orders: rows.map((row) => ({
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
            return {
                range,
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
            const page = await getInventoryPage(context.prisma, businessId, { status: filter, q: query, sort: "quantity-asc" }, 15);
            return {
                matching_variants: page.totalProducts,
                low_variants_total: page.counts.low.species,
                exhausted_variants_total: page.counts.exhausted.species,
                items: page.products.map((item) => ({
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
