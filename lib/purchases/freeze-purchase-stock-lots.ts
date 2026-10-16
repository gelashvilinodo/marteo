import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { PurchaseEditError } from "./lock-purchase-for-edit";

// გამოიძახება მხოლოდ პარტიის რედაქტირების ტრანზაქციაში,
// Business-ის ბლოკირების შემდეგ.
export async function freezePurchaseStockLots(
    tx: Prisma.TransactionClient,
    businessId: string,
    purchaseId: string,
) {
    const items = await tx.purchaseItem.findMany({
        where: {
            purchaseId,
            purchase: {
                businessId,
                receiptStatus: "RECEIVED",
            },
        },
        include: {
            historicalStockLots: {
                select: { quantity: true },
            },
            stockLots: {
                include: {
                    orderAllocations: {
                        select: {
                            purchaseItemId: true,
                            quantity: true,
                            returnedQuantity: true,
                            transferredQuantity: true,
                            condition: true,
                            orderItem: {
                                select: { stockRestoredAt: true },
                            },
                        },
                    },
                },
            },
        },
    });

    for (const item of items) {
        // ამ ეტაპზე თითო პროდუქტს ერთი მიმდინარე ნაშთი აქვს.
        if (item.stockLots.length !== 1) {
            throw new PurchaseEditError(
                "მარაგის მონაცემების ახალ ფორმატში გადატანა დასრულებული არ არის.",
                409,
            );
        }

        const lot = item.stockLots[0];
        const historicalQuantity = item.historicalStockLots.reduce(
            (sum, historical) => sum + historical.quantity,
            0,
        );

        if (
            lot.inventoryItemId !== item.inventoryItemId ||
            lot.sourcePurchaseItemId !== null ||
            lot.remainingQuantity !== item.remainingQuantity ||
            lot.remainingDefectiveQuantity !==
                item.remainingDefectiveQuantity ||
            historicalQuantity + lot.quantity !== item.quantity
        ) {
            throw new PurchaseEditError(
                "შესყიდვისა და მარაგის ნაშთები ერთმანეთს არ ემთხვევა.",
                409,
            );
        }

        let usedQuantity = 0;
        let usedDefectiveQuantity = 0;

        for (const allocation of lot.orderAllocations) {
            if (allocation.purchaseItemId !== item.id) {
                throw new PurchaseEditError(
                    "მარაგის განაწილების კავშირი არასწორია.",
                    409,
                );
            }

            const quantity =
                allocation.quantity -
                allocation.returnedQuantity -
                allocation.transferredQuantity;

            if (quantity < 0) {
                throw new PurchaseEditError(
                    "მარაგის განაწილების რაოდენობა არასწორია.",
                    409,
                );
            }

            if (allocation.orderItem.stockRestoredAt) continue;

            usedQuantity += quantity;

            if (allocation.condition === "DEFECTIVE") {
                usedDefectiveQuantity += quantity;
            }
        }

        if (usedQuantity !== lot.quantity - lot.remainingQuantity) {
            throw new PurchaseEditError(
                "გამოყენებული რაოდენობა მარაგის ნაშთს არ ემთხვევა.",
                409,
            );
        }

        if (lot.orderAllocations.length === 0) {
            await tx.inventoryStockLot.delete({
                where: { id: lot.id },
            });
        } else {
            // ძველი შეკვეთები ძველ ვარიანტსა და ფასს ინარჩუნებს.
            // აქ დაბრუნებული ერთეულები დამოუკიდებელ მარაგად აღდგება.
            await tx.inventoryStockLot.update({
                where: { id: lot.id },
                data: {
                    purchaseItemId: null,
                    sourcePurchaseItemId: item.id,
                    quantity: usedQuantity,
                    defectiveQuantity: usedDefectiveQuantity,
                    remainingQuantity: 0,
                    remainingDefectiveQuantity: 0,
                    remainingCost: new Prisma.Decimal(0),
                },
            });
        }
    }
}