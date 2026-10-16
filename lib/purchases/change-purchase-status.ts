import "server-only";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import {
    getPurchaseDeleteImpact,
    type PurchaseDeleteExpectation,
} from "./get-purchase-delete-impact";
import { freezePurchaseStockLots } from "./freeze-purchase-stock-lots";

export type PurchaseAction = "delete" | "archive" | "restore";

export class PurchaseActionError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
        this.name = "PurchaseActionError";
    }
}

export async function changePurchaseStatus(
    purchaseId: string,
    action: PurchaseAction,
    expectedDelete?: PurchaseDeleteExpectation,
) {
    if (!purchaseId || purchaseId.length > 100) {
        throw new PurchaseActionError("პარტიის კოდი არასწორია.");
    }

    if (!["delete", "archive", "restore"].includes(action)) {
        throw new PurchaseActionError("მოქმედება არასწორია.");
    }

    const user = await getCurrentUser();

    if (!user) {
        throw new PurchaseActionError(
            "მოქმედების შესასრულებლად შედი ანგარიშში.",
            401,
        );
    }

    const prisma = createPrismaClient();

    try {
        const membership = await prisma.businessMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { businessId: true },
        });

        if (!membership) {
            throw new PurchaseActionError(
                "ბიზნესზე წვდომა ვერ მოიძებნა.",
                403,
            );
        }

        const businessId = membership.businessId;

        return await prisma.$transaction(
            async (tx) => {
                // იმავე ბლოკირებას იყენებს შექმნა,
                // რედაქტირება და პარტიის მიღება.
                await tx.$queryRaw`
                    SELECT "id"
                    FROM "Business"
                    WHERE "id" = ${businessId}
                    FOR UPDATE
                `;

                const access = await tx.businessMembership.findFirst({
                    where: {
                        userId: user.id,
                        businessId,
                    },
                    select: { id: true },
                });

                if (!access) {
                    throw new PurchaseActionError(
                        "ამ ბიზნესზე წვდომა აღარ გაქვს.",
                        403,
                    );
                }

                const purchase = await tx.purchase.findFirst({
                    where: {
                        id: purchaseId,
                        businessId,
                    },
                    include: {
                        items: {
                            select: {
                                remainingQuantity: true,
                                remainingDefectiveQuantity: true,
                                id: true,
                                inventoryItemId: true,
                            },
                        },
                    },
                });

                if (!purchase) {
                    throw new PurchaseActionError(
                        "პარტია ვერ მოიძებნა. განაახლე სია.",
                        404,
                    );
                }

                if (action === "delete") {
                    if (!expectedDelete) {
                        throw new PurchaseActionError(
                            "წაშლამდე გახსენი განახლებული დადასტურების ფანჯარა.",
                            409,
                        );
                    }

                    const impact = await getPurchaseDeleteImpact(
                        tx,
                        businessId,
                        purchase.id,
                    );

                    if (
                        expectedDelete.updatedAt !== impact.updatedAt ||
                        expectedDelete.remainingQuantity !==
                        impact.remainingQuantity ||
                        expectedDelete.usedQuantity !== impact.usedQuantity
                    ) {
                        throw new PurchaseActionError(
                            "პარტიის მონაცემები შეიცვალა. ხელახლა გახსენი წაშლის ფანჯარა და გადაამოწმე რაოდენობები.",
                            409,
                        );
                    }

                    if (purchase.receiptStatus === "RECEIVED") {
                        // გამოყენებული ნაწილი ძველ ვარიანტთან რჩება.
                        await freezePurchaseStockLots(
                            tx,
                            businessId,
                            purchase.id,
                        );

                        const quantities = new Map<string, number>();

                        for (const item of purchase.items) {
                            quantities.set(
                                item.inventoryItemId,
                                (quantities.get(item.inventoryItemId) ?? 0) +
                                item.remainingQuantity,
                            );
                        }

                        for (
                            const [inventoryItemId, quantity] of
                            [...quantities.entries()].sort(
                                ([first], [second]) =>
                                    first.localeCompare(second),
                            )
                        ) {
                            if (quantity === 0) continue;

                            const result = await tx.inventoryItem.updateMany({
                                where: {
                                    id: inventoryItemId,
                                    businessId,
                                    currentStock: { gte: quantity },
                                },
                                data: {
                                    currentStock: { decrement: quantity },
                                },
                            });

                            if (result.count !== 1) {
                                throw new PurchaseActionError(
                                    "მარაგის ნაშთი პარტიას არ შეესაბამება. წაშლა გაუქმდა.",
                                    409,
                                );
                            }
                        }

                        const movements = purchase.items.flatMap(item => {
                            const goodQuantity =
                                item.remainingQuantity -
                                item.remainingDefectiveQuantity;

                            return [
                                {
                                    inventoryItemId: item.inventoryItemId,
                                    purchaseItemId: item.id,
                                    type: "ADJUSTMENT_OUT" as const,
                                    condition: "GOOD" as const,
                                    quantity: goodQuantity,
                                },
                                {
                                    inventoryItemId: item.inventoryItemId,
                                    purchaseItemId: item.id,
                                    type: "ADJUSTMENT_OUT" as const,
                                    condition: "DEFECTIVE" as const,
                                    quantity:
                                        item.remainingDefectiveQuantity,
                                },
                            ].filter(movement => movement.quantity > 0);
                        });

                        if (movements.length > 0) {
                            await tx.inventoryMovement.createMany({
                                data: movements,
                            });
                        }
                    } else if (
                        impact.remainingQuantity !== 0 ||
                        impact.usedQuantity !== 0
                    ) {
                        throw new PurchaseActionError(
                            "გზაში მყოფ პარტიაზე მარაგის გამოყენებაა დაფიქსირებული. წაშლა შეჩერებულია.",
                            409,
                        );
                    }

                    // პარტია და მისი სტრიქონები სრულად იშლება.
                    // შეკვეთები და ფინანსური ჩანაწერები არ იშლება.
                    await tx.purchase.delete({
                        where: { id: purchase.id },
                    });

                    return {
                        id: purchase.id,
                        number: purchase.number,
                        action,
                        removedQuantity: impact.remainingQuantity,
                    };
                }

                if (purchase.receiptStatus !== "RECEIVED") {
                    throw new PurchaseActionError(
                        "არქივი მხოლოდ ჩამოსული პარტიებისთვისაა ხელმისაწვდომი.",
                        409,
                    );
                }

                const shouldBeArchived = action === "archive";
                const alreadyArchived = purchase.archivedAt !== null;

                // განმეორებული მოთხოვნა მდგომარეობას აღარ შეცვლის.
                if (shouldBeArchived !== alreadyArchived) {
                    await tx.purchase.update({
                        where: { id: purchase.id },
                        data: {
                            archivedAt: shouldBeArchived
                                ? new Date()
                                : null,
                            updatedAt: new Date(
                                Math.max(
                                    Date.now(),
                                    purchase.updatedAt.getTime() + 1,
                                ),
                            ),
                        },
                    });
                }

                return {
                    id: purchase.id,
                    number: purchase.number,
                    action,
                };
            },
            {
                maxWait: 10000,
                timeout: 60000,
            },
        );
    } finally {
        await prisma.$disconnect();
    }
}