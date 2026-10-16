import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { allocateCost } from "@/lib/analytics/allocate-cost";
import { PurchaseEditError } from "./lock-purchase-for-edit";
import type { PurchaseItemUsage } from "./get-purchase-edit-usage";
import type { validatePurchase } from "./validate-purchases";

type PurchaseInput = ReturnType<typeof validatePurchase>;

export type PurchaseEditBalance = {
    purchaseItemId: string | null;
    quantity: number;
    defectiveQuantity: number;

    usedQuantity: number;
    usedGoodQuantity: number;
    usedDefectiveQuantity: number;

    remainingQuantity: number;
    remainingDefectiveQuantity: number;
    remainingCost: Prisma.Decimal;
    unitCost: Prisma.Decimal;
};

export function planPurchaseEdit(
    input: PurchaseInput,
    usageByItem: ReadonlyMap<string, PurchaseItemUsage>,
): PurchaseEditBalance[] {
    const isReceived = input.receiptStatus === "RECEIVED";

    return input.items.map((item, index) => {
        const calculated = input.calculation.items[index];
        const usage = item.purchaseItemId
            ? usageByItem.get(item.purchaseItemId)
            : undefined;

        const usedQuantity = usage?.usedQuantity ?? 0;
        const usedGoodQuantity = usage?.usedGoodQuantity ?? 0;
        const usedDefectiveQuantity =
            usage?.usedDefectiveQuantity ?? 0;

        const quantity = calculated.quantity;
        const defectiveQuantity = isReceived
            ? item.defectiveQuantity
            : 0;

        if (
            !Number.isSafeInteger(usedQuantity) ||
            !Number.isSafeInteger(usedGoodQuantity) ||
            !Number.isSafeInteger(usedDefectiveQuantity) ||
            usedGoodQuantity < 0 ||
            usedDefectiveQuantity < 0 ||
            usedQuantity !== usedGoodQuantity + usedDefectiveQuantity
        ) {
            throw new PurchaseEditError(
                `${item.name}: გამოყენებული რაოდენობები არასწორია.`,
                409,
            );
        }

        if (!isReceived && usedQuantity > 0) {
            throw new PurchaseEditError(
                `${item.name}: გზაში მყოფ პარტიაზე გამოყენებული მარაგია დაფიქსირებული.`,
                409,
            );
        }

        if (quantity < usedQuantity) {
            throw new PurchaseEditError(
                `${item.name}: გამოყენებული ან ჩამოწერილია ${usedQuantity} ერთეული. რაოდენობა ამაზე ნაკლები ვერ იქნება.`,
                409,
            );
        }

        if (defectiveQuantity < usedDefectiveQuantity) {
            throw new PurchaseEditError(
                `${item.name}: გამოყენებული ან ჩამოწერილია ${usedDefectiveQuantity} წუნდებული ერთეული. წუნდებული რაოდენობა ამაზე ნაკლები ვერ იქნება.`,
                409,
            );
        }

        if (quantity - defectiveQuantity < usedGoodQuantity) {
            throw new PurchaseEditError(
                `${item.name}: გამოყენებული ან ჩამოწერილია ${usedGoodQuantity} დაუზიანებელი ერთეული. დაუზიანებელი რაოდენობა ამაზე ნაკლები ვერ იქნება.`,
                409,
            );
        }

        const remainingQuantity = isReceived
            ? quantity - usedQuantity
            : 0;

        const remainingDefectiveQuantity = isReceived
            ? defectiveQuantity - usedDefectiveQuantity
            : 0;

        const calculatedTotalCost =
            new Prisma.Decimal(calculated.unitPurchasePrice)
                .mul(quantity)
                .plus(calculated.allocatedExtraCostTotal);

        // ახლანდელი ღირებულებიდან მხოლოდ დარჩენილი ერთეულების
        // წილს ვითვლით. გაყიდულის ისტორიულ თანხებს არ ვცვლით.
        const remainingCost = isReceived
            ? allocateCost(
                calculatedTotalCost,
                [remainingQuantity, usedQuantity],
            )[0]
            : new Prisma.Decimal(0);

        return {
            purchaseItemId: item.purchaseItemId,
            quantity,
            defectiveQuantity,
            usedQuantity,
            usedGoodQuantity,
            usedDefectiveQuantity,
            remainingQuantity,
            remainingDefectiveQuantity,
            remainingCost,
            unitCost: new Prisma.Decimal(calculated.finalUnitCost),
        };
    });
}