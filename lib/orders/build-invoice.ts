import { qvalue } from './quantity';
import { Decimal } from '@prisma/client-runtime-utils';
import { orderPayableTotal } from './order-payable-total';
import type { OrderInvoiceData } from './invoice-types';
import type { getInvoiceOrder } from './get-invoice-order';

export function buildInvoice(order:NonNullable<Awaited<ReturnType<typeof getInvoiceOrder>>>,requestUrl:string):OrderInvoiceData {
        const publicUrl = order.publicAccessToken
            ? new URL(
                `/o/${order.publicAccessToken}`,
                requestUrl,
            ).toString()
            : null;

        // PNG QR-ს ბრაუზერი ამზადებს ჩვენებამდე და ბეჭდვამდე.
        const qrDataUrl = null;

        const printState =
            order.lastPrintedInvoiceVersion === null
                ? "NEW"
                : order.lastPrintedInvoiceVersion ===
                    order.invoiceVersion
                    ? "PRINTED"
                    : "UPDATED";

        const receivedQuantities = new Map<string, number>();

        for (const entry of order.returns) {
            if (entry.fulfillmentCycle !== order.fulfillmentCycle) {
                continue;
            }

            for (const item of entry.items) {
                receivedQuantities.set(
                    item.orderItemId,
                    qvalue((receivedQuantities.get(item.orderItemId) ?? 0) +
                    item.quantity),
                );
            }
        }

        const total = orderPayableTotal(
            order,
            receivedQuantities,
        );

        const productsTotal = total.minus(order.courierFee);

        const invoiceItems = order.items
            .map(item => ({
                ...item,
                quantity: order.stockReturnedAt
                    ? 0
                    : qvalue(item.quantity -
                    (receivedQuantities.get(item.id) ?? 0)),
            }))
            .filter(item => item.quantity > 0);
        const paidAmount = order.paidAmount;
        const invoice: OrderInvoiceData = {
            number: order.number,
            createdAt: order.createdAt.toISOString(),
            notes: order.notes ?? "",
            status: order.status,
            paymentStatus: order.paymentStatus,
            business: order.business,
            recipient: {
                name: [order.recipientFirstName, order.recipientLastName].filter(Boolean).join(" "),
                phone: order.recipientPhone,
                address: order.shippingAddress || "",
            },
            items: invoiceItems.map(item => ({
                name: item.name,
                imageUrl: item.imageUrl,
                color: item.color,
                size: item.size,
                condition: item.condition,
                quantity: item.quantity, unit:item.unit,
                unitPrice: item.unitPrice.toFixed(2),
                total: item.unitPrice.mul(item.quantity).toFixed(2),
            })),
            productsTotal: productsTotal.toFixed(2),
            courierFee: order.courierFee.toFixed(2),
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
            publicUrl,
            qrDataUrl,
            version: order.invoiceVersion,
            printState,
            printedAt: order.invoicePrintedAt?.toISOString() ?? null,
        };
    return invoice;
}
