import "server-only";

import { Prisma } from "@/generated/prisma/client";
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
            const grouped = await tx.order.groupBy({
                by: ["status"],
                where: baseWhere,
                _count: { _all: true },
            });

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

            const [invoiceCount] = await tx.$queryRaw<Array<{ newCount: bigint; updatedCount: bigint }>>`
                SELECT COUNT(*) FILTER (WHERE "lastPrintedInvoiceVersion" IS NULL) AS "newCount",
                       COUNT(*) FILTER (WHERE "lastPrintedInvoiceVersion" IS NOT NULL AND "lastPrintedInvoiceVersion" <> "invoiceVersion") AS "updatedCount"
                FROM "Order" WHERE "businessId"=${businessId} AND "deletedAt" IS NULL AND "status" <> 'CANCELED'
            `;
            const invoiceCounts = { new: Number(invoiceCount?.newCount ?? 0), updated: Number(invoiceCount?.updatedCount ?? 0) };
            const totalOrders = await tx.order.count({
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
                where,
                skip: (currentPage - 1) * PAGE_SIZE,
                take: PAGE_SIZE,
                orderBy: ordering[sort],
                select: {
                    id: true,
                    number: true,
                    recipientPhone: true,
                    recipientFirstName: true,
                    recipientLastName: true,
                    shippingAddress: true,
                    status: true,
                    paymentStatus: true,
                    courierFee: true,
                    stockReturnedAt: true,
                    deleteRequestedAt: true,
                    fulfillmentCycle: true,
                    returns: {
                        where: {
                            status: { in: ["PENDING", "RECEIVED"] },
                        },
                        select: {
                            status: true,
                            fulfillmentCycle: true,
                            items: {
                                select: { quantity: true },
                            },
                        },
                    },
                    createdAt: true,
                    updatedAt: true,
                    invoiceVersion: true,
                    lastPrintedInvoiceVersion: true,
                    invoicePrintedAt: true,
                    items: {
                        where: { isActive: true },
                        orderBy: [
                            { createdAt: "asc" },
                            { id: "asc" },
                        ],
                        select: {
                            id: true,
                            inventoryItemId: true,
                            source: true,
                            condition: true,
                            name: true,
                            quantity: true,
                            description: true,
                            imageUrl: true,
                            color: true,
                            size: true,
                            unitPrice: true,
                            unitCost: true,
                        },
                    },
                    payments: {
                        orderBy: [
                            { createdAt: "asc" },
                            { id: "asc" },
                        ],
                        select: {
                            id: true,
                            amount: true,
                            method: true,
                            bankName: true,
                            createdAt: true,
                        },
                    },
                },
            });

            const entries = orders.map((order) => {
                const productsTotal = order.items.reduce(
                    (sum, item) =>
                        sum.plus(
                            item.unitPrice.mul(item.quantity),
                        ),
                    new Prisma.Decimal(0),
                );

                const total = productsTotal.plus(
                    order.courierFee,
                );

                const paidAmount = order.payments.reduce(
                    (sum, payment) =>
                        sum.plus(payment.amount),
                    new Prisma.Decimal(0),
                );

                const currentReturns = order.returns.filter(
                    entry =>
                        entry.fulfillmentCycle === order.fulfillmentCycle,
                );

                return {
                    ...order,
                    deleteRequestedAt:
                        order.deleteRequestedAt?.toISOString() ?? null,

                    hasReturnHistory: currentReturns.length > 0,

                    hasPastReturns: order.returns.some(
                        entry =>
                            entry.fulfillmentCycle !== order.fulfillmentCycle,
                    ),

                    pendingReturnQuantity: currentReturns
                        .filter(entry => entry.status === "PENDING")
                        .reduce(
                            (sum, entry) =>
                                sum + entry.items.reduce(
                                    (count, item) => count + item.quantity,
                                    0,
                                ),
                            0,
                        ),

                    receivedReturnQuantity: currentReturns
                        .filter(entry => entry.status === "RECEIVED")
                        .reduce(
                            (sum, entry) =>
                                sum + entry.items.reduce(
                                    (count, item) => count + item.quantity,
                                    0,
                                ),
                            0,
                        ),
                    createdAt:
                        order.createdAt.toISOString(),
                    updatedAt:
                        order.updatedAt.toISOString(),
                    printState: order.lastPrintedInvoiceVersion === null ? "NEW" as const : order.lastPrintedInvoiceVersion === order.invoiceVersion ? "PRINTED" as const : "UPDATED" as const,
                    invoicePrintedAt: order.invoicePrintedAt?.toISOString() ?? null,
                    stockReturnedAt:
                        order.stockReturnedAt
                            ?.toISOString() ?? null,
                    courierFee:
                        order.courierFee.toFixed(2),
                    productsTotal:
                        productsTotal.toFixed(2),
                    total: total.toFixed(2),
                    paidAmount: paidAmount.toFixed(2),
                    remainingAmount: Prisma.Decimal.max(
                        total.minus(paidAmount),
                        0,
                    ).toFixed(2),

                    refundDue: Prisma.Decimal.max(
                        paidAmount.minus(total),
                        0,
                    ).toFixed(2),
                    productQuantity: order.items.reduce(
                        (sum, item) =>
                            sum + item.quantity,
                        0,
                    ),
                    items: order.items.map((item) => ({
                        ...item,
                        unitPrice:
                            item.unitPrice.toFixed(2),
                        unitCost:
                            item.unitCost.toFixed(2),
                        total: item.unitPrice
                            .mul(item.quantity)
                            .toFixed(2),
                    })),
                    payments: order.payments.map(
                        (payment) => ({
                            ...payment,
                            amount:
                                payment.amount.toFixed(2),
                            createdAt:
                                payment.createdAt
                                    .toISOString(),
                        }),
                    ),
                };
            });

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