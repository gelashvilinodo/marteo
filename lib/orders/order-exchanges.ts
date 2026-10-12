import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { createOrderItems, type StockOrder } from "./order-stock";
import { OrderValidationError, validateOrder } from "./validate-order";
import { paymentState } from "./order-rules";
import { allocateCost } from "@/lib/analytics/allocate-cost";

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
    if (!returns.some(entry =>
        entry.items.some(item => item.reason === "EXCHANGE")
    )) {
        fail("ჯერ შექმენი დაბრუნების მოთხოვნა გადაცვლის მიზეზით.");
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

    const returnQuantities = new Map<string, number>();
    const pendingQuantities = new Map<string, number>();

    for (const entry of returns) {
        for (const item of entry.items) {
            returnQuantities.set(
                item.orderItemId,
                (returnQuantities.get(item.orderItemId) ?? 0) +
                item.quantity,
            );

            if (entry.status === "PENDING") {
                pendingQuantities.set(
                    item.orderItemId,
                    (pendingQuantities.get(item.orderItemId) ?? 0) +
                    item.quantity,
                );
            }
        }
    }
    const nextCycle = order.fulfillmentCycle + 1;
    let total = order.courierFee;
    const costTransfers: Array<{
        allocationId: string;
        quantity: number;
        cost: Prisma.Decimal | null;
    }> = [];
    const carry = order.items.map(item => {

        const quantity =
            item.quantity - (returnQuantities.get(item.id) ?? 0);

        if (quantity < 0) {
            fail("დასაბრუნებელი რაოდენობა შეკვეთის რაოდენობას აღემატება.");
        }

        let reservedForPendingReturn =
            pendingQuantities.get(item.id) ?? 0;

        // მიღების ფუნქციაც განაწილებებს id-ის ზრდადობით ამუშავებს.
        const allocations = [...item.allocations]
            .sort((first, second) =>
                first.id < second.id ? -1 : first.id > second.id ? 1 : 0
            )
            .map(allocation => {
                const available =
                    allocation.quantity -
                    allocation.returnedQuantity -
                    allocation.transferredQuantity;

                if (available < 0) {
                    fail("პროდუქტის მარაგის განაწილება არასწორია.");
                }

                const reserved = Math.min(
                    available,
                    reservedForPendingReturn,
                );

                reservedForPendingReturn -= reserved;

                const carriedQuantity = available - reserved;

                const costSplit =
                    allocation.totalCost === null ||
                        allocation.transferredCost === null
                        ? null
                        : allocateCost(
                            allocation.totalCost
                                .minus(allocation.returnedCost)
                                .minus(allocation.transferredCost),
                            [reserved, carriedQuantity],
                        );

                const carriedCost = costSplit?.[1] ?? null;

                if (carriedQuantity > 0) {
                    costTransfers.push({
                        allocationId: allocation.id,
                        quantity: carriedQuantity,
                        cost: carriedCost,
                    });
                }

                return {
                    purchaseItemId: allocation.purchaseItemId,
                    condition: allocation.condition,
                    quantity: carriedQuantity,
                    unitCost: allocation.unitCost,
                    totalCost: carriedCost,
                };
            })
            .filter(allocation => allocation.quantity > 0);

        if (
            item.source === "INVENTORY" &&
            reservedForPendingReturn !== 0
        ) {
            fail("დასაბრუნებელი ნივთის მარაგის განაწილება არ ემთხვევა რაოდენობას.");
        }
        if (item.source === "INVENTORY" && allocations.reduce((sum, value) => sum + value.quantity, 0) !== quantity) {
            fail("დარჩენილი ნივთის მარაგის განაწილება არ ემთხვევა რაოდენობას.");
        }
        const unitCost = item.source === "INVENTORY" && quantity > 0
            ? allocations.reduce((sum, value) => sum.plus(value.unitCost.mul(value.quantity)), new Prisma.Decimal(0))
                .div(quantity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
            : item.unitCost;
        total = total.plus(item.unitPrice.mul(quantity));
        const totalCost =
            item.source === "MANUAL"
                ? item.totalCost === null
                    ? null
                    : allocateCost(
                        item.totalCost,
                        [
                            quantity,
                            item.quantity - quantity,
                        ],
                    )[0]
                : allocations.every(
                    allocation => allocation.totalCost !== null,
                )
                    ? allocations.reduce(
                        (sum, allocation) =>
                            sum.plus(allocation.totalCost!),
                        new Prisma.Decimal(0),
                    )
                    : null;

        return { item, quantity, allocations, unitCost, totalCost };
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
    const exchange = await tx.orderExchange.create({
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

    await tx.orderReturn.updateMany({
        where: {
            orderId: order.id,
            fulfillmentCycle: order.fulfillmentCycle,
            status: { in: ["PENDING", "RECEIVED"] },
            exchangeId: null,
        },
        data: {
            exchangeId: exchange.id,
        },
    });

    for (const transfer of costTransfers) {
        await tx.orderItemAllocation.update({
            where: { id: transfer.allocationId },
            data: {
                transferredQuantity: {
                    increment: transfer.quantity,
                },
                transferredCost: transfer.cost !== null
                    ? { increment: transfer.cost }
                    : null,
            },
        });
    }

    await tx.orderItem.updateMany({
        where: { orderId: order.id, isActive: true },
        data: { isActive: false },
    });
    for (const { item, quantity, allocations, unitCost, totalCost } of carry) {
        if (quantity === 0) continue;
        // These items are already with the customer: do not deduct stock again.
        await tx.orderItem.create({
            data: {
                orderId: order.id,
                fulfillmentCycle: nextCycle,
                isActive: true,
                isCarriedOver: true,
                financialSourceItemId: item.financialSourceItemId ?? item.id,
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
                totalCost,
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
