import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { PurchaseEditError } from "./lock-purchase-for-edit";

type PurchaseForEditCheck = {
    id: string;
    archivedAt: Date | null;
    receiptStatus: "IN_TRANSIT" | "RECEIVED";
    items: Array<{
        quantity: number;
        remainingQuantity: number;
        defectiveQuantity: number;
        remainingDefectiveQuantity: number;
    }>;
};

export async function assertPurchaseEditable(
    tx: Prisma.TransactionClient,
    purchase: PurchaseForEditCheck,
) {
    if (purchase.archivedAt !== null) {
        throw new PurchaseEditError(
            "რედაქტირებისთვის ჯერ აღადგინე პარტია არქივიდან.",
            409,
        );
    }

    const allocation = await tx.orderItemAllocation.findFirst({
        where: {
            purchaseItem: {
                purchaseId: purchase.id,
            },
        },
        select: { id: true },
    });

    if (allocation) {
        throw new PurchaseEditError(
            "ამ პარტიიდან გაყიდვა უკვე დაფიქსირდა და რედაქტირება აღარ არის შესაძლებელი.",
            409,
        );
    }

    const movement = await tx.inventoryMovement.findFirst({
        where: {
            purchaseItem: {
                purchaseId: purchase.id,
            },
            ...(purchase.receiptStatus === "RECEIVED"
                ? { type: { not: "PURCHASE_IN" as const } }
                : {}),
        },
        select: {
            id: true,
            type: true,
        },
    });

    if (movement) {
        throw new PurchaseEditError(
            "ამ პარტიაზე მარაგის შემდგომი მოძრაობაა დაფიქსირებული და რედაქტირება აღარ არის შესაძლებელი.",
            409,
        );
    }

    const hasUnexpectedBalance = purchase.items.some((item) => {
        if (purchase.receiptStatus === "IN_TRANSIT") {
            return (
                item.remainingQuantity !== 0 ||
                item.remainingDefectiveQuantity !== 0
            );
        }

        return (
            item.remainingQuantity !== item.quantity ||
            item.remainingDefectiveQuantity !== item.defectiveQuantity
        );
    });

    if (hasUnexpectedBalance) {
        throw new PurchaseEditError(
            "პარტიის ნაშთები საწყის რაოდენობებს არ ემთხვევა. რედაქტირებამდე საჭიროა მათი შემოწმება.",
            409,
        );
    }
}