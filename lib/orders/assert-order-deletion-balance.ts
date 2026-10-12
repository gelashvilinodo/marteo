import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { StockOrder } from "./order-stock";
import { orderPayableTotal } from "./order-payable-total";
import { OrderValidationError } from "./validate-order";

export async function assertOrderDeletionBalance(
    tx: Prisma.TransactionClient,
    order: StockOrder,
    restored: boolean,
) {
    // მარაგის აღდგენის შემდეგ მიმდინარე მდგომარეობას ვკითხულობთ.
    // შემოწმების ჩავარდნისას ტრანზაქცია აღდგენასაც უკან აბრუნებს.
    const items = await tx.orderItem.findMany({
        where: {
            orderId: order.id,
            isActive: true,
        },
        select: {
            id: true,
            quantity: true,
            unitPrice: true,
            stockRestoredAt: true,
            isCarriedOver: true,
        },
    });

    const returnedItems = await tx.orderReturnItem.groupBy({
        by: ["orderItemId"],
        where: {
            orderReturn: {
                orderId: order.id,
                fulfillmentCycle: order.fulfillmentCycle,
                status: "RECEIVED",
            },
        },
        _sum: {
            quantity: true,
        },
    });

    const receivedQuantities = new Map<string, number>();

    for (const item of returnedItems) {
        receivedQuantities.set(
            item.orderItemId,
            item._sum.quantity ?? 0,
        );
    }

    for (const item of items) {
        if (item.stockRestoredAt) {
            receivedQuantities.set(item.id, item.quantity);
        }
    }

    const payable = orderPayableTotal(
        {
            courierFee: order.courierFee,
            stockReturnedAt:
                restored
                    ? new Date()
                    : order.stockReturnedAt,
            items,
        },
        receivedQuantities,
    );

    const paid = order.payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
    );

    const refundDue = Prisma.Decimal.max(
        paid.minus(payable),
        0,
    );

    if (refundDue.gt(0)) {
        throw new OrderValidationError(
            `წაშლა შეუძლებელია: კლიენტისთვის დასაბრუნებელია ${refundDue.toFixed(2)} ₾. ჯერ დაადასტურე თანხის რეალური დაბრუნება და შემდეგ წაშალე შეკვეთა. თუ გაუგზავნელ შეკვეთას აუქმებ, ჯერ გადაიყვანე გაუქმებულზე და მოაწესრიგე თანხის დაბრუნება.`,
            409,
        );
    }

    const hasUnreturnedCarriedItems = items.some(item =>
        item.isCarriedOver &&
        !item.stockRestoredAt &&
        (receivedQuantities.get(item.id) ?? 0) < item.quantity,
    );

    const shouldCollect =
        order.status !== "CANCELED" &&
        order.status !== "RETURNED" &&
        (
            order.status !== "PROCESSING" ||
            hasUnreturnedCarriedItems
        );

    const remaining = shouldCollect
        ? Prisma.Decimal.max(payable.minus(paid), 0)
        : new Prisma.Decimal(0);

    if (remaining.gt(0)) {
        throw new OrderValidationError(
            `წაშლა შეუძლებელია: კლიენტისგან მისაღებია ${remaining.toFixed(2)} ₾. ჯერ აღრიცხე თანხის მიღება ან გააფორმე შეკვეთის გაუქმება/დაბრუნება.`,
            409,
        );
    }
}