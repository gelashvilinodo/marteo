import "server-only";
import { sql, raw } from "@prisma/client-runtime-utils";
import type { createPgReader } from "@/lib/database/pg-reader";
import type { OrdersSearchParams, OrdersSort, OrdersPageData } from "./get-orders-page";
import { ORDER_STATUS_BY_FILTER as statuses, getOrdersViewCounts, resolveOrdersView } from "./orders-view-filter";
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

export async function getOrdersPgPage(
    client: ReturnType<typeof createPgReader>, businessId: string, params: OrdersSearchParams,
    singleOrderId?: string,
): Promise<OrdersPageData> {
    const text = (key: string) => typeof params[key] === "string" ? params[key].trim() : "";
    const sort: OrdersSort = Object.hasOwn(ordering, text("sort")) ? text("sort") as OrdersSort : "date-desc";
    const { filter, payment, query, range, base, where } = await resolveOrdersView(client, businessId, params);
    const rawPage = Number(text("page"));
    const requestedPage = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    return client.withReadTransaction(async tx => {
        const grouped = (await tx.$queryRaw<Array<{ status: string; count: string }>>(sql`
            SELECT o.status::text AS status, COUNT(*)::text AS count FROM "Order" o WHERE ${base} GROUP BY o.status
        `)).map(group => ({ status: group.status, _count: { _all: Number(group.count) } }));
        const { invoiceCounts, queueCounts } = await getOrdersViewCounts(tx, where);
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
            orders: records.map(record => serializeOrderRecord(record, Boolean(singleOrderId))), invoiceCounts, queueCounts, counts,
            filter, query, sort, payment, period: range.period, from: range.from, to: range.to, periodError: range.error,
            totalOrders, currentPage, totalPages, pageSize: PAGE_SIZE,
        };
    });
}
