import { qvalue, validQuantity } from "@/lib/orders/quantity";
import { Decimal } from "@prisma/client-runtime-utils";

type PayableOrder = {
    courierFee: Decimal;
    stockReturnedAt: Date | null;
    items: Array<{
        id: string;
        quantity: number;
        unitPrice: Decimal;
    }>;
};

export function orderPayableTotal(
    order: PayableOrder,
    receivedQuantities: ReadonlyMap<string, number>,
): Decimal {
    return order.items.reduce((sum, item) => {
        const received = receivedQuantities.get(item.id) ?? 0;

        if (
            !validQuantity(received) ||
            received < 0 ||
            received > item.quantity
        ) {
            throw new Error(
                "დაბრუნებული რაოდენობა შეკვეთის რაოდენობას არ შეესაბამება.",
            );
        }

        const quantity = order.stockReturnedAt
            ? 0
            : qvalue(item.quantity - received);

        return sum.plus(item.unitPrice.mul(quantity).toDecimalPlaces(2));
    }, order.courierFee);
}