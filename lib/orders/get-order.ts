import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { OrderValidationError } from "./validate-order";
import { orderPayableTotal } from "./order-payable-total";
export async function getOrder(orderId: string) {
    const user = await getCurrentUser();
    if (!user) throw new OrderValidationError("გაიარე ავტორიზაცია.", 401);
    const prisma = createPrismaClient();
    try {
        const membership = await prisma.businessMembership.findFirst({ where: { userId: user.id }, orderBy: [{ createdAt: "asc" }, { businessId: "asc" }], select: { businessId: true } });
        if (!membership) throw new OrderValidationError("ბიზნესი ვერ მოიძებნა.", 403);
        const order = await prisma.order.findFirst({
            where: { id: orderId, businessId: membership.businessId, deletedAt: null }, include: {
                items: {
                    where: { isActive: true },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                },
                payments: {
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                },
                returns: {
                    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                    include: {
                        items: {
                            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                        },
                    },
                },
            }
        });
        if (!order) throw new OrderValidationError("შეკვეთა ვერ მოიძებნა.", 404);
        const returnQuantities = new Map<
            string,
            { pending: number; received: number }
        >();

        for (const entry of order.returns) {
            if (
                entry.status === "CANCELED" ||
                entry.fulfillmentCycle !== order.fulfillmentCycle
            ) {
                continue;
            }

            for (const item of entry.items) {
                const quantity = returnQuantities.get(item.orderItemId) ?? {
                    pending: 0,
                    received: 0,
                };

                if (entry.status === "PENDING") {
                    quantity.pending += item.quantity;
                } else {
                    quantity.received += item.quantity;
                }

                returnQuantities.set(item.orderItemId, quantity);
            }
        }

        const hasReturnHistory = order.returns.some(
            entry =>
                entry.status !== "CANCELED" &&
                entry.fulfillmentCycle === order.fulfillmentCycle,
        );
        const paidAmount = order.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
        const receivedQuantities = new Map<string, number>();

        for (const [itemId, quantities] of returnQuantities) {
            receivedQuantities.set(itemId, quantities.received);
        }

        const total = orderPayableTotal(order, receivedQuantities);

        const deletionReceivedQuantities = new Map(
            receivedQuantities,
        );

        for (const item of order.items) {
            if (
                item.stockRestoredAt ||
                (
                    order.status === "PROCESSING" &&
                    !item.isCarriedOver
                )
            ) {
                deletionReceivedQuantities.set(
                    item.id,
                    item.quantity,
                );
            }
        }

        const deletionTotal = orderPayableTotal(
            order,
            deletionReceivedQuantities,
        );

        const hasUnreturnedCarriedItems = order.items.some(item =>
            item.isCarriedOver &&
            !item.stockRestoredAt &&
            (deletionReceivedQuantities.get(item.id) ?? 0) <
            item.quantity,
        );

        const shouldCollectBeforeDeletion =
            order.status !== "CANCELED" &&
            order.status !== "RETURNED" &&
            (
                order.status !== "PROCESSING" ||
                hasUnreturnedCarriedItems
            );

        const deletionRemainingAmount =
            shouldCollectBeforeDeletion
                ? Prisma.Decimal.max(
                    deletionTotal.minus(paidAmount),
                    0,
                )
                : new Prisma.Decimal(0);

        const deletionRefundDue = Prisma.Decimal.max(
            paidAmount.minus(deletionTotal),
            0,
        );

        const currentReturns = order.returns.filter(
            entry =>
                entry.fulfillmentCycle === order.fulfillmentCycle,
        );

        const canExchange =
            !order.deleteRequestedAt &&
            !order.stockReturnedAt &&
            ["SHIPPED", "COMPLETED", "RETURNED"].includes(
                order.status,
            ) &&
            currentReturns.some(entry =>
                (entry.status === "PENDING" ||
                    entry.status === "RECEIVED") &&
                entry.items.some(item => item.reason === "EXCHANGE"),
            );
        return {
            deletionRemainingAmount:
                deletionRemainingAmount.toFixed(2),
            deletionRefundDue:
                deletionRefundDue.toFixed(2),
            total: total.toFixed(2),
            refundDue: Prisma.Decimal.max(
                paidAmount.minus(total),
                0,
            ).toFixed(2),
            remainingAmount: Prisma.Decimal.max(
                total.minus(paidAmount),
                0,
            ).toFixed(2),
            canExchange,
            notes: order.notes ?? "",
            id: order.id,
            number: order.number,
            expectedVersion: order.invoiceVersion,
            status: order.status,
            editable:
                order.status !== "COMPLETED" &&
                order.status !== "RETURNED" &&
                !hasReturnHistory,
            productsEditable: order.status === "PROCESSING" && !hasReturnHistory,
            stockReturned: Boolean(order.stockReturnedAt),
            deleteRequestedAt: order.deleteRequestedAt?.toISOString() ?? null,

            canRequestReturn:
                !order.stockReturnedAt &&
                ["PROCESSING", "SHIPPED", "COMPLETED", "CANCELED"].includes(
                    order.status,
                ) &&
                order.items.some(item => {
                    if (item.stockRestoredAt) return false;

                    if (
                        order.status === "PROCESSING" &&
                        !item.isCarriedOver
                    ) {
                        return false;
                    }

                    const quantities = returnQuantities.get(item.id);

                    return item.quantity >
                        (quantities?.pending ?? 0) +
                        (quantities?.received ?? 0);
                }),

            returns: order.returns.map(entry => ({
                id: entry.id,
                isFromPreviousExchange:
                    entry.fulfillmentCycle !== order.fulfillmentCycle &&
                    entry.exchangeId !== null,
                status: entry.status,
                createdAt: entry.createdAt.toISOString(),
                receivedAt: entry.receivedAt?.toISOString() ?? null,

                items: entry.items.map(item => ({
                    id: item.id,
                    orderItemId: item.orderItemId,
                    quantity: item.quantity,
                    reason: item.reason,
                    condition: item.condition,
                    note: item.note ?? "",
                    name: item.name,
                    imageUrl: item.imageUrl,
                    color: item.color ?? "",
                    size: item.size ?? "",
                    unitPrice: item.unitPrice.toFixed(2),
                })),
            })),
            recipientPhone: order.recipientPhone, recipientFirstName: order.recipientFirstName ?? "", recipientLastName: order.recipientLastName ?? "", shippingAddress: order.shippingAddress ?? "",
            courierFee: order.courierFee.toFixed(2), paidAmount: paidAmount.toFixed(2),
            paymentMethod: order.payments.at(-1)?.method ?? "CASH", bankName: order.payments.at(-1)?.bankName ?? "",
            items: order.items.map(item => ({
                isCarriedOver: item.isCarriedOver,
                pendingReturnQuantity:
                    order.stockReturnedAt || item.stockRestoredAt
                        ? 0
                        : returnQuantities.get(item.id)?.pending ?? 0,

                receivedReturnQuantity:
                    order.stockReturnedAt || item.stockRestoredAt
                        ? item.quantity
                        : returnQuantities.get(item.id)?.received ?? 0,

                returnableQuantity:
                    order.stockReturnedAt ||
                        item.stockRestoredAt ||
                        (order.status === "PROCESSING" && !item.isCarriedOver)
                        ? 0
                        : Math.max(
                            0,
                            item.quantity -
                            (returnQuantities.get(item.id)?.pending ?? 0) -
                            (returnQuantities.get(item.id)?.received ?? 0),
                        ),
                id: item.id, source: item.source, inventoryItemId: item.inventoryItemId,
                name: item.name, description: item.description ?? "", color: item.color ?? "", size: item.size ?? "", imageUrl: item.imageUrl,
                condition: item.condition, quantity: item.quantity, unitPrice: item.unitPrice.toFixed(2), unitCost:
                    item.source === "MANUAL" && item.totalCost === null
                        ? ""
                        : item.unitCost.toFixed(2),
            })),
        };
    } finally { await prisma.$disconnect(); }
}
