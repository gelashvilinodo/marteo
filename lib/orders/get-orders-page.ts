import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getOrdersSummary } from "./get-orders-summary";
import { getOrderRecords } from "./get-order-records";
import { serializeOrderRecord } from "./serialize-order-record";
import type { createPrismaClient } from "@/lib/prisma";

export type OrdersSearchParams = Record<
    string,
    string | string[] | undefined
>;

export type OrdersFilter =
    | "all"
    | "processing"
    | "shipped"
    | "completed"
    | "canceled"
    | "returned";

import { resolveOrdersPeriod } from "./orders-period";
export type OrdersSort = "date-desc" | "date-asc" | "number-desc" | "number-asc" | "recipient-asc" | "recipient-desc";
export type OrdersPaymentFilter = "all" | "PAID" | "UNPAID" | "PARTIALLY_PAID" | "COURIER_ONLY_PAID";
const PAGE_SIZE = 15;

export async function getOrdersPage(
    prisma: ReturnType<typeof createPrismaClient>,
    businessId: string,
    params: OrdersSearchParams,
    singleOrderId?: string,
) {
    function text(key: string) {
        const value = params[key];

        return typeof value === "string"
            ? value.trim()
            : "";
    }

    const allowedFilters: OrdersFilter[] = [
        "all",
        "processing",
        "shipped",
        "completed",
        "canceled",
        "returned",
    ];

    const requestedFilter =
        text("status") as OrdersFilter;

    const filter = allowedFilters.includes(requestedFilter)
        ? requestedFilter
        : "all";

    const range = resolveOrdersPeriod(text("period"), text("from"), text("to"));
    const allowedSorts: OrdersSort[] = ["date-desc", "date-asc", "number-desc", "number-asc", "recipient-asc", "recipient-desc"];
    const sort: OrdersSort = allowedSorts.includes(text("sort") as OrdersSort) ? text("sort") as OrdersSort : "date-desc";
    const allowedPayments: OrdersPaymentFilter[] = ["all", "PAID", "UNPAID", "PARTIALLY_PAID", "COURIER_ONLY_PAID"];
    const payment: OrdersPaymentFilter = allowedPayments.includes(text("payment") as OrdersPaymentFilter) ? text("payment") as OrdersPaymentFilter : "all";
    const ordering: Record<OrdersSort, Prisma.OrderOrderByWithRelationInput[]> = {
        "date-desc": [{ createdAt: "desc" }, { id: "desc" }],
        "date-asc": [{ createdAt: "asc" }, { id: "asc" }],
        "number-desc": [{ number: { sort: "desc", nulls: "last" } }, { id: "desc" }],
        "number-asc": [{ number: { sort: "asc", nulls: "last" } }, { id: "asc" }],
        "recipient-asc": [{ recipientFirstName: "asc" }, { recipientLastName: "asc" }, { id: "asc" }],
        "recipient-desc": [{ recipientFirstName: "desc" }, { recipientLastName: "desc" }, { id: "desc" }],
    };
    const query = text("q");
    const rawPage = Number(text("page"));

    const requestedPage =
        Number.isSafeInteger(rawPage) && rawPage > 0
            ? rawPage
            : 1;

    const baseWhere: Prisma.OrderWhereInput = {
        businessId,
        deletedAt: null,
        createdAt: { gte: range.start, lt: range.end },
    };

    const where: Prisma.OrderWhereInput = {
        ...baseWhere,
    };

    if (payment !== "all") where.paymentStatus = payment;

    if (filter !== "all") {
        where.status =
            filter === "processing"
                ? "PROCESSING"
                : filter === "shipped"
                    ? "SHIPPED"
                    : filter === "completed"
                        ? "COMPLETED"
                        : filter === "returned"
                            ? "RETURNED"
                            : "CANCELED";
    }

    if (query) {
        const possibleNumber = query.replace(/^#/, "");

        const number =
            /^\d+$/.test(possibleNumber)
                ? Number(possibleNumber)
                : null;

        const phoneQuery = query.replace(/\D/g, "");

        const search: Prisma.OrderWhereInput[] = [
            {
                recipientFirstName: {
                    contains: query,
                    mode: "insensitive",
                },
            },
            {
                recipientLastName: {
                    contains: query,
                    mode: "insensitive",
                },
            },
            {
                shippingAddress: {
                    contains: query,
                    mode: "insensitive",
                },
            },
            {
                items: {
                    some: {
                        isActive: true,
                        name: {
                            contains: query,
                            mode: "insensitive",
                        },
                    },
                },
            },
        ];

        if (
            number !== null &&
            Number.isInteger(number) &&
            number > 0 &&
            number <= 2147483647
        ) {
            search.push({ number });
        }

        if (phoneQuery) {
            search.push({
                recipientPhone: {
                    contains: phoneQuery,
                },
            });
        }

        where.OR = search;
    }

    return prisma.$transaction(
        async (tx) => {
            // ქარდები არჩეულ პერიოდს აჯამებს, ძებნისა და სხვა ფილტრების მიუხედავად.
            const { grouped, invoiceCounts } = await getOrdersSummary(tx, businessId, range.start, range.end);

            const counts = {
                all: 0,
                processing: 0,
                shipped: 0,
                completed: 0,
                canceled: 0,
            };

            for (const group of grouped) {
                const count = group._count._all;

                counts.all += count;

                switch (group.status) {
                    case "PROCESSING":
                        counts.processing = count;
                        break;
                    case "SHIPPED":
                        counts.shipped = count;
                        break;
                    case "COMPLETED":
                        counts.completed = count;
                        break;
                    case "CANCELED":
                        counts.canceled = count;
                        break;
                }
            }

            const totalOrders =
                !query && payment === "all"
                    ? filter === "all"
                        ? counts.all
                        : (
                            grouped.find(
                                group => group.status === where.status,
                            )?._count._all ?? 0
                        )
                    : await tx.order.count({
                        where,
                    });

            const totalPages = Math.max(
                1,
                Math.ceil(totalOrders / PAGE_SIZE),
            );

            const currentPage = Math.min(
                requestedPage,
                totalPages,
            );

            const orders = await tx.order.findMany({
                where: singleOrderId
                    ? { ...baseWhere, id: singleOrderId }
                    : where,
                skip: singleOrderId ? 0 : (currentPage - 1) * PAGE_SIZE,
                take: singleOrderId ? 1 : PAGE_SIZE,
                orderBy: ordering[sort],
                select: { id: true },
            });

            const records = await getOrderRecords(tx, businessId, orders.map(order => order.id), Boolean(singleOrderId));
            const entries = records.map(order => serializeOrderRecord(order, Boolean(singleOrderId)));

            return {
                orders: entries,
                invoiceCounts,
                counts,
                filter,
                query,
                sort,
                payment,
                period: range.period,
                from: range.from,
                to: range.to,
                periodError: range.error,
                totalOrders,
                currentPage,
                totalPages,
                pageSize: PAGE_SIZE,
            };
        },
        {
            isolationLevel:
                Prisma.TransactionIsolationLevel
                    .RepeatableRead,
            maxWait: 10000,
            timeout: 15000,
        },
    );
}

export type OrdersPageData = Awaited<
    ReturnType<typeof getOrdersPage>
>;

export type OrderEntry = OrdersPageData["orders"][number];
export type OrderDetailEntry = Extract<OrderEntry, { detailsLoaded: true }>;
