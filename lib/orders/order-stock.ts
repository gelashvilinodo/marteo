import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { OrderValidationError, type ValidatedOrder } from "./validate-order";

function fail(message: string, status = 400): never { throw new OrderValidationError(message, status); }
export async function resolveOrderCustomer(
    tx: Prisma.TransactionClient,
    businessId: string,
    data: ValidatedOrder,
    restoreDeleted = true,
) {
    const phoneDigits = data.recipientPhone.slice(1);

    const matchingCustomers = await tx.$queryRaw<
        Array<{ id: string }>
    >(Prisma.sql`
    WITH normalized AS (
        SELECT
            c."id",
            c."phone",
            c."createdAt",
            regexp_replace(
                regexp_replace(
                    c."phone",
                    '[^0-9]',
                    '',
                    'g'
                ),
                '^00',
                ''
            ) AS digits
        FROM "Customer" c
        WHERE c."businessId" = ${businessId}
    )
    SELECT "id"
    FROM normalized
    WHERE
        CASE
            WHEN length(digits) = 9
                 AND left(digits, 1) = '5'
            THEN '995' || digits
            ELSE digits
        END = ${phoneDigits}
    ORDER BY
        CASE
            WHEN "phone" = ${data.recipientPhone}
            THEN 0
            ELSE 1
        END,
        "createdAt" ASC,
        "id" ASC
    LIMIT 1
`);

    const existingCustomer = matchingCustomers[0];
    if (existingCustomer && restoreDeleted) {
        await tx.customer.updateMany({
            where: {
                id: existingCustomer.id,
                businessId,
                deletedAt: {
                    not: null,
                },
            },
            data: {
                deletedAt: null,
                firstName:
                    data.recipientFirstName || undefined,
                lastName:
                    data.recipientLastName || undefined,
                address:
                    data.shippingAddress || undefined,
            },
        });
    }

    const customer = existingCustomer
        ? existingCustomer
        : await tx.customer.create({
            data: {
                businessId,
                phone: data.recipientPhone,
                firstName:
                    data.recipientFirstName || null,
                lastName:
                    data.recipientLastName || null,
                address:
                    data.shippingAddress || null,
            },
            select: {
                id: true,
            },
        });


    return customer;

}

export async function createOrderItems(
    tx: Prisma.TransactionClient,
    businessId: string,
    orderId: string,
    items: ValidatedOrder["items"],
    fulfillmentCycle = 0,
) {
    for (const item of items) {
        let imageUrl: string | null =
            item.source === "MANUAL"
                ? item.imageUrl
                : null;

        if (imageUrl) {
            const allowedPrefix =
                "https://uwxmbyweyvnekzzecroz.supabase.co" +
                "/storage/v1/object/public/product-images/" +
                `${businessId}/`;

            let valid = false;

            try {
                const url = new URL(imageUrl);
                const filename = url.pathname.split("/").at(-1) ?? "";

                valid =
                    imageUrl.startsWith(allowedPrefix) &&
                    /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(filename) &&
                    !url.search &&
                    !url.hash;
            } catch {
                valid = false;
            }

            if (!valid) {
                fail(
                    `${item.name}: ფოტოს მისამართი არასწორია.`,
                    422,
                );
            }
        }
        let unitCost =
            item.unitCost ?? new Prisma.Decimal(0);

        const allocations: Array<{
            purchaseItemId: string;
            quantity: number;
            unitCost: Prisma.Decimal;
        }> = [];

        if (item.source === "INVENTORY") {
            if (!item.inventoryItemId) {
                fail("აირჩიე პროდუქტი მარაგიდან.");
            }

            const inventory =
                await tx.inventoryItem.findFirst({
                    where: {
                        id: item.inventoryItemId,
                        businessId,
                        isActive: true,
                        product: { businessId },
                    },
                    select: {
                        id: true,
                        currentStock: true,
                        imageUrl: true,
                    },
                });

            if (!inventory) {
                fail(
                    `${item.name}: პროდუქტი მარაგში აღარ არის.`,
                    409,
                );
            }

            if (
                inventory.currentStock <
                item.quantity
            ) {
                fail(
                    `${item.name}: მარაგში საკმარისი რაოდენობა არ არის.`,
                    409,
                );
            }

            imageUrl = inventory.imageUrl;

            // ჯერ ყველაზე ძველი პარტიიდან ვყიდით.
            const batches =
                await tx.purchaseItem.findMany({
                    where: {
                        inventoryItemId:
                            inventory.id,
                        remainingQuantity: {
                            gt: 0,
                        },
                        purchase: {
                            businessId,
                            receiptStatus:
                                "RECEIVED",
                        },
                    },
                    orderBy: [
                        {
                            purchase: {
                                purchaseDate: "asc",
                            },
                        },
                        { createdAt: "asc" },
                        { id: "asc" },
                    ],
                    select: {
                        id: true,
                        remainingQuantity: true,
                        remainingDefectiveQuantity:
                            true,
                        finalUnitCost: true,
                    },
                });

            let needed = item.quantity;
            let costTotal = new Prisma.Decimal(0);

            for (const batch of batches) {
                if (needed === 0) break;

                const available =
                    item.condition === "DEFECTIVE"
                        ? batch.remainingDefectiveQuantity
                        : batch.remainingQuantity -
                        batch.remainingDefectiveQuantity;

                const quantity = Math.min(
                    needed,
                    available,
                );

                if (quantity <= 0) continue;

                allocations.push({
                    purchaseItemId: batch.id,
                    quantity,
                    unitCost: batch.finalUnitCost,
                });

                costTotal = costTotal.plus(
                    batch.finalUnitCost.mul(
                        quantity,
                    ),
                );

                await tx.purchaseItem.update({
                    where: { id: batch.id },
                    data: {
                        remainingQuantity: {
                            decrement: quantity,
                        },
                        ...(item.condition ===
                            "DEFECTIVE"
                            ? {
                                remainingDefectiveQuantity:
                                {
                                    decrement:
                                        quantity,
                                },
                            }
                            : {}),
                    },
                });

                needed -= quantity;
            }

            if (needed > 0) {
                const conditionLabel =
                    item.condition === "DEFECTIVE"
                        ? "წუნდებული"
                        : "დაუზიანებელი";

                fail(
                    `${item.name}: საკმარისი ${conditionLabel} პროდუქტი არ არის.`,
                    409,
                );
            }

            unitCost = costTotal
                .div(item.quantity)
                .toDecimalPlaces(
                    2,
                    Prisma.Decimal.ROUND_HALF_UP,
                );

            await tx.inventoryItem.update({
                where: { id: inventory.id },
                data: {
                    currentStock: {
                        decrement: item.quantity,
                    },
                },
            });
        }

        const orderItem = await tx.orderItem.create({
            data: {
                orderId: orderId,
                fulfillmentCycle,
                isActive: true,
                inventoryItemId:
                    item.inventoryItemId,
                source: item.source,
                condition: item.condition,
                name: item.name,
                description:
                    item.description || null,
                color: item.color || null,
                size: item.size || null,
                imageUrl,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCost,
            },
            select: { id: true },
        });

        if (allocations.length > 0) {
            await tx.orderItemAllocation.createMany({
                data: allocations.map(
                    (allocation) => ({
                        ...allocation,
                        orderItemId: orderItem.id,
                        condition: item.condition,
                    }),
                ),
            });

            await tx.inventoryMovement.createMany({
                data: allocations.map(
                    (allocation) => ({
                        inventoryItemId:
                            item.inventoryItemId!,
                        purchaseItemId:
                            allocation.purchaseItemId,
                        orderItemId: orderItem.id,
                        type: "SALE_OUT",
                        condition: item.condition,
                        quantity:
                            allocation.quantity,
                    }),
                ),
            });
        }
    }


}

export const orderWithStock = {
    items: { where: { isActive: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { allocations: { include: { purchaseItem: { include: { purchase: true } } } } } },
    payments: true,
} satisfies Prisma.OrderInclude;
export type StockOrder = Prisma.OrderGetPayload<{ include: typeof orderWithStock }>;

export async function restoreOrderStock(
    tx: Prisma.TransactionClient,
    order: StockOrder,
    reason: string,
    includeCarriedOver = order.status !== "PROCESSING",
): Promise<boolean> {
    if (order.stockReturnedAt) return true;

    const returns = await tx.orderReturn.findMany({
        where: {
            orderId: order.id,
            fulfillmentCycle: order.fulfillmentCycle,
            status: { in: ["PENDING", "RECEIVED"] },
        },
        include: { items: true },
    });
    if (returns.some(entry => entry.status === "PENDING")) {
        fail("ჯერ დაადასტურე მიმდინარე დაბრუნების ფიზიკური მიღება.", 409);
    }
    const received = new Map<string, number>();
    for (const entry of returns) {
        for (const item of entry.items) {
            received.set(item.orderItemId, (received.get(item.orderItemId) ?? 0) + item.quantity);
        }
    }
    const alreadyRestored = (item: StockOrder["items"][number]) =>
        Boolean(item.stockRestoredAt) || received.get(item.id) === item.quantity;
    const items = order.items.filter(item =>
        !alreadyRestored(item) && (includeCarriedOver || !item.isCarriedOver),
    );
    for (const item of items) {
        if ((received.get(item.id) ?? 0) > 0 || item.allocations.some(value => value.returnedQuantity > 0)) {
            fail("ნაწილობრივ დაბრუნებული ნივთის დარჩენილი რაოდენობა დაბრუნების ფანჯრიდან დაადასტურე.", 409);
        }
    }

    const ids = [...new Set(items.flatMap(item => item.inventoryItemId ? [item.inventoryItemId] : []))].sort();
    if (ids.length) {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "InventoryItem" WHERE "businessId"=${order.businessId} AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`);
    }
    for (const item of items) {
        if (item.source === "INVENTORY") {
            if (!item.inventoryItemId || item.allocations.reduce((sum, value) => sum + value.quantity, 0) !== item.quantity) {
                fail("ნივთის მარაგის განაწილების მონაცემები აკლია.", 409);
            }
            for (const allocation of item.allocations) {
                const batch = allocation.purchaseItem;
                if (batch.inventoryItemId !== item.inventoryItemId || batch.purchase.businessId !== order.businessId) {
                    fail("მარაგის განაწილება არასწორია.", 409);
                }
                await tx.purchaseItem.update({
                    where: { id: batch.id },
                    data: {
                        remainingQuantity: { increment: allocation.quantity },
                        ...(allocation.condition === "DEFECTIVE"
                            ? { remainingDefectiveQuantity: { increment: allocation.quantity } }
                            : {}),
                    },
                });
                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: item.inventoryItemId,
                        purchaseItemId: batch.id,
                        orderItemId: item.id,
                        type: "CUSTOMER_RETURN_IN",
                        condition: allocation.condition,
                        quantity: allocation.quantity,
                        note: `${reason}; შეკვეთა ${order.number ?? order.id}`,
                    },
                });
            }
            await tx.inventoryItem.update({
                where: { id: item.inventoryItemId },
                data: { currentStock: { increment: item.quantity } },
            });
        }
        await tx.orderItem.update({
            where: { id: item.id },
            data: { stockRestoredAt: new Date() },
        });
    }
    const restoredIds = new Set(items.map(item => item.id));
    return order.items.every(item => alreadyRestored(item) || restoredIds.has(item.id));
}
