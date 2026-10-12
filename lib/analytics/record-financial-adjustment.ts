import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { orderWithStock } from "@/lib/orders/order-stock";
import { OrderValidationError } from "@/lib/orders/validate-order";
import { buildSaleSnapshot } from "./build-sale-snapshot";
import { recordSaleSnapshot } from "./record-sale-snapshot";

export async function recordFinancialAdjustment(
    tx: Prisma.TransactionClient,
    businessId: string,
    orderId: string,
    requestId: string,
    kind: "RETURN" | "EXCHANGE_ADJUSTMENT",
) {
    const recordedSale = await tx.orderFinancialEntry.findFirst({
        where: {
            businessId,
            orderId,
            kind: "SALE",
        },
        select: { id: true },
    });

    // ჯერ არაღრიცხულ გაყიდვას შესწორება არ სჭირდება.
    if (!recordedSale) return;

    const order = await tx.order.findFirst({
        where: {
            id: orderId,
            businessId,
        },
        include: orderWithStock,
    });

    if (!order) {
        throw new OrderValidationError(
            "ფინანსური შესწორებისთვის შეკვეთა ვერ მოიძებნა.",
            409,
        );
    }

    const returnedItems = await tx.orderReturnItem.groupBy({
        by: ["orderItemId"],
        where: {
            orderReturn: {
                orderId,
                fulfillmentCycle: order.fulfillmentCycle,
                status: "RECEIVED",
            },
        },
        _sum: { quantity: true },
    });

    const receivedQuantities = new Map(
        returnedItems.map(item => [
            item.orderItemId,
            item._sum.quantity ?? 0,
        ]),
    );

    const snapshot = buildSaleSnapshot(
        order,
        receivedQuantities,
    );

    await recordSaleSnapshot(
        tx,
        businessId,
        order,
        snapshot,
        `${kind}:${orderId}:${requestId}`,
        kind,
    );
}