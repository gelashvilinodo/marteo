import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { PurchaseEditError } from "./lock-purchase-for-edit";

type PurchaseForEditCheck = {
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
    _tx: Prisma.TransactionClient,
    purchase: PurchaseForEditCheck,
) {
    if (purchase.archivedAt !== null) {
        throw new PurchaseEditError(
            "რედაქტირებისთვის ჯერ აღადგინე პარტია არქივიდან.",
            409,
        );
    }

    for (const item of purchase.items) {
        const quantities = [
            item.quantity,
            item.remainingQuantity,
            item.defectiveQuantity,
            item.remainingDefectiveQuantity,
        ];

        if (
            quantities.some(
                value => !Number.isSafeInteger(value) || value < 0,
            ) ||
            item.quantity < 1 ||
            item.remainingQuantity > item.quantity ||
            item.defectiveQuantity > item.quantity ||
            item.remainingDefectiveQuantity > item.remainingQuantity
        ) {
            throw new PurchaseEditError(
                "პარტიის რაოდენობები არასწორია. ცვლილებები არ შენახულა.",
                409,
            );
        }

        if (
            purchase.receiptStatus === "IN_TRANSIT" &&
            (
                item.remainingQuantity !== 0 ||
                item.remainingDefectiveQuantity !== 0
            )
        ) {
            throw new PurchaseEditError(
                "გზაში მყოფ პარტიაზე მიღებული მარაგია დაფიქსირებული.",
                409,
            );
        }
    }
}