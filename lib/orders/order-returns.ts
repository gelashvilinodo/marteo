import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { OrderValidationError } from "./validate-order";

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

export type ReturnSelection = {
    orderItemId: string;
    quantity: number;
    reason: "DEFECT" | "EXCHANGE" | "OTHER";
    condition: "GOOD" | "DEFECTIVE";
    note?: string;
};

// Invoke inside the authenticated mutation transaction, after its version check.
export async function requestOrderReturn(
    tx: Prisma.TransactionClient,
    businessId: string,
    orderId: string,
    selections: ReturnSelection[],
    deleteAfterReturn = false,
) {
    await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id"=${businessId} FOR UPDATE`;
    const order = await tx.order.findFirst({
        where: { id: orderId, businessId, deletedAt: null },
        include: {
            items: {
                where: { isActive: true },
            },
            returns: {
                where: {
                    status: { in: ["PENDING", "RECEIVED"] },
                },
                include: {
                    items: true,
                },
            },
        },
    });
    if (!order) fail("შეკვეთა ვერ მოიძებნა.", 404);
    if (
        !["PROCESSING", "SHIPPED", "COMPLETED", "CANCELED"].includes(
            order.status,
        )
    ) {
        fail("დაბრუნების მოთხოვნა ამ სტატუსზე დაუშვებელია.", 409);
    }
    if (order.stockReturnedAt) fail("ამ შეკვეთის მარაგი უკვე დაბრუნებულია.", 409);
    if (!Array.isArray(selections) || !selections.length) fail("აირჩიე დასაბრუნებელი პროდუქტი.");
    const seen = new Set<string>();
    const items = selections.map(selection => {
        if (!selection || typeof selection.orderItemId !== "string" || seen.has(selection.orderItemId)) {
            fail("დასაბრუნებელი პროდუქტი არასწორად ან განმეორებითაა მითითებული.");
        }
        seen.add(selection.orderItemId);
        const item = order.items.find(value => value.id === selection.orderItemId);
        if (!item) fail("პროდუქტი ამ შეკვეთას არ ეკუთვნის.");
        if (item.stockRestoredAt) {
            fail("ამ პროდუქტის მარაგი უკვე აღდგენილია.", 409);
        }

        if (order.status === "PROCESSING" && !item.isCarriedOver) {
            fail(
                "ეს პროდუქტი ჯერ არ გაგზავნილა. მისი დაბრუნების მოთხოვნა საჭირო არ არის.",
                409,
            );
        }
        if (!Number.isSafeInteger(selection.quantity) || selection.quantity <= 0) fail("მიუთითე დასაბრუნებელი რაოდენობა.");
        const reserved = order.returns
            .filter(entry =>
                entry.fulfillmentCycle === order.fulfillmentCycle
            )
            .reduce(
                (sum, entry) =>
                    sum + entry.items.reduce(
                        (subtotal, value) =>
                            subtotal + (
                                value.orderItemId === item.id
                                    ? value.quantity
                                    : 0
                            ),
                        0,
                    ),
                0,
            );
        if (selection.quantity > item.quantity - reserved) fail(`${item.name}: დასაბრუნებელი რაოდენობა დარჩენილს აღემატება.`);
        if (!["DEFECT", "EXCHANGE", "OTHER"].includes(selection.reason)) fail("აირჩიე დაბრუნების მიზეზი.");
        if (selection.condition !== "GOOD" && selection.condition !== "DEFECTIVE") fail("მიუთითე ნივთის მდგომარეობა.");
        if (selection.note !== undefined && typeof selection.note !== "string") fail("დაბრუნების განმარტება არასწორია.");
        return {
            orderItemId: item.id, quantity: selection.quantity,
            reason: selection.reason, condition: selection.condition, note: selection.note?.trim() || null,
            name: item.name, imageUrl: item.imageUrl, color: item.color, size: item.size, unitPrice: item.unitPrice,
        };
    });
    const entry = await tx.orderReturn.create({
        data: {
            orderId,
            fulfillmentCycle: order.fulfillmentCycle,
            items: {
                create: items,
            },
        },
        select: {
            id: true,
        },
    });
    await tx.order.update({
        where: { id: orderId }, data: {
            invoiceVersion: { increment: 1 },
            ...(deleteAfterReturn && !order.deleteRequestedAt ? { deleteRequestedAt: new Date() } : {}),
        }
    });
    return entry;
}

// A RECEIVED return is idempotent: repeating this call cannot increase stock again.
export async function receiveOrderReturn(
    tx: Prisma.TransactionClient,
    businessId: string,
    orderId: string,
    returnId: string,
) {
    await tx.$queryRaw`SELECT "id" FROM "Business" WHERE "id"=${businessId} FOR UPDATE`;
    const entry = await tx.orderReturn.findFirst({
        where: { id: returnId, orderId, order: { businessId, deletedAt: null } },
        include: {
            items: true, order: {
                include: {
                    items: { include: { allocations: { orderBy: { id: "asc" }, include: { purchaseItem: { include: { purchase: true } } } } } },
                }
            }
        },
    });
    if (!entry) fail("დაბრუნების მოთხოვნა ვერ მოიძებნა.", 404);
    if (entry.status === "RECEIVED") return { id: entry.id, alreadyReceived: true };
    if (entry.status !== "PENDING") fail("დაბრუნების მოთხოვნა გაუქმებულია.", 409);
    if (
        entry.fulfillmentCycle !==
        entry.order.fulfillmentCycle
    ) {
        fail(
            "ეს დაბრუნება შეკვეთის წინა გადაცვლას ეკუთვნის.",
            409,
        );
    }
    if (entry.order.stockReturnedAt) fail("ამ შეკვეთის მარაგი უკვე დაბრუნებულია.", 409);
    if (!entry.items.length) fail("დაბრუნების მოთხოვნაში პროდუქტები არ არის.", 409);

    const ids = [...new Set(entry.order.items.flatMap(item => item.inventoryItemId ? [item.inventoryItemId] : []))].sort();
    if (ids.length) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryItem" WHERE "businessId"=${businessId} AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`);

    for (const returned of entry.items) {
        const item = entry.order.items.find(value => value.id === returned.orderItemId);
        if (!item) fail("შეკვეთის პროდუქტი შეიცვალა. დაბრუნება ვერ შესრულდა.", 409);
        if (item.stockRestoredAt) {
            fail(
                "ამ პროდუქტის მარაგი უკვე აღდგენილია. მეორედ დამატება დაუშვებელია.",
                409,
            );
        }
        if (!Number.isSafeInteger(returned.quantity) || returned.quantity <= 0 || returned.quantity > item.quantity) {
            fail("დასაბრუნებელი რაოდენობა არასწორია.", 409);
        }
        // Manual products have no original inventory or purchase allocation to restore.
        if (item.source === "MANUAL") continue;
        if (!item.inventoryItemId || item.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== item.quantity) {
            fail("პროდუქტის მარაგის განაწილების მონაცემები აკლია.", 409);
        }
        let remaining = returned.quantity;
        for (const allocation of item.allocations) {
            const batch = allocation.purchaseItem;
            if (batch.purchase.businessId !== businessId || batch.inventoryItemId !== item.inventoryItemId) {
                fail("მარაგის განაწილება არასწორია.", 409);
            }
            const quantity = Math.min(remaining, allocation.quantity - allocation.returnedQuantity);
            if (quantity <= 0) continue;
            await tx.orderItemAllocation.update({ where: { id: allocation.id }, data: { returnedQuantity: { increment: quantity } } });
            await tx.purchaseItem.update({
                where: { id: batch.id }, data: {
                    remainingQuantity: { increment: quantity },
                    ...(returned.condition === "DEFECTIVE" ? { remainingDefectiveQuantity: { increment: quantity } } : {}),
                }
            });
            await tx.inventoryMovement.create({
                data: {
                    inventoryItemId: item.inventoryItemId, purchaseItemId: batch.id, orderItemId: item.id,
                    type: "CUSTOMER_RETURN_IN", condition: returned.condition, quantity,
                    note: `დაბრუნება ${entry.id}; მიზეზი ${returned.reason}${returned.note ? `; ${returned.note}` : ""}`,
                }
            });
            remaining -= quantity;
            if (remaining === 0) break;
        }
        if (remaining !== 0) fail(`${item.name}: ეს რაოდენობა უკვე დაბრუნებულია ან განაწილება არასწორია.`, 409);
        await tx.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { currentStock: { increment: returned.quantity } } });
    }
    await tx.orderReturn.update({ where: { id: returnId }, data: { status: "RECEIVED", receivedAt: new Date() } });
    const receivedReturns = await tx.orderReturn.findMany({
        where: {
            orderId,
            fulfillmentCycle: entry.order.fulfillmentCycle,
            status: "RECEIVED",
        },
        select: {
            items: {
                select: { orderItemId: true, quantity: true },
            },
        },
    });

    const activeItems = entry.order.items.filter(
        item => item.isActive,
    );

    const fullyReturned =
        activeItems.length > 0 &&
        activeItems.every(item => {
            if (item.stockRestoredAt) return true;

            const receivedQuantity = receivedReturns.reduce(
                (sum, entry) =>
                    sum + entry.items.reduce(
                        (count, returned) =>
                            count + (
                                returned.orderItemId === item.id
                                    ? returned.quantity
                                    : 0
                            ),
                        0,
                    ),
                0,
            );

            return receivedQuantity === item.quantity;
        });

    await tx.order.update({
        where: { id: orderId },
        data: {
            invoiceVersion: { increment: 1 },
            ...(entry.order.status === "COMPLETED" && fullyReturned
                ? { status: "RETURNED" as const }
                : {}),
        },
    });
    return { id: entry.id, alreadyReceived: false };
}
