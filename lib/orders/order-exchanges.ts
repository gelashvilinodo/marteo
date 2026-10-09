import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { createOrderItems, type StockOrder } from "./order-stock";
import { OrderValidationError, validateOrder } from "./validate-order";
import { paymentState } from "./order-rules";

function fail(message: string): never {
    throw new OrderValidationError(message, 409);
}

// Called only inside mutateOrder's authenticated, version-checked transaction.
export async function exchangeOrderProducts(
    tx: Prisma.TransactionClient,
    businessId: string,
    order: StockOrder,
    requestId: string,
    rawItems: unknown,
) {
    if (!["SHIPPED", "COMPLETED", "RETURNED"].includes(order.status)) {
        fail("გადაცვლა შესაძლებელია გაგზავნილი ან მიღებული შეკვეთის დაბრუნების შემდეგ.");
    }
    if (order.deleteRequestedAt) {
        fail("შეკვეთაზე წაშლის მოთხოვნა არსებობს. გადაცვლამდე გააუქმე წაშლის მოთხოვნა.");
    }
    if (order.stockReturnedAt) {
        fail("ამ შეკვეთის მარაგი უკვე მთლიანად დაბრუნებულია სხვა მოქმედებით.");
    }
    const returns = await tx.orderReturn.findMany({
        where: {
            orderId: order.id,
            fulfillmentCycle: order.fulfillmentCycle,
            status: { in: ["PENDING", "RECEIVED"] },
        },
        include: { items: true },
    });
    if (returns.some(entry => entry.status === "PENDING")) {
        fail("ჯერ დაადასტურე ყველა მიმდინარე დაბრუნების ფიზიკური მიღება.");
    }
    if (!returns.some(entry => entry.items.some(item => item.reason === "EXCHANGE"))) {
        fail("გადაცვლის მიზეზით დაბრუნებული ნივთის მიღება ჯერ არ დადასტურებულა.");
    }

    // Validate only replacement products; customer, delivery and payments stay intact.
    const validated = validateOrder({
        clientRequestId: requestId,
        status: "PROCESSING",
        recipientPhone: order.recipientPhone,
        recipientFirstName: order.recipientFirstName ?? "",
        recipientLastName: order.recipientLastName ?? "",
        shippingAddress: order.shippingAddress ?? "",
        courierFee: "0",
        paidAmount: "0",
        paymentMethod: "CASH",
        bankName: "",
        items: rawItems,
    });
    const received = new Map<string, number>();
    for (const entry of returns) {
        for (const item of entry.items) {
            received.set(item.orderItemId, (received.get(item.orderItemId) ?? 0) + item.quantity);
        }
    }
    const nextCycle = order.fulfillmentCycle + 1;
    let total = order.courierFee;
    const carry = order.items.map(item => {
        const quantity = item.quantity - (received.get(item.id) ?? 0);
        if (quantity < 0) fail("დაბრუნებული რაოდენობა შეკვეთის რაოდენობას აღემატება.");
        const allocations = item.allocations
            .map(allocation => ({
                purchaseItemId: allocation.purchaseItemId,
                condition: allocation.condition,
                quantity: allocation.quantity - allocation.returnedQuantity,
                unitCost: allocation.unitCost,
            }))
            .filter(allocation => allocation.quantity > 0);
        if (item.source === "INVENTORY" && allocations.reduce((sum, value) => sum + value.quantity, 0) !== quantity) {
            fail("დარჩენილი ნივთის მარაგის განაწილება არ ემთხვევა რაოდენობას.");
        }
        const unitCost = item.source === "INVENTORY" && quantity > 0
            ? allocations.reduce((sum, value) => sum.plus(value.unitCost.mul(value.quantity)), new Prisma.Decimal(0))
                .div(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            : item.unitCost;
        total = total.plus(item.unitPrice.mul(quantity));
        return { item, quantity, allocations, unitCost };
    });
    for (const item of validated.items) {
        total = total.plus(item.unitPrice.mul(item.quantity));
    }
    if (total.gt("9999999999.99")) fail("შეკვეთის ჯამი თანხის ველის დასაშვებ მნიშვნელობას აღემატება.");
    const previousTotal = order.items.reduce(
        (sum, item) => sum.plus(item.unitPrice.mul(item.quantity)),
        order.courierFee,
    );

    const inventoryIds = [...new Set(validated.items.flatMap(item => item.inventoryItemId ? [item.inventoryItemId] : []))].sort();
    if (inventoryIds.length) {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryItem" WHERE "businessId"=${businessId} AND "id" IN (${Prisma.join(inventoryIds)}) ORDER BY "id" FOR UPDATE`);
    }
    await tx.orderExchange.create({
        data: {
            orderId: order.id,
            previousCycle: order.fulfillmentCycle,
            nextCycle,
            previousTotal,
            newTotal: total,
            previousSnapshot: JSON.parse(JSON.stringify({
                status: order.status,
                items: order.items,
                returns,
                courierFee: order.courierFee,
                payments: order.payments,
            })) as Prisma.InputJsonValue,
        },
    });
    await tx.orderItem.updateMany({
        where: { orderId: order.id, isActive: true },
        data: { isActive: false },
    });
    for (const { item, quantity, allocations, unitCost } of carry) {
        if (quantity === 0) continue;
        // These items are already with the customer: do not deduct stock again.
        await tx.orderItem.create({
            data: {
                orderId: order.id,
                fulfillmentCycle: nextCycle,
                isActive: true,
                isCarriedOver: true,
                source: item.source,
                inventoryItemId: item.inventoryItemId,
                condition: item.condition,
                name: item.name,
                description: item.description,
                color: item.color,
                size: item.size,
                imageUrl: item.imageUrl,
                quantity,
                unitPrice: item.unitPrice,
                unitCost,
                ...(allocations.length ? { allocations: { create: allocations } } : {}),
            },
        });
    }
    await createOrderItems(tx, businessId, order.id, validated.items, nextCycle);
    const paid = order.payments.reduce((sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0));
    await tx.order.update({
        where: { id: order.id },
        data: {
            fulfillmentCycle: nextCycle,
            status: "PROCESSING",
            stockReturnedAt: null,
            paymentStatus: paid.gte(total) ? "PAID" : paymentState(total, paid, order.courierFee),
            invoiceVersion: { increment: 1 },
        },
    });
    // No payment record is changed until an actual refund is confirmed.
    return {
        total: total.toFixed(2),
        paidAmount: paid.toFixed(2),
        refundDue: Prisma.Decimal.max(paid.minus(total), 0).toFixed(2),
        remainingAmount: Prisma.Decimal.max(total.minus(paid), 0).toFixed(2),
    };
}
