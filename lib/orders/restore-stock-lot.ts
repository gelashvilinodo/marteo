import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { OrderValidationError } from "./validate-order";

type RestoreStockLotInput = {
    businessId: string;
    inventoryItemId: string;
    stockLotId: string;
    quantity: number;
    condition: "GOOD" | "DEFECTIVE";
    totalCost: Prisma.Decimal | null;
};

export async function restoreStockLot(
    tx: Prisma.TransactionClient,
    input: RestoreStockLotInput,
): Promise<{ purchaseItemId: string | null }> {
    if (
        !Number.isSafeInteger(input.quantity) ||
        input.quantity <= 0
    ) {
        throw new OrderValidationError(
            "დასაბრუნებელი რაოდენობა არასწორია.",
            422,
        );
    }

    if (
        input.totalCost !== null &&
        (!input.totalCost.isFinite() || input.totalCost.isNegative())
    ) {
        throw new OrderValidationError(
            "დასაბრუნებელი პროდუქტის თვითღირებულება არასწორია.",
            409,
        );
    }

    // არქივირებული ვარიანტის დაბრუნებაც დასაშვებია.
    const inventory = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
            SELECT "id"
            FROM "InventoryItem"
            WHERE "id" = ${input.inventoryItemId}
              AND "businessId" = ${input.businessId}
            FOR UPDATE
        `,
    );

    if (!inventory.length) {
        throw new OrderValidationError(
            "დასაბრუნებელი პროდუქტის მარაგი ვერ მოიძებნა.",
            409,
        );
    }

    const lockedLots = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
            SELECT "id"
            FROM "InventoryStockLot"
            WHERE "id" = ${input.stockLotId}
              AND "inventoryItemId" = ${input.inventoryItemId}
            FOR UPDATE
        `,
    );

    if (!lockedLots.length) {
        throw new OrderValidationError(
            "პროდუქტის მარაგის განაწილების ჩანაწერი ვერ მოიძებნა.",
            409,
        );
    }

    const lot = await tx.inventoryStockLot.findUniqueOrThrow({
        where: { id: input.stockLotId },
        include: {
            purchaseItem: {
                include: {
                    purchase: {
                        select: { businessId: true },
                    },
                },
            },
        },
    });

    if (
        lot.remainingQuantity < 0 ||
        lot.remainingDefectiveQuantity < 0 ||
        lot.remainingDefectiveQuantity > lot.remainingQuantity
    ) {
        throw new OrderValidationError(
            "პროდუქტის მარაგის ნაშთები არასწორია.",
            409,
        );
    }

    if (
        lot.purchaseItem &&
        (
            lot.purchaseItem.inventoryItemId !== input.inventoryItemId ||
            lot.purchaseItem.purchase.businessId !== input.businessId ||
            lot.purchaseItem.remainingQuantity !== lot.remainingQuantity ||
            lot.purchaseItem.remainingDefectiveQuantity !==
                lot.remainingDefectiveQuantity
        )
    ) {
        throw new OrderValidationError(
            "შესყიდვისა და მარაგის ნაშთები ერთმანეთს არ ემთხვევა.",
            409,
        );
    }

    // ცარიელ ნაშთს ძველი უცნობი ღირებულება აღარ გადმოჰყვება.
    // არაცარიელი ნაშთის უცნობი ღირებულება უცნობადვე რჩება.
    const previousCost = lot.remainingQuantity === 0
        ? new Prisma.Decimal(0)
        : lot.remainingCost;

    const nextCost =
        previousCost !== null && input.totalCost !== null
            ? previousCost.plus(input.totalCost)
            : null;

    const balanceChange = {
        remainingQuantity: { increment: input.quantity },
        remainingCost: nextCost,
        ...(input.condition === "DEFECTIVE"
            ? {
                remainingDefectiveQuantity: {
                    increment: input.quantity,
                },
            }
            : {}),
    };

    await tx.inventoryStockLot.update({
        where: { id: lot.id },
        data: balanceChange,
    });

    if (lot.purchaseItemId) {
        await tx.purchaseItem.update({
            where: { id: lot.purchaseItemId },
            data: balanceChange,
        });
    }

    return { purchaseItemId: lot.purchaseItemId };
}