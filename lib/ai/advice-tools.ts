import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { getInventoryPage } from "@/lib/inventory/get-inventory-page";
import { getPurchasePlan } from "@/lib/purchases/purchase-plan";
import type { AiCardGroup } from "./ai-cards";
import { getBusinessInsights, type BusinessInsights, type InsightTopic } from "./business-insights";
import { getContentInsights, type ContentInsights } from "./content-insights";
import type { AiToolContext } from "./marteo-ai-tools";

export const ADVICE_TOPICS: InsightTopic[] = [
    "overview",
    "restock",
    "idle_stock",
    "variants",
    "margins",
    "returns",
    "customers",
    "operations",
    "timing",
    "content",
];

export const ADVICE_TOOLS: Anthropic.Tool[] = [
    {
        name: "get_business_advice",
        description:
            "Data-based recommendations, all calculated by the app. Topics: restock = products selling fast that will run out (with suggested quantity for the next purchase, based on sales speed, stock, goods in transit and delivery time); idle_stock = products not sold for 60+ days and the money tied up in them; variants = which colors/sizes of a product sell best; margins = products with low or negative margin, plus products missing a cost; returns = products returned often; customers = repeat buyers who stopped ordering; operations = orders stuck in shipped status or completed but not fully paid; timing = which weekdays and hours bring the most orders; content = the content calendar compared with sales: overdue posts (date passed, not done on every platform), peak order weekdays in the next 7 days with no post planned, and whether nothing is planned at all; overview = the most important points from every topic. The app shows the related products, customers and orders as cards; restock cards have a button to add them to the purchase list.",
        input_schema: {
            type: "object",
            properties: { topic: { type: "string", enum: ADVICE_TOPICS } },
            required: ["topic"],
        },
    },
    {
        name: "get_purchase_list",
        description:
            "The owner's purchase list (შესაძენი სია): products saved for the next purchase, with quantity, reason, current stock and estimated cost from the last purchase price.",
        input_schema: { type: "object", properties: {} },
    },
];

const insightsCache = new WeakMap<AiToolContext, Promise<BusinessInsights>>();

// ერთ პასუხში რამდენიმე თემის მოთხოვნისას მონაცემები ერთხელ ითვლება.
function insightsFor(context: AiToolContext) {
    let pending = insightsCache.get(context);
    if (!pending) {
        pending = getBusinessInsights(context.prisma, context.businessId, context.now);
        insightsCache.set(context, pending);
    }
    return pending;
}

const contentCache = new WeakMap<AiToolContext, Promise<ContentInsights>>();

function contentInsightsFor(context: AiToolContext, insights: BusinessInsights) {
    let pending = contentCache.get(context);
    if (!pending) {
        pending = getContentInsights(context.prisma, context.businessId, context.now, insights.timing);
        contentCache.set(context, pending);
    }
    return pending;
}

async function contentFor(context: AiToolContext, insights: BusinessInsights, limit: number) {
    const content = await contentInsightsFor(context, insights);
    if (content.status === "unused") {
        return { calendar_status: "unused", note: "The content calendar has not been used in the last 60 days; suggest it only if the user asks about posting." };
    }

    const rows = content.overdue.slice(0, limit);
    if (rows.length > 0) {
        context.cards.push({
            kind: "content",
            total: content.overdue.length,
            items: rows.map((row) => row.card),
            notes: Object.fromEntries(rows.map((row) => [row.card.id, row.note])),
        });
    }

    return {
        overdue_count: content.overdue.length,
        overdue: rows.map((row) => ({ title: row.card.title, days_overdue: row.days, pending_platforms: row.pending })),
        posts_next_7_days: content.upcoming,
        nothing_planned_next_7_days: content.nothingPlanned,
        peak_order_weekdays: content.peakWeekdays,
        peak_days_without_post_next_7_days: content.uncoveredPeakDays,
    };
}

function variant(item: { color: string | null; size: string | null }) {
    return [item.color, item.size].filter(Boolean).join(" / ") || null;
}

function lari(cents: number) {
    return (cents / 100).toFixed(2);
}

function pushStock(
    context: AiToolContext,
    rows: Array<{ item: AiCardGroup["items"][number]; note: string; suggested?: number; planned?: number | null }>,
) {
    if (rows.length === 0) return;

    const group: Extract<AiCardGroup, { kind: "stock" }> = {
        kind: "stock",
        total: rows.length,
        items: rows.map((row) => row.item as Extract<AiCardGroup, { kind: "stock" }>["items"][number]),
        notes: Object.fromEntries(rows.map((row) => [row.item.id, row.note])),
        restock: Object.fromEntries(rows
            .filter((row) => row.suggested !== undefined)
            .map((row) => [row.item.id, { quantity: row.suggested!, reason: row.note }])),
        planned: Object.fromEntries(rows
            .filter((row) => row.planned)
            .map((row) => [row.item.id, row.planned!])),
    };
    context.cards.push(group);
}

function restockFor(context: AiToolContext, insights: BusinessInsights, limit: number) {
    const rows = insights.restock.slice(0, limit);
    pushStock(context, rows.map((row) => ({
        item: row.item,
        note: row.note,
        suggested: context.purchasePlan ? row.suggested : undefined,
        planned: row.planned,
    })));

    return {
        delivery_days_used: insights.leadDays,
        found: insights.restock.length,
        products: rows.map((row) => ({
            name: row.item.name,
            variant: variant(row.item),
            in_stock: row.item.goodStock,
            in_transit: row.incoming,
            sold_last_30_days: row.soldLast30,
            per_day: row.perDay,
            days_left: row.daysLeft,
            last_batch: row.lastBatch,
            suggested_quantity: row.suggested,
            already_in_purchase_list: row.planned,
        })),
    };
}

function idleFor(context: AiToolContext, insights: BusinessInsights, limit: number) {
    const rows = insights.idle.slice(0, limit);
    pushStock(context, rows.map((row) => ({ item: row.item, note: row.note })));

    return {
        found: insights.idle.length,
        money_tied_up_gel: lari(insights.idleValueCents),
        products: rows.map((row) => ({
            name: row.item.name,
            variant: variant(row.item),
            in_stock: row.item.goodStock,
            days_without_sale: row.idleDays,
            never_sold: row.neverSold,
            value_gel: row.valueCents === null ? null : lari(row.valueCents),
        })),
    };
}

function marginsFor(context: AiToolContext, insights: BusinessInsights, limit: number) {
    const rows = insights.margins.slice(0, limit);
    pushStock(context, [
        ...rows.map((row) => ({ item: row.item, note: row.note })),
        ...insights.missingCost.slice(0, limit).map((item) => ({ item, note: "თვითღირებულება შევსებული არ არის — მოგება ზუსტად ვერ ითვლება." })),
    ]);

    return {
        low_margin_threshold_percent: 20,
        low_margin: rows.map((row) => ({
            name: row.item.name,
            variant: variant(row.item),
            sale_price: row.item.salePrice,
            average_cost: row.item.averageUnitCost,
            margin_percent: row.marginPercent,
        })),
        missing_cost_count: insights.missingCost.length,
    };
}

function returnsFor(context: AiToolContext, insights: BusinessInsights, limit: number) {
    const rows = insights.returns.slice(0, limit);
    pushStock(context, rows.map((row) => ({ item: row.item, note: row.note })));

    return {
        period_days: 90,
        products: rows.map((row) => ({
            name: row.item.name,
            variant: variant(row.item),
            sold: row.sold,
            returned: row.returned,
            return_rate_percent: row.ratePercent,
            main_reason: row.topReason,
        })),
    };
}

// ტელეფონი და მისამართი მოდელს არ ეგზავნება, მხოლოდ ბარათზე ჩანს.
function customersFor(context: AiToolContext, insights: BusinessInsights, limit: number) {
    const rows = insights.customers.slice(0, limit);
    if (rows.length > 0) {
        context.cards.push({
            kind: "customers",
            total: insights.customers.length,
            items: rows.map((row) => row.customer),
            notes: Object.fromEntries(rows.map((row) => [row.customer.id, row.note])),
        });
    }

    return {
        rule: "2+ completed orders, nothing ordered in the last 60 days",
        found: insights.customers.length,
        customers: rows.map((row) => ({
            name: [row.customer.firstName, row.customer.lastName].filter(Boolean).join(" ") || null,
            completed_orders: row.customer.completedOrders,
            days_since_last_order: row.daysSinceLastOrder,
        })),
    };
}

function operationsFor(context: AiToolContext, insights: BusinessInsights, limit: number) {
    const rows = insights.orders.slice(0, limit);
    if (rows.length > 0) {
        context.cards.push({
            kind: "orders",
            total: insights.orders.length,
            items: rows.map((row) => row.order),
            notes: Object.fromEntries(rows.map((row) => [row.order.id, row.note])),
        });
    }

    return {
        stuck_shipped_over_7_days: insights.orders.filter((row) => row.kind === "stuck_shipped").length,
        completed_not_fully_paid: insights.orders.filter((row) => row.kind === "unpaid_completed").length,
        orders: rows.map((row) => ({ number: row.order.number, problem: row.kind, days: row.days, total: row.order.total })),
    };
}

async function adviceTool(topic: InsightTopic, context: AiToolContext) {
    const insights = await insightsFor(context);

    // კალენდარს გაყიდვების გარეშეც შეიძლება ჰქონდეს პოსტები, ამიტომ ის მაინც მოწმდება.
    if (insights.data.status === "no_data" && topic !== "content") {
        return {
            data_status: "no_data",
            products_in_stock: 0,
            orders: 0,
            note: "The business has not added any products or orders yet, so there is nothing to analyse. This is not an error.",
        };
    }

    switch (topic) {
        case "restock": return restockFor(context, insights, 30);
        case "idle_stock": return idleFor(context, insights, 30);
        case "margins": return marginsFor(context, insights, 15);
        case "returns": return returnsFor(context, insights, 15);
        case "customers": return customersFor(context, insights, 20);
        case "operations": return operationsFor(context, insights, 20);
        case "variants": return { period_days: 90, products: insights.variants };
        case "timing": return { period_days: 90, ...insights.timing };
        case "content": return contentFor(context, insights, 30);
        case "overview":
        default:
            return {
                data_status: insights.data.status,
                products_in_stock: insights.data.products,
                orders: insights.data.orders,
                products_sold_last_90_days: insights.data.soldProducts90Days,
                restock: restockFor(context, insights, 5),
                idle_stock: idleFor(context, insights, 3),
                margins: { low_margin_count: insights.margins.length, missing_cost_count: insights.missingCost.length },
                returns: { high_return_products: insights.returns.length },
                customers: customersFor(context, insights, 3),
                operations: operationsFor(context, insights, 3),
                timing: { best_weekdays: insights.timing.weekdays.slice(0, 2), best_hours: insights.timing.bestHours },
                content: await contentFor(context, insights, 3),
                note: "Pick the 3-5 most important points. Each has its own topic for details.",
            };
    }
}

async function purchaseListTool(context: AiToolContext) {
    const plan = await getPurchasePlan(context.prisma, context.businessId);

    if (plan.length > 0) {
        const page = await getInventoryPage(context.prisma, context.businessId, { ids: plan.map((row) => row.inventoryItemId) }, plan.length);
        const items = plan.flatMap((row) => page.products.filter((item) => item.id === row.inventoryItemId));
        context.cards.push({
            kind: "stock",
            total: items.length,
            items,
            notes: Object.fromEntries(plan.map((row) => [row.inventoryItemId, `შესაძენ სიაშია: ${row.quantity} ცალი.${row.reason ? ` ${row.reason}` : ""}`])),
            planned: Object.fromEntries(plan.map((row) => [row.inventoryItemId, row.quantity])),
        });
    }

    const known = plan.filter((row) => row.lastUnitPrice !== null);
    const estimate = known.reduce((sum, row) => sum + Number(row.lastUnitPrice) * row.quantity, 0);

    return {
        currency: "GEL",
        items: plan.map((row) => ({
            name: row.name,
            variant: variant(row),
            quantity: row.quantity,
            in_stock: row.goodStock,
            last_unit_purchase_price: row.lastUnitPrice,
            reason: row.reason,
        })),
        estimated_cost: known.length > 0 ? estimate.toFixed(2) : null,
        estimate_note: known.length < plan.length
            ? `${plan.length - known.length} products have no previous purchase price and are not in the estimate.`
            : "Based on the last purchase price of each product; extra costs (shipping, customs) are not included.",
    };
}

export async function runAdviceTool(name: string, input: Record<string, unknown>, context: AiToolContext) {
    if (name === "get_purchase_list") return purchaseListTool(context);

    const topic = ADVICE_TOPICS.includes(input.topic as InsightTopic) ? input.topic as InsightTopic : "overview";
    const [result, insights] = await Promise.all([adviceTool(topic, context), insightsFor(context)]);
    return { data_status: insights.data.status, ...result };
}
