import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/prisma";
import { InventoryEditError } from "./validate-inventory-edit";
import { getInventoryDeleteImpact } from "./get-inventory-delete-impact";

function validateRequest(value: unknown) {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
    ) {
        throw new InventoryEditError("მოთხოვნის ფორმატი არასწორია.");
    }

    const input = value as Record<string, unknown>;

    if (
        Object.keys(input).some(
            key => key !== "requestId" && key !== "expectedVersion",
        )
    ) {
        throw new InventoryEditError(
            "მოთხოვნა შეიცავს გაუთვალისწინებელ ველს.",
        );
    }

    if (
        typeof input.requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            input.requestId,
        )
    ) {
        throw new InventoryEditError("მოთხოვნის კოდი არასწორია.");
    }

    if (
        typeof input.expectedVersion !== "string" ||
        !/^[0-9a-f]{64}$/.test(input.expectedVersion)
    ) {
        throw new InventoryEditError(
            "მარაგის ვერსია არასწორია. გახსენი წაშლის ფანჯარა ხელახლა.",
        );
    }

    return {
        requestId: input.requestId,
        expectedVersion: input.expectedVersion,
    };
}

export async function deleteInventoryItem(
    userId: string,
    businessId: string,
    inventoryItemId: string,
    value: unknown,
) {
    if (!inventoryItemId || inventoryItemId.length > 100) {
        throw new InventoryEditError("პროდუქტის კოდი არასწორია.");
    }

    const input = validateRequest(value);
    const prisma = createPrismaClient();

    try {
        return await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT id FROM "Business"
                    WHERE id = ${businessId}
                    FOR UPDATE
                `;

                const membership =
                    await tx.businessMembership.findFirst({
                        where: { userId, businessId },
                        select: { id: true },
                    });

                if (!membership) {
                    throw new InventoryEditError(
                        "ამ ბიზნესზე წვდომა აღარ გაქვს.",
                        403,
                    );
                }

                // იგივე მოთხოვნის გამეორება მეორე
                // ჩამოწერას აღარ შექმნის.
                const previous = await tx.inventoryWriteOff.findUnique({
                    where: {
                        businessId_requestId: {
                            businessId,
                            requestId: input.requestId,
                        },
                    },
                });

                if (previous) {
                    if (previous.inventoryItemId !== inventoryItemId) {
                        throw new InventoryEditError(
                            "ეს მოთხოვნის კოდი სხვა პროდუქტს ეკუთვნის.",
                            409,
                        );
                    }

                    return {
                        id: inventoryItemId,
                        writeOffId: previous.id,
                        quantity: previous.quantity,
                        writeOffCost: previous.totalCost.toFixed(2),
                        replayed: true,
                    };
                }

                await tx.$queryRaw`
                    SELECT id FROM "InventoryItem"
                    WHERE id = ${inventoryItemId}
                      AND "businessId" = ${businessId}
                    FOR UPDATE
                `;

                await tx.$queryRaw`
                    SELECT id FROM "InventoryStockLot"
                    WHERE "inventoryItemId" = ${inventoryItemId}
                    ORDER BY id
                    FOR UPDATE
                `;

                const impact = await getInventoryDeleteImpact(
                    tx,
                    businessId,
                    inventoryItemId,
                );

                if (impact.expectedVersion !== input.expectedVersion) {
                    throw new InventoryEditError(
                        "მარაგი შეიცვალა. გახსენი წაშლის ფანჯარა ხელახლა და გადაამოწმე განახლებული რაოდენობა.",
                        409,
                    );
                }

                const lots = await tx.inventoryStockLot.findMany({
                    where: { inventoryItemId },
                    orderBy: { id: "asc" },
                    include: { purchaseItem: true },
                });

                const affectedPurchaseIds = new Set<string>();
                const seenPurchaseItems = new Set<string>();

                for (const lot of lots) {
                    if (
                        lot.writtenOffQuantity < 0 ||
                        lot.writtenOffDefectiveQuantity < 0 ||
                        lot.writtenOffDefectiveQuantity >
                            lot.writtenOffQuantity ||
                        lot.remainingQuantity + lot.writtenOffQuantity >
                            lot.quantity
                    ) {
                        throw new InventoryEditError(
                            "ჩამოწერისა და მარაგის ნაშთები არ ემთხვევა.",
                            409,
                        );
                    }

                    const source = lot.purchaseItem;

                    if (source) {
                        if (
                            seenPurchaseItems.has(source.id) ||
                            source.inventoryItemId !== inventoryItemId ||
                            source.remainingQuantity !==
                                lot.remainingQuantity ||
                            source.remainingDefectiveQuantity !==
                                lot.remainingDefectiveQuantity ||
                            (
                                source.remainingCost === null
                                    ? lot.remainingCost !== null
                                    : lot.remainingCost === null ||
                                      !source.remainingCost.equals(
                                          lot.remainingCost,
                                      )
                            )
                        ) {
                            throw new InventoryEditError(
                                "პარტიისა და მარაგის ნაშთები არ ემთხვევა. წაშლა შეჩერებულია.",
                                409,
                            );
                        }

                        seenPurchaseItems.add(source.id);
                    }

                    if (lot.remainingQuantity === 0) continue;

                    const goodQuantity =
                        lot.remainingQuantity -
                        lot.remainingDefectiveQuantity;

                    await tx.inventoryStockLot.update({
                        where: { id: lot.id },
                        data: {
                            writtenOffQuantity: {
                                increment: lot.remainingQuantity,
                            },
                            writtenOffDefectiveQuantity: {
                                increment: lot.remainingDefectiveQuantity,
                            },
                            remainingQuantity: 0,
                            remainingDefectiveQuantity: 0,
                            remainingCost: new Prisma.Decimal(0),
                        },
                    });

                    if (source) {
                        await tx.purchaseItem.update({
                            where: { id: source.id },
                            data: {
                                remainingQuantity: 0,
                                remainingDefectiveQuantity: 0,
                                remainingCost: new Prisma.Decimal(0),
                            },
                        });

                        affectedPurchaseIds.add(source.purchaseId);
                    }

                    const movements = [
                        {
                            quantity: goodQuantity,
                            condition: "GOOD" as const,
                        },
                        {
                            quantity: lot.remainingDefectiveQuantity,
                            condition: "DEFECTIVE" as const,
                        },
                    ].filter(movement => movement.quantity > 0);

                    await tx.inventoryMovement.createMany({
                        data: movements.map(movement => ({
                            inventoryItemId,
                            purchaseItemId: lot.purchaseItemId,
                            type: "ADJUSTMENT_OUT" as const,
                            quantity: movement.quantity,
                            condition: movement.condition,
                            note: "მარაგიდან პროდუქტის წაშლა",
                        })),
                    });
                }

                const writeOff = await tx.inventoryWriteOff.create({
                    data: {
                        businessId,
                        inventoryItemId,
                        requestId: input.requestId,
                        name: impact.name,
                        color: impact.color || null,
                        size: impact.size || null,
                        quantity: impact.quantity,
                        defectiveQuantity: impact.defectiveQuantity,
                        totalCost: new Prisma.Decimal(
                            impact.writeOffCost,
                        ),
                    },
                    select: { id: true },
                });

                await tx.inventoryItem.update({
                    where: { id: inventoryItemId },
                    data: {
                        currentStock: 0,
                        isActive: false,
                    },
                });

                // უკვე გახსნილი პარტიის ფორმამ ძველი
                // ნაშთი შეუმჩნევლად არ უნდა გადააწეროს.
                if (affectedPurchaseIds.size > 0) {
                    await tx.purchase.updateMany({
                        where: {
                            businessId,
                            id: { in: [...affectedPurchaseIds] },
                        },
                        data: { updatedAt: new Date() },
                    });
                }

                return {
                    id: inventoryItemId,
                    writeOffId: writeOff.id,
                    quantity: impact.quantity,
                    writeOffCost: impact.writeOffCost,
                    replayed: false,
                };
            },
            {
                maxWait: 10000,
                timeout: 30000,
            },
        );
    } finally {
        await prisma.$disconnect();
    }
}