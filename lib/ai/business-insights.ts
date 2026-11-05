import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import type { CustomerEntry } from "@/lib/customers/get-customers-page";
import type { InventoryProduct } from "@/components/dashboard/inventory/InventoryView";
import { getInventoryPage } from "@/lib/inventory/get-inventory-page";
import { getOrderRecords } from "@/lib/orders/get-order-records";
import { serializeOrderRecord } from "@/lib/orders/serialize-order-record";
import { orderCard, type AiOrderCard } from "./ai-cards";

// ყველა რჩევა აქ, კოდში ითვლება: სიჩქარე, ამოწურვის დღეები, რაოდენობა და ზღვრები.
// მოდელი მხოლოდ ამ შედეგებს ხსნის და არასდროს ითვლის თავად.
type Client = ReturnType<typeof createPrismaClient>;

const DAY = 86_400_000;

// ზღვრები: რჩევა მხოლოდ საკმარისი მონაცემის შემდეგ, რომ ერთმა შემთხვევითმა
// შეკვეთამ შეცდომაში არ შეგვიყვანოს.
const MIN_SOLD_FOR_VELOCITY = 3;
const DEFAULT_LEAD_DAYS = 7;
const COVER_DAYS = 30;
const WARN_EXTRA_DAYS = 14;
const IDLE_DAYS = 60;
const LOW_MARGIN = 0.2;
const MIN_SOLD_FOR_RETURNS = 5;
const HIGH_RETURN_RATE = 0.2;
const LAPSED_DAYS = 60;
const STUCK_SHIPPED_DAYS = 7;
const LIST_LIMIT = 30;

export type RestockAdvice = {
    item: InventoryProduct;
    soldLast30: number;
    perDay: number;
    incoming: number;
    daysLeft: number;
    suggested: number;
    lastBatch: { quantity: number; sold: number; days: number } | null;
    planned: number | null;
    note: string;
};

export type IdleAdvice = { item: InventoryProduct; idleDays: number; neverSold: boolean; valueCents: number | null; note: string };
export type MarginAdvice = { item: InventoryProduct; marginPercent: number; note: string };
export type ReturnAdvice = { item: InventoryProduct; sold: number; returned: number; ratePercent: number; topReason: string; note: string };
export type VariantMix = { product: string; totalSold: number; variants: Array<{ id: string; variant: string; sold: number; sharePercent: number }> };
export type CustomerAdvice = { customer: CustomerEntry; daysSinceLastOrder: number; note: string };
export type OrderAdvice = { order: AiOrderCard; kind: "stuck_shipped" | "unpaid_completed"; days: number; note: string };
export type Timing = {
    orders: number;
    weekdays: Array<{ day: string; orders: number }>;
    bestHours: Array<{ hours: string; orders: number }>;
};

// რამდენი მონაცემი აქვს ბიზნესს: ცარიელ ანგარიშზე AI ამბობს, რომ მონაცემები ჯერ არ არის,
// და არა რომ რაღაც ვერ ჩაიტვირთა.
export type DataStatus = {
    status: "no_data" | "no_sales" | "ok";
    products: number;
    orders: number;
    soldProducts90Days: number;
};

export type BusinessInsights = {
    data: DataStatus;
    leadDays: number;
    restock: RestockAdvice[];
    idle: IdleAdvice[];
    idleValueCents: number;
    margins: MarginAdvice[];
    missingCost: InventoryProduct[];
    returns: ReturnAdvice[];
    variants: VariantMix[];
    customers: CustomerAdvice[];
    orders: OrderAdvice[];
    timing: Timing;
};

export type InsightTopic =
    | "overview"
    | "restock"
    | "idle_stock"
    | "variants"
    | "margins"
    | "returns"
    | "customers"
    | "operations"
    | "timing"
    | "content";

const WEEKDAYS = ["ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი", "პარასკევი", "შაბათი", "კვირა"];
const RETURN_REASONS: Record<string, string> = { DEFECT: "წუნი", EXCHANGE: "გადაცვლა", OTHER: "სხვა მიზეზი" };

function variantLabel(item: Pick<InventoryProduct, "color" | "size">) {
    return [item.color, item.size].filter(Boolean).join(" · ") || "ძირითადი";
}

function days(from: Date | string, now: Date) {
    return Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / DAY));
}

function round1(value: number) {
    return Math.round(value * 10) / 10;
}

function money(cents: number) {
    return `${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₾`;
}

type SalesRow = { id: string; sold30: string; sold60: string; sold90: string; gross90: string; lastSale: Date | null };
type LotRow = { id: string; quantity: number; remaining: number; availableAt: Date };

// იმპორტირებული შეკვეთების პროდუქტები მარაგს არ უკავშირდება, ამიტომ მათთვის
// მარაგის ვარიანტი სახელით, ფერით და ზომით იძებნება (ზომა ვარიანტის სიაში
// უნდა იყოს). მხოლოდ ზუსტად ერთი დამთხვევა ითვლება.
function soldItemId(businessId: string) {
    return Prisma.sql`COALESCE(oi."inventoryItemId", (
        SELECT CASE WHEN COUNT(*) = 1 THEN MIN(i.id) END
        FROM "InventoryItem" i
        JOIN "Product" p ON p.id = i."productId"
        WHERE i."businessId" = ${businessId}
            AND lower(trim(p.name)) = lower(trim(oi.name))
            AND lower(coalesce(trim(i.color), '')) = lower(coalesce(trim(oi.color), ''))
            AND (nullif(trim(oi.size), '') IS NULL OR nullif(trim(i.size), '') IS NULL
                OR lower(trim(oi.size)) = ANY (SELECT lower(trim(s)) FROM unnest(string_to_array(i.size, ',')) s))
    ))`;
}

async function loadSales(prisma: Client, businessId: string, now: Date) {
    const d30 = new Date(now.getTime() - 30 * DAY);
    const d60 = new Date(now.getTime() - 60 * DAY);
    const d90 = new Date(now.getTime() - 90 * DAY);

    // გაყიდვები ფინანსური ჟურნალიდან: დაბრუნება და გაუქმება იქ უკვე უარყოფითად ჩანს.
    return prisma.$queryRaw<SalesRow[]>`
        SELECT s.id,
            COALESCE(SUM(s.quantity) FILTER (WHERE s."occurredAt" >= ${d30}), 0)::text AS sold30,
            COALESCE(SUM(s.quantity) FILTER (WHERE s."occurredAt" >= ${d60}), 0)::text AS sold60,
            COALESCE(SUM(s.quantity) FILTER (WHERE s."occurredAt" >= ${d90}), 0)::text AS sold90,
            COALESCE(SUM(s.quantity) FILTER (WHERE s."occurredAt" >= ${d90} AND s.quantity > 0), 0)::text AS gross90,
            MAX(s."occurredAt") FILTER (WHERE s.quantity > 0) AS "lastSale"
        FROM (
            SELECT ${soldItemId(businessId)} AS id, fi."quantityDelta" AS quantity, f."occurredAt"
            FROM "OrderFinancialEntry" f
            JOIN "OrderFinancialEntryItem" fi ON fi."entryId" = f.id
            JOIN "OrderItem" oi ON oi.id = fi."sourceOrderItemId"
            WHERE f."businessId" = ${businessId}
        ) s
        WHERE s.id IS NOT NULL
        GROUP BY s.id
    `;
}

async function loadLots(prisma: Client, businessId: string) {
    return prisma.$queryRaw<LotRow[]>`
        SELECT DISTINCT ON (lot."inventoryItemId") lot."inventoryItemId" AS id, lot.quantity,
            lot."remainingQuantity" AS remaining, lot."availableAt"
        FROM "InventoryStockLot" lot
        JOIN "InventoryItem" i ON i.id = lot."inventoryItemId"
        JOIN "PurchaseItem" pi ON pi.id = lot."purchaseItemId"
        JOIN "Purchase" pu ON pu.id = pi."purchaseId"
        WHERE i."businessId" = ${businessId} AND pu."businessId" = ${businessId} AND pu."receiptStatus" = 'RECEIVED'
        ORDER BY lot."inventoryItemId", lot."availableAt" DESC, lot.id DESC
    `;
}

async function loadIncoming(prisma: Client, businessId: string) {
    return prisma.$queryRaw<Array<{ id: string; quantity: number }>>`
        SELECT pi."inventoryItemId" AS id, SUM(pi.quantity)::int AS quantity
        FROM "PurchaseItem" pi
        JOIN "Purchase" pu ON pu.id = pi."purchaseId"
        WHERE pu."businessId" = ${businessId} AND pu."receiptStatus" = 'IN_TRANSIT' AND pu."archivedAt" IS NULL
        GROUP BY pi."inventoryItemId"
    `;
}

// მიწოდების დრო ბოლო ნახევარი წლის მიღებული შესყიდვებიდან (მედიანა).
async function loadLeadDays(prisma: Client, businessId: string, now: Date) {
    const since = new Date(now.getTime() - 180 * DAY);
    const [row] = await prisma.$queryRaw<Array<{ days: number | null }>>`
        SELECT percentile_cont(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (pu."receivedAt" - pu."purchaseDate")) / 86400
        ) AS days
        FROM "Purchase" pu
        WHERE pu."businessId" = ${businessId} AND pu."receivedAt" IS NOT NULL
            AND pu."receivedAt" > pu."purchaseDate" AND pu."purchaseDate" >= ${since}
    `;

    const value = row?.days === null || row?.days === undefined ? null : Number(row.days);
    return value === null || !Number.isFinite(value) ? DEFAULT_LEAD_DAYS : Math.min(90, Math.max(1, Math.round(value)));
}

async function loadReturns(prisma: Client, businessId: string, now: Date) {
    const since = new Date(now.getTime() - 90 * DAY);
    return prisma.$queryRaw<Array<{ id: string; returned: string; reason: string }>>`
        SELECT r.id, SUM(r.quantity)::text AS returned,
            MODE() WITHIN GROUP (ORDER BY r.reason) AS reason
        FROM (
            SELECT ${soldItemId(businessId)} AS id, ri.quantity, ri.reason::text AS reason
            FROM "OrderReturnItem" ri
            JOIN "OrderReturn" ret ON ret.id = ri."returnId"
            JOIN "Order" o ON o.id = ret."orderId"
            JOIN "OrderItem" oi ON oi.id = ri."orderItemId"
            WHERE o."businessId" = ${businessId} AND ret.status = 'RECEIVED' AND ret."createdAt" >= ${since}
        ) r
        WHERE r.id IS NOT NULL
        GROUP BY r.id
    `;
}

// სია რჩევებისთვის დამხმარეა: მისი წაკითხვის შეცდომა რჩევებს არ უნდა აჩერებდეს.
async function loadPlanned(prisma: Client, businessId: string) {
    try {
        return await prisma.purchasePlanItem.findMany({
            where: { businessId },
            select: { inventoryItemId: true, quantity: true },
        });
    } catch (error) {
        console.error("Purchase plan read failed", error instanceof Error ? error.name : "UnknownError");
        return [];
    }
}

async function countOrders(prisma: Client, businessId: string) {
    return prisma.order.count({ where: { businessId, deletedAt: null } });
}

function restockAdvice(
    products: InventoryProduct[],
    sales: Map<string, SalesRow>,
    lots: Map<string, LotRow>,
    incoming: Map<string, number>,
    planned: Map<string, number>,
    leadDays: number,
    now: Date,
): RestockAdvice[] {
    const result: RestockAdvice[] = [];

    for (const item of products) {
        const row = sales.get(item.id);
        if (!row) continue;

        const sold30 = Number(row.sold30);
        const sold60 = Number(row.sold60);
        const perDay = sold30 >= MIN_SOLD_FOR_VELOCITY ? sold30 / 30 : sold60 >= MIN_SOLD_FOR_VELOCITY ? sold60 / 60 : 0;
        if (perDay <= 0) continue;

        const coming = incoming.get(item.id) ?? 0;
        const daysLeft = (item.goodStock + coming) / perDay;
        if (daysLeft >= leadDays + WARN_EXTRA_DAYS) continue;

        const suggested = Math.max(1, Math.ceil(perDay * (leadDays + COVER_DAYS) - item.goodStock - coming));
        const lot = lots.get(item.id);
        const lastBatch = lot && lot.quantity > 0
            ? { quantity: lot.quantity, sold: lot.quantity - lot.remaining, days: Math.max(1, days(lot.availableAt, now)) }
            : null;

        const parts = [
            sold30 >= MIN_SOLD_FOR_VELOCITY
                ? `ბოლო 30 დღეში გაიყიდა ${round1(sold30)} ცალი`
                : `ბოლო 60 დღეში გაიყიდა ${round1(sold60)} ცალი`,
            item.goodStock === 0
                ? "მარაგი უკვე ამოწურულია"
                : `მარაგი ~${Math.max(1, Math.floor(daysLeft))} დღეში ამოიწურება`,
        ];
        if (coming > 0) parts.push(`გზაშია ${coming} ცალი`);
        if (lastBatch && lastBatch.sold > 0) {
            parts.push(`ბოლო პარტიიდან ${lastBatch.quantity}-დან ${lastBatch.sold} გაიყიდა ${lastBatch.days} დღეში`);
        }

        result.push({
            item,
            soldLast30: sold30,
            perDay: Math.round(perDay * 100) / 100,
            incoming: coming,
            daysLeft: Math.floor(daysLeft),
            suggested,
            lastBatch,
            planned: planned.get(item.id) ?? null,
            note: `${parts.join(". ")}. რეკომენდაცია: ~${suggested} ცალი.`,
        });
    }

    return result.sort((a, b) => a.daysLeft - b.daysLeft || b.perDay - a.perDay).slice(0, LIST_LIMIT);
}

function idleAdvice(products: InventoryProduct[], sales: Map<string, SalesRow>, now: Date): IdleAdvice[] {
    return products
        .filter((item) => item.goodStock > 0 && days(item.createdAt, now) >= IDLE_DAYS)
        .map((item) => {
            const last = sales.get(item.id)?.lastSale ?? null;
            const idleDays = days(last ?? item.createdAt, now);
            const valueCents = item.goodStockValueCents === null ? null : Number(item.goodStockValueCents);
            return { item, idleDays, neverSold: last === null, valueCents };
        })
        .filter((row) => row.idleDays >= IDLE_DAYS)
        .sort((a, b) => (b.valueCents ?? 0) - (a.valueCents ?? 0) || b.idleDays - a.idleDays)
        .slice(0, LIST_LIMIT)
        .map((row) => ({
            ...row,
            note: `${row.neverSold ? `დამატებიდან ${row.idleDays} დღეა არ გაყიდულა` : `${row.idleDays} დღეა არ გაყიდულა`}. მარაგშია ${row.item.goodStock} ცალი${row.valueCents ? `, გაჩერებულია ${money(row.valueCents)}` : ""}.`,
        }));
}

function marginAdvice(products: InventoryProduct[], sales: Map<string, SalesRow>): MarginAdvice[] {
    return products
        .filter((item) => item.salePrice !== null && item.averageUnitCost !== null && Number(item.salePrice) > 0)
        .filter((item) => item.goodStock > 0 || Number(sales.get(item.id)?.sold90 ?? 0) > 0)
        .map((item) => {
            const sale = Number(item.salePrice);
            const cost = Number(item.averageUnitCost);
            return { item, marginPercent: round1(((sale - cost) / sale) * 100), sale, cost };
        })
        .filter((row) => row.marginPercent < LOW_MARGIN * 100)
        .sort((a, b) => a.marginPercent - b.marginPercent)
        .slice(0, LIST_LIMIT)
        .map(({ item, marginPercent, sale, cost }) => ({
            item,
            marginPercent,
            note: marginPercent < 0
                ? `იყიდება თვითღირებულებაზე იაფად: ფასი ${sale.toFixed(2)} ₾, თვითღირებულება ${cost.toFixed(2)} ₾.`
                : `მარჟა მხოლოდ ${marginPercent}%: ფასი ${sale.toFixed(2)} ₾, თვითღირებულება ${cost.toFixed(2)} ₾.`,
        }));
}

function returnAdvice(
    products: Map<string, InventoryProduct>,
    sales: Map<string, SalesRow>,
    returns: Array<{ id: string; returned: string; reason: string }>,
): ReturnAdvice[] {
    return returns
        .map((row) => {
            const item = products.get(row.id);
            const sold = Number(sales.get(row.id)?.gross90 ?? 0);
            const returned = Number(row.returned);
            return item ? { item, sold, returned, rate: sold > 0 ? returned / sold : 0, reason: row.reason } : null;
        })
        .filter((row) => row !== null)
        .filter((row) => row.sold >= MIN_SOLD_FOR_RETURNS && row.rate >= HIGH_RETURN_RATE)
        .sort((a, b) => b.rate - a.rate)
        .slice(0, LIST_LIMIT)
        .map((row) => ({
            item: row.item,
            sold: row.sold,
            returned: row.returned,
            ratePercent: Math.round(row.rate * 100),
            topReason: RETURN_REASONS[row.reason] ?? row.reason,
            note: `ბოლო 90 დღეში ${row.sold}-დან დაბრუნდა ${row.returned} (${Math.round(row.rate * 100)}%). ძირითადი მიზეზი: ${RETURN_REASONS[row.reason] ?? row.reason}.`,
        }));
}

function variantMix(products: InventoryProduct[], sales: Map<string, SalesRow>): VariantMix[] {
    const groups = new Map<string, Array<{ id: string; variant: string; sold: number }>>();

    for (const item of products) {
        const sold = Number(sales.get(item.id)?.sold90 ?? 0);
        if (sold <= 0) continue;

        const list = groups.get(item.name) ?? [];
        list.push({ id: item.id, variant: variantLabel(item), sold });
        groups.set(item.name, list);
    }

    return [...groups.entries()]
        .map(([product, variants]) => ({ product, variants, totalSold: variants.reduce((sum, row) => sum + row.sold, 0) }))
        .filter((row) => row.variants.length >= 2 && row.totalSold >= 5)
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, 10)
        .map((row) => ({
            product: row.product,
            totalSold: round1(row.totalSold),
            variants: row.variants
                .sort((a, b) => b.sold - a.sold)
                .map((variant) => ({ ...variant, sold: round1(variant.sold), sharePercent: Math.round((variant.sold / row.totalSold) * 100) })),
        }));
}

type CustomerRow = Omit<CustomerEntry, "createdAt" | "lastOrderAt"> & { createdAt: Date; lastOrderAt: Date };

async function customerAdvice(prisma: Client, businessId: string, now: Date): Promise<CustomerAdvice[]> {
    const before = new Date(now.getTime() - LAPSED_DAYS * DAY);
    const rows = await prisma.$queryRaw<CustomerRow[]>`
        SELECT c.id, c."firstName", c."lastName", c.phone, c.address, c."createdAt",
            COUNT(o.id)::int AS "completedOrders", MAX(o."createdAt") AS "lastOrderAt"
        FROM "Customer" c
        JOIN "Order" o ON o."customerId" = c.id AND o."businessId" = ${businessId}
            AND o.status = 'COMPLETED' AND o."deletedAt" IS NULL
        WHERE c."businessId" = ${businessId} AND c."deletedAt" IS NULL
        GROUP BY c.id
        HAVING COUNT(o.id) >= 2 AND MAX(o."createdAt") < ${before}
            AND NOT EXISTS (
                SELECT 1 FROM "Order" recent
                WHERE recent."customerId" = c.id AND recent."businessId" = ${businessId}
                    AND recent."deletedAt" IS NULL AND recent."createdAt" >= ${before}
            )
        ORDER BY COUNT(o.id) DESC, MAX(o."createdAt") DESC
        LIMIT ${LIST_LIMIT}
    `;

    return rows.map((row) => {
        const since = days(row.lastOrderAt, now);
        return {
            customer: { ...row, createdAt: row.createdAt.toISOString(), lastOrderAt: row.lastOrderAt.toISOString() },
            daysSinceLastOrder: since,
            note: `${row.completedOrders} დასრულებული შეკვეთა, ბოლო ${since} დღის წინ. ღირს მიწერა ან ფასდაკლების შეთავაზება.`,
        };
    });
}

async function orderAdvice(prisma: Client, businessId: string, now: Date): Promise<OrderAdvice[]> {
    const stuckBefore = new Date(now.getTime() - STUCK_SHIPPED_DAYS * DAY);
    const rows = await prisma.$queryRaw<Array<{ id: string; kind: OrderAdvice["kind"]; createdAt: Date }>>`
        SELECT o.id, 'stuck_shipped' AS kind, o."createdAt"
        FROM "Order" o
        WHERE o."businessId" = ${businessId} AND o."deletedAt" IS NULL
            AND o.status = 'SHIPPED' AND o."createdAt" < ${stuckBefore}
        UNION ALL
        SELECT o.id, 'unpaid_completed' AS kind, o."createdAt"
        FROM "Order" o
        WHERE o."businessId" = ${businessId} AND o."deletedAt" IS NULL
            AND o.status = 'COMPLETED' AND o."paymentStatus" IN ('UNPAID', 'PARTIALLY_PAID', 'COURIER_ONLY_PAID')
        ORDER BY "createdAt" ASC
        LIMIT ${LIST_LIMIT}
    `;

    const records = await getOrderRecords(prisma, businessId, [...new Set(rows.map((row) => row.id))], false);

    return rows.flatMap((row) => {
        const record = records.find((entry) => entry.id === row.id);
        if (!record) return [];

        const card = orderCard(serializeOrderRecord(record, false));
        const age = days(row.createdAt, now);
        const note = row.kind === "stuck_shipped"
            ? `გაგზავნილია და ${age} დღეა არ დასრულებულა. გადაამოწმეთ კურიერთან.`
            : `დასრულებულია, მაგრამ სრულად არ არის გადახდილი (${card.total} ₾).`;
        return [{ order: card, kind: row.kind, days: age, note }];
    });
}

async function timing(prisma: Client, businessId: string, now: Date): Promise<Timing> {
    const since = new Date(now.getTime() - 90 * DAY);
    // კვირის დღე და საათი თბილისის დროით (UTC+4, ზაფხულის დროის გარეშე).
    const rows = await prisma.$queryRaw<Array<{ weekday: number; hour: number; orders: number }>>`
        SELECT (EXTRACT(ISODOW FROM o."createdAt" + INTERVAL '4 hours')::int - 1) AS weekday,
            EXTRACT(HOUR FROM o."createdAt" + INTERVAL '4 hours')::int AS hour,
            COUNT(*)::int AS orders
        FROM "Order" o
        WHERE o."businessId" = ${businessId} AND o."deletedAt" IS NULL
            AND o.status <> 'CANCELED' AND o."createdAt" >= ${since}
        GROUP BY 1, 2
    `;

    const weekdays = WEEKDAYS.map((day, index) => ({
        day,
        orders: rows.filter((row) => row.weekday === index).reduce((sum, row) => sum + row.orders, 0),
    }));
    const hours = Array.from({ length: 24 }, (_, hour) =>
        rows.filter((row) => row.hour === hour).reduce((sum, row) => sum + row.orders, 0));
    // სამსაათიანი ფანჯრები, რომ ერთმა საათმა შედეგი არ გადაწონოს.
    const windows = hours.map((_, start) => ({
        hours: `${String(start).padStart(2, "0")}:00–${String((start + 3) % 24).padStart(2, "0")}:00`,
        orders: hours[start] + hours[(start + 1) % 24] + hours[(start + 2) % 24],
    }));

    return {
        orders: hours.reduce((sum, value) => sum + value, 0),
        weekdays: weekdays.sort((a, b) => b.orders - a.orders),
        bestHours: windows.sort((a, b) => b.orders - a.orders).slice(0, 2),
    };
}

export async function getBusinessInsights(prisma: Client, businessId: string, now: Date): Promise<BusinessInsights> {
    const [page, salesRows, lotRows, incomingRows, leadDays, returnRows, plannedRows, customers, orders, timingData, orderCount] = await Promise.all([
        getInventoryPage(prisma, businessId, {}, 2000),
        loadSales(prisma, businessId, now),
        loadLots(prisma, businessId),
        loadIncoming(prisma, businessId),
        loadLeadDays(prisma, businessId, now),
        loadReturns(prisma, businessId, now),
        loadPlanned(prisma, businessId),
        customerAdvice(prisma, businessId, now),
        orderAdvice(prisma, businessId, now),
        timing(prisma, businessId, now),
        countOrders(prisma, businessId),
    ]);

    const products = page.products;
    const byId = new Map(products.map((item) => [item.id, item]));
    const sales = new Map(salesRows.map((row) => [row.id, row]));
    const lots = new Map(lotRows.map((row) => [row.id, row]));
    const incoming = new Map(incomingRows.map((row) => [row.id, row.quantity]));
    const planned = new Map(plannedRows.map((row) => [row.inventoryItemId, row.quantity]));
    const idle = idleAdvice(products, sales, now);
    const soldProducts = salesRows.filter((row) => Number(row.sold90) > 0).length;

    return {
        data: {
            status: products.length === 0 && orderCount === 0 ? "no_data" : soldProducts === 0 ? "no_sales" : "ok",
            products: page.totalProducts,
            orders: orderCount,
            soldProducts90Days: soldProducts,
        },
        leadDays,
        restock: restockAdvice(products, sales, lots, incoming, planned, leadDays, now),
        idle,
        idleValueCents: idle.reduce((sum, row) => sum + (row.valueCents ?? 0), 0),
        margins: marginAdvice(products, sales),
        missingCost: products.filter((item) => item.totalStock > 0 && item.averageUnitCost === null).slice(0, LIST_LIMIT),
        returns: returnAdvice(byId, sales, returnRows),
        variants: variantMix(products, sales),
        customers,
        orders,
        timing: timingData,
    };
}
