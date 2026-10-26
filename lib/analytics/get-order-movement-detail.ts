import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { createPrismaClient } from "@/lib/prisma";
import { resolveOrdersPeriod } from "@/lib/orders/orders-period";

export async function getOrderMovementDetail(
    prisma: ReturnType<typeof createPrismaClient>,
    businessId: string,
    source: "financial" | "payment",
    id: string,
    params: Record<string, string>,
) {
    const range = resolveOrdersPeriod(
        params.period || "month",
        params.from || "",
        params.to || "",
    );

    return prisma.$transaction(
        async tx => {
            let orderId: string | null;
            let number: number | null;

            if (source === "financial") {
                const seed = await tx.orderFinancialEntry.findFirst({
                    where: { id, businessId },
                    select: {
                        orderId: true,
                        orderNumber: true,
                    },
                });

                if (!seed) return null;

                orderId = seed.orderId;
                number = seed.orderNumber;
            } else {
                const seed = await tx.orderPayment.findFirst({
                    where: { id, order: { businessId } },
                    select: {
                        orderId: true,
                        order: { select: { number: true } },
                    },
                });

                if (!seed) return null;

                orderId = seed.orderId;
                number = seed.order.number;
            }

            const entries = await tx.orderFinancialEntry.findMany({
                where: orderId
                    ? { businessId, orderId }
                    : { businessId, id },
                orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
                select: {
                    id: true,
                    kind: true,
                    occurredAt: true,
                    productRevenueDelta: true,
                    deliveryRevenueDelta: true,
                    costOfGoodsDelta: true,
                    costComplete: true,
                },
            });

            const payments = orderId
                ? await tx.orderPayment.findMany({
                      where: {
                          orderId,
                          order: { businessId },
                      },
                      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                      select: {
                          id: true,
                          createdAt: true,
                          amount: true,
                          method: true,
                          bankName: true,
                      },
                  })
                : [];

            const inPeriod = (date: Date) =>
                date >= range.start && date < range.end;

            const periodEntries = entries.filter(entry =>
                inPeriod(entry.occurredAt),
            );
            const periodPayments = payments.filter(payment =>
                inPeriod(payment.createdAt),
            );

            const zero = () => new Prisma.Decimal(0);

            const productRevenue = periodEntries.reduce(
                (sum, entry) => sum.plus(entry.productRevenueDelta),
                zero(),
            );

            const deliveryRevenue = periodEntries.reduce(
                (sum, entry) => sum.plus(entry.deliveryRevenueDelta),
                zero(),
            );

            const sales = productRevenue;

            const cost = periodEntries.reduce(
                (sum, entry) => sum.plus(entry.costOfGoodsDelta),
                zero(),
            );

            const received = periodPayments.reduce(
                (sum, payment) =>
                    payment.amount.gt(0)
                        ? sum.plus(payment.amount)
                        : sum,
                zero(),
            );

            const refunded = periodPayments.reduce(
                (sum, payment) =>
                    payment.amount.lt(0)
                        ? sum.plus(payment.amount.negated())
                        : sum,
                zero(),
            );

            const netReceived = received.minus(refunded);
            const hasSales = periodEntries.length > 0;
            const costComplete = periodEntries.every(
                entry => entry.costComplete,
            );

            const history = [
                ...entries.map(entry => ({
                    id: `financial:${entry.id}`,
                    kind: entry.kind,
                    occurredAt: entry.occurredAt.toISOString(),
                    inPeriod: inPeriod(entry.occurredAt),
                    amount: entry.productRevenueDelta.toFixed(2),
                    cost: entry.costOfGoodsDelta.toFixed(2),
                    costComplete: entry.costComplete,
                    method: null,
                    bankName: null,
                })),
                ...payments.map(payment => ({
                    id: `payment:${payment.id}`,
                    kind: payment.amount.lt(0) ? "REFUND" : "PAYMENT",
                    occurredAt: payment.createdAt.toISOString(),
                    inPeriod: inPeriod(payment.createdAt),
                    amount: payment.amount.toFixed(2),
                    cost: null,
                    costComplete: true,
                    method: payment.method,
                    bankName: payment.bankName,
                })),
            ].sort(
                (a, b) =>
                    b.occurredAt.localeCompare(a.occurredAt) ||
                    b.id.localeCompare(a.id),
            );

            return {
                source,
                id,
                number,
                kind: "ORDER_SUMMARY",
                from: range.from,
                to: range.to,
                amount:
                    source === "financial"
                        ? sales.toFixed(2)
                        : netReceived.toFixed(2),
                productRevenue: productRevenue.toFixed(2),
                deliveryRevenue: deliveryRevenue.toFixed(2),
                sales: sales.toFixed(2),
                hasSales,
                cost: cost.toFixed(2),
                costComplete,
                profit:
                    hasSales && costComplete
                        ? sales.minus(cost).toFixed(2)
                        : null,
                received: received.toFixed(2),
                refunded: refunded.toFixed(2),
                netReceived: netReceived.toFixed(2),
                history,
                editable: false,
            };
        },
        {
            isolationLevel:
                Prisma.TransactionIsolationLevel.RepeatableRead,
            maxWait: 10000,
            timeout: 15000,
        },
    );
}