import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getPurchaseEditUsage } from "./get-purchase-edit-usage";
import { PurchaseEditError } from "./lock-purchase-for-edit";

export type PurchaseDeleteExpectation = {
    updatedAt: string;
    remainingQuantity: number;
    usedQuantity: number;
};

export async function getPurchaseDeleteImpact(
    tx: Prisma.TransactionClient,
    businessId: string,
    purchaseId: string,
) {
    const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, businessId },
        select: {
            id: true,
            number: true,
            updatedAt: true,
            receiptStatus: true,
            items: {
                select: {
                    remainingQuantity: true,
                    remainingDefectiveQuantity: true,
                },
            },
        },
    });

    if (!purchase) {
        throw new PurchaseEditError(
            "პარტია ვერ მოიძებნა. განაახლე სია.",
            404,
        );
    }

    for (const item of purchase.items) {
        if (
            !Number.isSafeInteger(item.remainingQuantity) ||
            !Number.isSafeInteger(item.remainingDefectiveQuantity) ||
            item.remainingQuantity < 0 ||
            item.remainingDefectiveQuantity < 0 ||
            item.remainingDefectiveQuantity > item.remainingQuantity
        ) {
            throw new PurchaseEditError(
                "პარტიის ნაშთები არასწორია. წაშლა შეჩერებულია.",
                409,
            );
        }
    }

    const usage = await getPurchaseEditUsage(
        tx,
        businessId,
        purchaseId,
    );

    return {
        id: purchase.id,
        number: purchase.number,
        updatedAt: purchase.updatedAt.toISOString(),
        receiptStatus: purchase.receiptStatus,
        remainingQuantity: purchase.items.reduce(
            (sum, item) => sum + item.remainingQuantity,
            0,
        ),
        usedQuantity: [...usage.values()].reduce(
            (sum, item) => sum + item.usedQuantity,
            0,
        ),
    };
}