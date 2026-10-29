import { isOwnedStorageImage } from "@/lib/security/storage-image";
import { qvalue } from "@/lib/orders/quantity";
import { numericQuantities, type NumericQuantities } from "@/lib/orders/quantity";
import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { OrderValidationError, type ValidatedOrder } from "./validate-order";
import { consumeOrderMaterial, restoreMaterialAllocations } from "./material-stock";
import { allocateStockLots } from "./allocate-stock-lots";
import { restoreStockLot } from "./restore-stock-lot";

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
            const valid = isOwnedStorageImage(imageUrl, "product-images", businessId);

            if (!valid) {
                fail(
                    `${item.name}: ფოტოს მისამართი არასწორია.`,
                    422,
                );
            }
        }
        let unitCost =
            item.unitCost ?? new Prisma.Decimal(0);

        let exactTotalCost: Prisma.Decimal | null =
            item.source === "MANUAL" && item.unitCost !== null
                ? item.unitCost.mul(item.quantity)
                : null;

        const allocations: Array<{
            stockLotId: string;
            purchaseItemId: string | null;
            quantity: number;
            unitCost: Prisma.Decimal;
            totalCost: Prisma.Decimal | null;
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

            allocations.push(
                ...await allocateStockLots(tx, {
                    businessId,
                    inventoryItemId: inventory.id,
                    name: item.name,
                    quantity: item.quantity,
                    condition: item.condition,
                    unitCost: item.unitCost,
                }),
            );

            const costTotal = allocations.reduce(
                (sum, allocation) =>
                    sum.plus(
                        allocation.totalCost ??
                        allocation.unitCost.mul(allocation.quantity),
                    ),
                new Prisma.Decimal(0),
            );

            exactTotalCost = allocations.every(
                allocation => allocation.totalCost !== null,
            )
                ? costTotal
                : null;

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

        const materialSale=item.source === "MATERIAL" ? await consumeOrderMaterial(tx,businessId,item.materialId!,item.quantity) : null;
        if(materialSale){imageUrl=materialSale.material.imageUrl;exactTotalCost=materialSale.totalCost;unitCost=exactTotalCost.div(item.quantity).toDecimalPlaces(2);}
        const orderItem = await tx.orderItem.create({
            data: {
                orderId: orderId,
                fulfillmentCycle,
                isActive: true,
                inventoryItemId:
                    item.inventoryItemId,
                source: item.source,
                materialId: materialSale?.material.id ?? null,
                unit: materialSale?.material.unit ?? "PCS",
                condition: item.condition,
                name: materialSale?.material.name ?? item.name,
                description:
                    item.description || null,
                color: item.color || null,
                size: item.size || null,
                imageUrl,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                unitCost,
                totalCost: exactTotalCost,
            },
            select: { id: true },
        });

        if(materialSale)await tx.materialOrderAllocation.createMany({data:materialSale.allocations.map(a=>({...a,orderItemId:orderItem.id}))});
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
    items: { where: { isActive: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { materialAllocations: true, allocations: { include: { purchaseItem: { include: { purchase: true } } } } } },
    payments: true,
} satisfies Prisma.OrderInclude;
export type StockOrder = NumericQuantities<Prisma.OrderGetPayload<{ include: typeof orderWithStock }>>;

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
    }).then(numericQuantities);
    if (returns.some(entry => entry.status === "PENDING")) {
        fail("ჯერ დაადასტურე მიმდინარე დაბრუნების ფიზიკური მიღება.", 409);
    }
    const received = new Map<string, number>();
    for (const entry of returns) {
        for (const item of entry.items) {
            received.set(item.orderItemId, qvalue((received.get(item.orderItemId) ?? 0) + item.quantity));
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
        if(item.source === "MATERIAL"){
            if(!item.materialId)fail("მასალის მონაცემები აკლია.",409);
            await restoreMaterialAllocations(tx,order.businessId,item.materialId,item.materialAllocations,item.quantity,item.condition);
        }
        if (item.source === "INVENTORY") {
            if (!item.inventoryItemId || item.allocations.reduce((sum, value) => qvalue(sum + value.quantity), 0) !== item.quantity) {
                fail("ნივთის მარაგის განაწილების მონაცემები აკლია.", 409);
            }
            const restorableQuantity = item.allocations.reduce(
                (sum, allocation) =>
                    qvalue(sum +
                    allocation.quantity -
                    allocation.returnedQuantity -
                    allocation.transferredQuantity),
                0,
            );

            if (restorableQuantity !== item.quantity) {
                fail(
                    "აღსადგენი მარაგის რაოდენობა შეკვეთას არ ემთხვევა.",
                    409,
                );
            }

            for (const allocation of item.allocations) {
                const quantity =
                    qvalue(allocation.quantity -
                    allocation.returnedQuantity -
                    allocation.transferredQuantity);

                if (quantity < 0) {
                    fail("მარაგის განაწილება არასწორია.", 409);
                }

                if (quantity === 0) continue;

                if (!allocation.stockLotId) {
                    fail(
                        "მარაგის მონაცემების ახალ ფორმატში გადატანა დასრულებული არ არის.",
                        409,
                    );
                }

                const restoredCost =
                    allocation.totalCost !== null &&
                        allocation.transferredCost !== null
                        ? allocation.totalCost
                            .minus(allocation.returnedCost)
                            .minus(allocation.transferredCost)
                        : null;

                const restored = await restoreStockLot(tx, {
                    businessId: order.businessId,
                    inventoryItemId: item.inventoryItemId,
                    stockLotId: allocation.stockLotId,
                    quantity,
                    condition: allocation.condition,
                    totalCost: restoredCost,
                });

                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: item.inventoryItemId,
                        purchaseItemId: restored.purchaseItemId,
                        orderItemId: item.id,
                        type: "CUSTOMER_RETURN_IN",
                        condition: allocation.condition,
                        quantity,
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
