import { Prisma } from "@/generated/prisma/client";

type PayableOrder = {
    courierFee: Prisma.Decimal;
    stockReturnedAt: Date | null;
    items: Array<{
        id: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
    }>;
};

export function orderPayableTotal(
    order: PayableOrder,
    receivedQuantities: ReadonlyMap<string, number>,
): Prisma.Decimal {
    return order.items.reduce((sum, item) => {
        const received = receivedQuantities.get(item.id) ?? 0;

        if (
            !Number.isSafeInteger(received) ||
            received < 0 ||
            received > item.quantity
        ) {
            throw new Error(
                "დაბრუნებული რაოდენობა შეკვეთის რაოდენობას არ შეესაბამება.",
            );
        }

        const quantity = order.stockReturnedAt
            ? 0
            : item.quantity - received;

        return sum.plus(item.unitPrice.mul(quantity));
    }, order.courierFee);
}