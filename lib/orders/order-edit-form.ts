import type { getOrder } from "./get-order";
import {
    emptyOrderDraft,
    orderCreatePayload,
    type OrderFormDraft,
} from "./order-form";

type Order = Awaited<ReturnType<typeof getOrder>>;

export function orderEditDraft(order: Order): OrderFormDraft {
    return {
        ...emptyOrderDraft(),
        recipientPhone: order.recipientPhone,
        recipientFirstName: order.recipientFirstName,
        recipientLastName: order.recipientLastName,
        shippingAddress: order.shippingAddress,
        courierFee: order.courierFee,
        paidAmount: order.paidAmount,
        paymentMethod: order.paymentMethod,
        bankName: order.bankName,

        items: order.items.map(item => ({
            key: item.id,
            orderItemId: item.id,
            isCarriedOver: item.isCarriedOver,
            source: item.source,
            inventoryItemId: item.inventoryItemId,
            name: item.name,
            description: item.description,
            color: item.color,
            size: item.size,
            imageUrl: item.imageUrl,
            condition: item.condition,
            quantity: String(item.quantity),
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
        })),
    };
}

export function orderEditPayload(
    draft: OrderFormDraft,
    requestId: string,
    expectedVersion: number,
) {
    return {
        requestId,
        expectedVersion,
        order: orderCreatePayload(
            draft,
            "custom",
            requestId,
            "edit",
        ),
    };
}