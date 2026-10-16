import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { InventoryEditError } from "./validate-inventory-edit";

// გამოიძახება ტრანზაქციაში, Business-ის ბლოკირების შემდეგ.
export async function getInventoryDeleteImpact(
    tx: Prisma.TransactionClient,
    businessId: string,
    inventoryItemId: string,
) {
    const item = await tx.inventoryItem.findFirst({
        where: {
            id: inventoryItemId,
            businessId,
            isActive: true,
            product: { businessId },
        },
        include: {
            product: true,
            stockLots: {
                orderBy: { id: "asc" },
                include: {
                    purchaseItem: {
                        select: {
                            purchaseId: true,
                            purchase: {
                                select: {
                                    businessId: true,
                                    receiptStatus: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!item) {
        throw new InventoryEditError(
            "პროდუქტი ვერ მოიძებნა ან უკვე წაშლილია.",
            404,
        );
    }

    let quantity = 0;
    let defectiveQuantity = 0;
    let cost = new Prisma.Decimal(0);

    const purchaseIds = new Set<string>();

    for (const lot of item.stockLots) {
        if (
            lot.purchaseItem &&
            lot.purchaseItem.purchase.businessId !== businessId
        ) {
            throw new InventoryEditError(
                "მარაგის კავშირები არასწორია. წაშლა შეჩერებულია.",
                409,
            );
        }

        if (
            !Number.isSafeInteger(lot.remainingQuantity) ||
            !Number.isSafeInteger(lot.remainingDefectiveQuantity) ||
            lot.remainingQuantity < 0 ||
            lot.remainingDefectiveQuantity < 0 ||
            lot.remainingDefectiveQuantity > lot.remainingQuantity ||
            lot.remainingQuantity > lot.quantity
        ) {
            throw new InventoryEditError(
                "მარაგის რაოდენობები არ ემთხვევა. წაშლა შეჩერებულია.",
                409,
            );
        }

        if (
            lot.remainingQuantity > 0 &&
            lot.purchaseItem &&
            lot.purchaseItem.purchase.receiptStatus !== "RECEIVED"
        ) {
            throw new InventoryEditError(
                "ჩამოსული მარაგისა და პარტიის სტატუსი არ ემთხვევა.",
                409,
            );
        }

        const remainingCost = lot.remainingCost ??
            lot.unitCost.mul(lot.remainingQuantity);

        if (
            !remainingCost.isFinite() ||
            remainingCost.isNegative() ||
            (
                lot.remainingQuantity === 0 &&
                !remainingCost.isZero()
            )
        ) {
            throw new InventoryEditError(
                "მარაგის თვითღირებულება არასწორია. წაშლა შეჩერებულია.",
                409,
            );
        }

        quantity += lot.remainingQuantity;
        defectiveQuantity += lot.remainingDefectiveQuantity;
        cost = cost.plus(remainingCost);

        if (lot.remainingQuantity > 0 && lot.purchaseItem) {
            purchaseIds.add(lot.purchaseItem.purchaseId);
        }
    }

    if (
        !Number.isSafeInteger(quantity) ||
        !Number.isSafeInteger(defectiveQuantity) ||
        item.currentStock !== quantity
    ) {
        throw new InventoryEditError(
            "მარაგის საერთო რაოდენობა ნაშთებს არ ემთხვევა. წაშლა შეჩერებულია.",
            409,
        );
    }

    const costText = cost.toFixed(2);

    // დადასტურების შემდეგ შეცვლილი მარაგის წაშლა
    // ხელახალი გადამოწმების გარეშე არ უნდა შესრულდეს.
    const expectedVersion = createHash("sha256")
        .update(JSON.stringify({
            id: item.id,
            updatedAt: item.updatedAt.toISOString(),
            productId: item.productId,
            productUpdatedAt: item.product.updatedAt.toISOString(),
            quantity,
            defectiveQuantity,
            cost: costText,
            lots: item.stockLots.map(lot => ({
                id: lot.id,
                updatedAt: lot.updatedAt.toISOString(),
                purchaseItemId: lot.purchaseItemId,
                quantity: lot.remainingQuantity,
                defectiveQuantity: lot.remainingDefectiveQuantity,
                writtenOffQuantity: lot.writtenOffQuantity,
                writtenOffDefectiveQuantity: lot.writtenOffDefectiveQuantity,
                remainingCost: lot.remainingCost?.toFixed(2) ?? null,
                unitCost: lot.unitCost.toFixed(2),
                receiptStatus:
                    lot.purchaseItem?.purchase.receiptStatus ?? null,
            })),
        }))
        .digest("hex");

    const purchases = await tx.purchase.findMany({
        where: {
            businessId,
            items: {
                some: {
                    OR: [
                        { inventoryItemId: item.id },
                        {
                            historicalStockLots: {
                                some: { inventoryItemId: item.id },
                            },
                        },
                    ],
                },
            },
        },
        orderBy: [{ purchaseDate: "desc" }, { id: "desc" }],
        select: {
            id: true,
            number: true,
            name: true,
            archivedAt: true,
        },
    });

    return {
        id: item.id,
        name: item.product.name,
        color: item.color ?? "",
        size: item.size ?? "",
        quantity,
        goodQuantity: quantity - defectiveQuantity,
        defectiveQuantity,
        writeOffCost: costText,
        affectedPurchases: purchaseIds.size,
        expectedVersion,
        purchases: purchases.map(purchase => ({
            id: purchase.id,
            number: purchase.number,
            name: purchase.name,
            archived: purchase.archivedAt !== null,
        })),
    };
}