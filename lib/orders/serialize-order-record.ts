import { Decimal } from "@prisma/client-runtime-utils";
import { orderPayableTotal } from "./order-payable-total";
import type { OrderRecord } from "./get-order-records";

export function serializeOrderRecord(order: OrderRecord, details: boolean) {
    const receivedQuantities = new Map<string, number>();

    for (const entry of order.returns) {
        if (
            entry.status !== "RECEIVED" ||
            entry.fulfillmentCycle !== order.fulfillmentCycle
        ) {
            continue;
        }

        for (const item of entry.items) {
            receivedQuantities.set(
                item.orderItemId,
                (receivedQuantities.get(item.orderItemId) ?? 0) +
                item.quantity,
            );
        }
    }

    const total = orderPayableTotal(
        order,
        receivedQuantities,
    );

    const productsTotal = total.minus(order.courierFee);

    const paidAmount = order.paidAmount;

    const currentReturns = order.returns.filter(
        entry =>
            entry.fulfillmentCycle === order.fulfillmentCycle,
    );

    const { items: rawItems, payments: _payments, returns: _returns, notes, shippingAddress, ...header } = order;
    const summary = {
        ...header,
        hasNotes: Boolean(notes),

        missingManualCosts: order.items
            .filter(item =>
                item.source === "MANUAL" &&
                item.totalCost === null &&
                !order.stockReturnedAt &&
                !item.stockRestoredAt &&
                item.quantity >
                (receivedQuantities.get(item.id) ?? 0),
            )
            .map(item => ({
                id: item.id,
                name: item.name,
                imageUrl: item.imageUrl,
            })),

        deleteRequestedAt:
            order.deleteRequestedAt?.toISOString() ?? null,

        hasReturnHistory: currentReturns.length > 0,

        hasPastReturns: order.returns.some(
            entry =>
                entry.fulfillmentCycle !== order.fulfillmentCycle,
        ),

        pendingReturnQuantity: order.returns
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
        remainingAmount: Decimal.max(
            total.minus(paidAmount),
            0,
        ).toFixed(2),

        refundDue: Decimal.max(
            paidAmount.minus(total),
            0,
        ).toFixed(2),
        productQuantity: order.items.reduce(
            (sum, item) =>
                sum + item.quantity,
            0,
        ),
    };
    if (!details) {
        const previewItems = rawItems.slice(0, 1);
        const photoItem = rawItems.find(item => item.imageUrl);
        if (photoItem && photoItem !== previewItems[0]) previewItems.push(photoItem);
        return {
            ...summary,
            detailsLoaded: false as const,
            items: previewItems.map(item => ({ id: item.id, name: item.name, imageUrl: item.imageUrl })),
        };
    }
    return {
        ...summary,
        detailsLoaded: true as const,
        notes,
        shippingAddress,
        items: order.items.map((item) => ({
            ...item,
            totalCost: item.totalCost?.toFixed(2) ?? null,
            stockRestoredAt:
                item.stockRestoredAt?.toISOString() ?? null,
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
}
