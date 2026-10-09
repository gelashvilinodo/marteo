import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { OrderValidationError } from "./validate-order";
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
        const total = order.items.reduce(
            (sum, item) =>
                sum.plus(item.unitPrice.mul(item.quantity)),
            order.courierFee,
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
            !currentReturns.some(
                entry => entry.status === "PENDING",
            ) &&
            currentReturns.some(
                entry =>
                    entry.status === "RECEIVED" &&
                    entry.items.some(
                        item => item.reason === "EXCHANGE",
                    ),
            );
        return {
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
                condition: item.condition, quantity: item.quantity, unitPrice: item.unitPrice.toFixed(2), unitCost: item.unitCost.toFixed(2),
            })),
        };
    } finally { await prisma.$disconnect(); }
}
