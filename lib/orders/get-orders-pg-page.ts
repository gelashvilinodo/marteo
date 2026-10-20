import "server-only";
import { sql, raw, join } from "@prisma/client-runtime-utils";
import type { createPgReader } from "@/lib/database/pg-reader";
import type { OrdersSearchParams, OrdersFilter, OrdersSort, OrdersPaymentFilter, OrdersPageData } from "./get-orders-page";
import { resolveOrdersPeriod } from "./orders-period";
import { getOrdersSummary } from "./get-orders-summary";
import { getOrderRecords } from "./get-order-records";
import { serializeOrderRecord } from "./serialize-order-record";

const PAGE_SIZE = 15;
const ordering: Record<OrdersSort, string> = {
    "date-desc": 'o."createdAt" DESC, o.id DESC',
    "date-asc": 'o."createdAt" ASC, o.id ASC',
    "number-desc": 'o.number DESC NULLS LAST, o.id DESC',
    "number-asc": 'o.number ASC NULLS LAST, o.id ASC',
    "recipient-asc": 'o."recipientFirstName" ASC, o."recipientLastName" ASC, o.id ASC',
    "recipient-desc": 'o."recipientFirstName" DESC, o."recipientLastName" DESC, o.id DESC',
};
const statuses: Record<Exclude<OrdersFilter, "all">, string> = {
    processing: "PROCESSING", shipped: "SHIPPED", completed: "COMPLETED", canceled: "CANCELED", returned: "RETURNED",
};

export async function getOrdersPgPage(
    client: ReturnType<typeof createPgReader>, businessId: string, params: OrdersSearchParams,
    singleOrderId?: string,
): Promise<OrdersPageData> {
    const text = (key: string) => typeof params[key] === "string" ? params[key].trim() : "";
    const allowedFilters: OrdersFilter[] = ["all", "processing", "shipped", "completed", "canceled", "returned"];
    const filter: OrdersFilter = allowedFilters.includes(text("status") as OrdersFilter) ? text("status") as OrdersFilter : "all";
    const sort: OrdersSort = Object.hasOwn(ordering, text("sort")) ? text("sort") as OrdersSort : "date-desc";
    const allowedPayments: OrdersPaymentFilter[] = ["all", "PAID", "UNPAID", "PARTIALLY_PAID", "COURIER_ONLY_PAID", "UNKNOWN"];
    const payment: OrdersPaymentFilter = allowedPayments.includes(text("payment") as OrdersPaymentFilter) ? text("payment") as OrdersPaymentFilter : "all";
    const range = resolveOrdersPeriod(text("period"), text("from"), text("to"));
    const query = text("q"), rawPage = Number(text("page"));
    const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const base = sql`o."businessId" = ${businessId} AND o."deletedAt" IS NULL AND o."createdAt" >= ${range.start} AND o."createdAt" < ${range.end}`;
    const clauses = [base];
    if (filter !== "all") clauses.push(sql`o.status = ${statuses[filter]}`);
    if (payment !== "all") clauses.push(sql`o."paymentStatus" = ${payment}`);
    if (query) {
        // Preserve Prisma contains semantics, including LIKE wildcards.
        const search = [
            sql`o."recipientFirstName" ILIKE ('%' || ${query} || '%')`,
            sql`o."recipientLastName" ILIKE ('%' || ${query} || '%')`,
            sql`o."shippingAddress" ILIKE ('%' || ${query} || '%')`,
            sql`EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o.id AND i."isActive" = true AND i.name ILIKE ('%' || ${query} || '%'))`,
        ];
        const possible = query.replace(/^#/, ""), number = /^\d+$/.test(possible) ? Number(possible) : null;
        if (number !== null && Number.isInteger(number) && number > 0 && number <= 2147483647) search.push(sql`o.number = ${number}`);
        const phone = query.replace(/\D/g, "");
        if (phone) search.push(sql`o."recipientPhone" LIKE ('%' || ${phone} || '%')`);
        clauses.push(sql`(${join(search, " OR ")})`);
    }
    const where = join(clauses, " AND ");
    return client.withReadTransaction(async tx => {
        const { grouped, invoiceCounts } = await getOrdersSummary(tx, businessId, range.start, range.end);
        const counts = { all: 0, processing: 0, shipped: 0, completed: 0, canceled: 0 };
        for (const group of grouped) {
            counts.all += group._count._all;
            const key = Object.entries(statuses).find(([, status]) => status === group.status)?.[0];
            if (key && key in counts) counts[key as keyof typeof counts] = group._count._all;
        }
        let totalOrders: number;
        if (!query && payment === "all") {
            totalOrders = filter === "all" ? counts.all : grouped.find(g => g.status === statuses[filter])?._count._all ?? 0;
        } else {
            const [count] = await tx.$queryRaw<Array<{ total: string }>>(sql`SELECT COUNT(*)::text AS total FROM "Order" o WHERE ${where}`);
            totalOrders = Number(count.total);
        }
        const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE)), currentPage = Math.min(requestedPage, totalPages);
        const rowWhere = singleOrderId ? sql`${base} AND o.id = ${singleOrderId}` : where;
        // Only trusted, allowlisted ORDER BY text is raw; every user value is bound.
        const ids = await tx.$queryRaw<Array<{ id: string }>>(sql`SELECT o.id FROM "Order" o WHERE ${rowWhere} ORDER BY ${raw(ordering[sort])} LIMIT ${singleOrderId ? 1 : PAGE_SIZE} OFFSET ${singleOrderId ? 0 : (currentPage - 1) * PAGE_SIZE}`);
        const records = await getOrderRecords(tx, businessId, ids.map(row => row.id), Boolean(singleOrderId));
        return {
            orders: records.map(record => serializeOrderRecord(record, Boolean(singleOrderId))), invoiceCounts, counts,
            filter, query, sort, payment, period: range.period, from: range.from, to: range.to, periodError: range.error,
            totalOrders, currentPage, totalPages, pageSize: PAGE_SIZE,
        };
    });
}
