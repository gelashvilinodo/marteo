import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { allocateCost } from "@/lib/analytics/allocate-cost";
import { OrderValidationError } from "./validate-order";

type StockAllocation = {
    stockLotId: string;
    purchaseItemId: string | null;
    quantity: number;
    unitCost: Prisma.Decimal;
    totalCost: Prisma.Decimal | null;
};

type AllocationInput = {
    businessId: string;
    inventoryItemId: string;
    name: string;
    quantity: number;
    condition: "GOOD" | "DEFECTIVE";
    unitCost?: Prisma.Decimal | null;
};

export async function allocateStockLots(
    tx: Prisma.TransactionClient,
    input: AllocationInput,
): Promise<StockAllocation[]> {
    if (
        !Number.isSafeInteger(input.quantity) ||
        input.quantity <= 0
    ) {
        throw new OrderValidationError(
            "პროდუქტის რაოდენობა არასწორია.",
            422,
        );
    }

    // ამ ვარიანტის პარალელური გაყიდვები ერთმანეთს უნდა დაელოდოს.
    const inventory = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
            SELECT "id"
            FROM "InventoryItem"
            WHERE "id" = ${input.inventoryItemId}
              AND "businessId" = ${input.businessId}
              AND "isActive" = true
            FOR UPDATE
        `,
    );

    if (!inventory.length) {
        throw new OrderValidationError(
            `${input.name}: პროდუქტი მარაგში აღარ არის.`,
            409,
        );
    }

    const lots = await tx.inventoryStockLot.findMany({
        where: {
            inventoryItemId: input.inventoryItemId,
            remainingQuantity: { gt: 0 },
            OR: [
                { purchaseItemId: null },
                {
                    purchaseItem: {
                        purchase: {
                            businessId: input.businessId,
                            receiptStatus: "RECEIVED",
                        },
                    },
                },
            ],
        },
        orderBy: [
            { availableAt: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
        ],
    });

    const allocations: StockAllocation[] = [];
    let needed = input.quantity;

    for (const lot of lots) {
        if (needed === 0) break;

        if (
            lot.remainingQuantity < 0 ||
            lot.remainingDefectiveQuantity < 0 ||
            lot.remainingDefectiveQuantity > lot.remainingQuantity
        ) {
            throw new OrderValidationError(
                `${input.name}: მარაგის ნაშთები არასწორია.`,
                409,
            );
        }

        const available = input.condition === "DEFECTIVE"
            ? lot.remainingDefectiveQuantity
            : lot.remainingQuantity - lot.remainingDefectiveQuantity;

        const quantity = Math.min(needed, available);
        if (quantity <= 0) continue;

        const split = lot.remainingCost === null
            ? null
            : allocateCost(
                lot.remainingCost,
                [quantity, lot.remainingQuantity - quantity],
            );

        const unitCost = lot.unitCost ?? (
            split
                ? split[0].div(quantity).toDecimalPlaces(
                    2,
                    Prisma.Decimal.ROUND_HALF_UP,
                )
                : input.unitCost ?? null
        );

        if (unitCost === null) {
            throw new OrderValidationError(
                `${input.name}: მარაგის თვითღირებულება უცნობია. ამ პროდუქტის ველში მიუთითე ერთი ერთეულის თვითღირებულება და ხელახლა შეინახე შეკვეთა.`,
                422,
            );
        }

        if (
            !unitCost.isFinite() ||
            unitCost.isNegative() ||
            unitCost.gt("9999999999.99") ||
            !unitCost.mul(100).isInteger()
        ) {
            throw new OrderValidationError(
                `${input.name}: თვითღირებულება მიუთითე არაუარყოფითი თანხით, თეთრების სიზუსტით.`,
                422,
            );
        }

        const allocationCost = split
            ? split[0]
            : lot.unitCost === null
                ? unitCost.mul(quantity)
                : null;

        await tx.inventoryStockLot.update({
            where: { id: lot.id },
            data: {
                remainingQuantity: { decrement: quantity },
                remainingCost: split ? split[1] : null,
                ...(input.condition === "DEFECTIVE"
                    ? {
                        remainingDefectiveQuantity: {
                            decrement: quantity,
                        },
                    }
                    : {}),
            },
        });

        // სანამ ძველი წამკითხველები ახალ მოდელზე გადავა,
        // დაკავშირებული შესყიდვის ნაშთიც სინქრონულად იცვლება.
        if (lot.purchaseItemId) {
            const result = await tx.purchaseItem.updateMany({
                where: {
                    id: lot.purchaseItemId,
                    inventoryItemId: input.inventoryItemId,
                    remainingQuantity: { gte: quantity },
                    ...(input.condition === "DEFECTIVE"
                        ? {
                            remainingDefectiveQuantity: {
                                gte: quantity,
                            },
                        }
                        : {}),
                },
                data: {
                    remainingQuantity: { decrement: quantity },
                    remainingCost: split ? split[1] : null,
                    ...(input.condition === "DEFECTIVE"
                        ? {
                            remainingDefectiveQuantity: {
                                decrement: quantity,
                            },
                        }
                        : {}),
                },
            });

            if (result.count !== 1) {
                throw new OrderValidationError(
                    `${input.name}: შესყიდვისა და მარაგის ნაშთები ერთმანეთს არ ემთხვევა.`,
                    409,
                );
            }
        }

        allocations.push({
            stockLotId: lot.id,
            purchaseItemId: lot.purchaseItemId,
            quantity,
            unitCost,
            totalCost: allocationCost,
        });

        needed -= quantity;
    }

    if (needed > 0) {
        const condition = input.condition === "DEFECTIVE"
            ? "წუნდებული"
            : "დაუზიანებელი";

        throw new OrderValidationError(
            `${input.name}: საკმარისი ${condition} პროდუქტი არ არის.`,
            409,
        );
    }

    return allocations;
}