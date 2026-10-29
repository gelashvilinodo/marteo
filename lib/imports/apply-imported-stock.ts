import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { allocateCost } from "@/lib/analytics/allocate-cost";
import { OrderValidationError } from "@/lib/orders/order-validation-error";
import type { ProductImportPlanItem } from "./build-product-import-plan";
import type { ImportExistingProductLink } from "./product-import-links";
import {
    calculateImportedStock,
    type ProductStockPolicy,
} from "./product-stock-policy";
import { validateProductStockDate } from "./product-stock-date";

// მხოლოდ ავტორიზებულ ტრანზაქციაში, Business-ისა და ImportJob-ის
// დაბლოკვისა და იმპორტის გეგმის ხელახლა გადამოწმების შემდეგ.
export async function applyImportedStock({
    tx, businessId, jobId, item, decision, policy, stockDate,
}: {
    tx: Prisma.TransactionClient;
    businessId: string;
    jobId: string;
    item: ProductImportPlanItem;
    decision: ImportExistingProductLink;
    policy: ProductStockPolicy | null;
    stockDate: string | null;
}) {
    const record = item.record;
    const data = record.data;

    function fail(message: string, status = 422): never {
        throw new OrderValidationError(
            `${record.fileName} / ${record.sheetName} - რიგი ${record.rowNumber}: ${message}`,
            status,
        );
    }

    if (
        item.action !== "LINK" || record.status !== "READY" ||
        data === null || decision.action !== "LINK" ||
        decision.businessId !== businessId ||
        item.inventoryItemId !== decision.inventoryItemId
    ) {
        fail("არსებულ პროდუქტთან კავშირი დადასტურებული არ არის.");
    }

    const rows = await tx.$queryRaw<Array<{
        id: string;
        productId: string;
        sku: string;
        currentStock: number;
        inventoryUpdatedAt: Date;
        productUpdatedAt: Date;
    }>>(Prisma.sql`
        SELECT i."id", i."productId", i."sku", i."currentStock",
            i."updatedAt" AS "inventoryUpdatedAt",
            p."updatedAt" AS "productUpdatedAt"
        FROM "InventoryItem" i
        JOIN "Product" p ON p."id" = i."productId"
        WHERE i."id" = ${decision.inventoryItemId}
            AND i."businessId" = ${businessId}
            AND p."businessId" = ${businessId}
            AND i."isActive" = true
        FOR UPDATE OF i, p
    `);

    const existing = rows[0];

    if (
        !existing || existing.productId !== decision.productId ||
        existing.inventoryUpdatedAt.toISOString() !== decision.inventoryUpdatedAt ||
        existing.productUpdatedAt.toISOString() !== decision.productUpdatedAt
    ) {
        fail(
            "არსებული პროდუქტი შეიცვალა. ხელახლა შეამოწმე და დაადასტურე კავშირი.",
            409,
        );
    }

    let nextStock = existing.currentStock;
    let adjustment = 0;

    if (record.mode === "CURRENT_STOCK") {
        if (policy === null || data.currentStock === null) {
            fail("აირჩიე ნაშთის გამოყენების წესი.");
        }

        try {
            const change = calculateImportedStock({
                existingStock: existing.currentStock,
                importedStock: data.currentStock,
                policy,
            });

            nextStock = change.nextStock;
            adjustment = change.adjustment;
        } catch (cause) {
            fail(
                cause instanceof Error
                    ? cause.message
                    : "ნაშთის რაოდენობა არასწორია.",
            );
        }
    }

    const result = {
        inventoryItemId: existing.id,
        productId: existing.productId,
        sku: existing.sku,
        previousStock: existing.currentStock,
        nextStock,
        adjustment,
        addedCost: "0.00" as string | null,
        removedCost: "0.00" as string | null,
        changedLotIds: [] as string[],
    };

    if (adjustment === 0) return result;

    let date: string | null;

    try {
        date = validateProductStockDate(stockDate);
    } catch {
        fail("მარაგის თარიღი არასწორია.");
    }

    if (date === null) fail("მიუთითე მარაგის თარიღი.");

    const availableAt = new Date(`${date}T00:00:00+04:00`);

    const note =
        `იმპორტით ნაშთის შეჯერება ${jobId}; ` +
        `${record.fileName} / ${record.sheetName}; ` +
        `რიგი ${record.rowNumber}`;

    await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "InventoryStockLot"
        WHERE "inventoryItemId" = ${existing.id}
        ORDER BY "id"
        FOR UPDATE
    `);

    const lots = await tx.inventoryStockLot.findMany({
        where: { inventoryItemId: existing.id },
        include: {
            purchaseItem: {
                include: { purchase: true },
            },
        },
        orderBy: [
            { availableAt: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
        ],
    });

    let total = 0;
    let defective = 0;

    for (const lot of lots) {
        if (
            !Number.isSafeInteger(lot.remainingQuantity) ||
            !Number.isSafeInteger(lot.remainingDefectiveQuantity) ||
            lot.remainingQuantity < 0 ||
            lot.remainingDefectiveQuantity < 0 ||
            lot.remainingDefectiveQuantity > lot.remainingQuantity ||
            lot.writtenOffQuantity < 0 ||
            lot.remainingQuantity + lot.writtenOffQuantity > lot.quantity
        ) {
            fail(
                "არსებული მარაგის ნაშთები ერთმანეთს არ შეესაბამება.",
                409,
            );
        }

        const source = lot.purchaseItem;

        if (source && (
            source.inventoryItemId !== existing.id ||
            source.purchase.businessId !== businessId ||
            source.remainingQuantity !== lot.remainingQuantity ||
            source.remainingDefectiveQuantity !== lot.remainingDefectiveQuantity ||
            (
                lot.remainingQuantity > 0 &&
                source.purchase.receiptStatus !== "RECEIVED"
            ) ||
            (
                source.remainingCost === null
                    ? lot.remainingCost !== null
                    : lot.remainingCost === null ||
                        !source.remainingCost.eq(lot.remainingCost)
            )
        )) {
            fail(
                "პარტიისა და მარაგის ნაშთები ერთმანეთს არ ემთხვევა.",
                409,
            );
        }

        total += lot.remainingQuantity;
        defective += lot.remainingDefectiveQuantity;
    }

    if (total !== existing.currentStock) {
        fail(
            "პროდუქტის საერთო რაოდენობა პარტიების ნაშთებს არ ემთხვევა.",
            409,
        );
    }

    if (nextStock < defective) {
        fail(
            "ფაილის სრული ნაშთი უკვე აღრიცხულ წუნდებულ რაოდენობაზე ნაკლებია. ჯერ გადაამოწმე წუნდებული მარაგი - მას ავტომატურად არ შევამცირებთ.",
        );
    }

    if (adjustment > 0) {
        const unitCost = data.unitCost === null
            ? null
            : new Prisma.Decimal(data.unitCost);

        if (unitCost !== null && (
            !unitCost.isFinite() ||
            unitCost.isNegative() ||
            unitCost.gt("9999999999.99") ||
            !unitCost.mul(100).isInteger()
        )) {
            fail("დამატებითი მარაგის თვითღირებულება არასწორია.");
        }

        const remainingCost = unitCost?.mul(adjustment) ?? null;

        if (
            remainingCost !== null &&
            remainingCost.gt("9999999999999999.99")
        ) {
            fail(
                "დამატებითი მარაგის ღირებულება ბაზის თანხის ველში ვერ მოთავსდება.",
            );
        }

        const lot = await tx.inventoryStockLot.create({
            data: {
                inventoryItemId: existing.id,
                quantity: adjustment,
                remainingQuantity: adjustment,
                unitCost,
                remainingCost,
                availableAt,
            },
            select: { id: true },
        });

        result.changedLotIds.push(lot.id);
        result.addedCost = remainingCost?.toFixed(2) ?? null;

        await tx.inventoryMovement.create({
            data: {
                inventoryItemId: existing.id,
                type: "ADJUSTMENT_IN",
                condition: "GOOD",
                quantity: adjustment,
                createdAt: availableAt,
                note,
            },
        });
    } else {
        let needed = -adjustment;

        let removedCost: Prisma.Decimal | null =
            new Prisma.Decimal(0);

        const affectedPurchases = new Set<string>();

        for (const lot of lots) {
            if (needed === 0) break;

            const quantity = Math.min(
                needed,
                lot.remainingQuantity - lot.remainingDefectiveQuantity,
            );

            if (quantity === 0) continue;

            const balanceCost = lot.remainingCost ??
                lot.unitCost?.mul(lot.remainingQuantity) ?? null;

            if (balanceCost !== null && (
                !balanceCost.isFinite() ||
                balanceCost.isNegative() ||
                !balanceCost.mul(100).isInteger()
            )) {
                fail("არსებული მარაგის ღირებულება არასწორია.", 409);
            }

            const split = balanceCost === null
                ? null
                : allocateCost(
                    balanceCost,
                    [quantity, lot.remainingQuantity - quantity],
                );

            const nextCost = lot.remainingQuantity === quantity
                ? new Prisma.Decimal(0)
                : split?.[1] ?? null;

            await tx.inventoryStockLot.update({
                where: { id: lot.id },
                data: {
                    remainingQuantity: { decrement: quantity },
                    writtenOffQuantity: { increment: quantity },
                    remainingCost: nextCost,
                },
            });

            if (lot.purchaseItemId) {
                await tx.purchaseItem.update({
                    where: { id: lot.purchaseItemId },
                    data: {
                        remainingQuantity: { decrement: quantity },
                        remainingCost: nextCost,
                    },
                });

                affectedPurchases.add(
                    lot.purchaseItem!.purchaseId,
                );
            }

            await tx.inventoryMovement.create({
                data: {
                    inventoryItemId: existing.id,
                    purchaseItemId: lot.purchaseItemId,
                    type: "ADJUSTMENT_OUT",
                    condition: "GOOD",
                    quantity,
                    createdAt: availableAt,
                    note,
                },
            });

            result.changedLotIds.push(lot.id);

            removedCost = removedCost !== null && split !== null
                ? removedCost.plus(split[0])
                : null;

            needed -= quantity;
        }

        if (needed !== 0) {
            fail("ნაშთის შემცირება სრულად ვერ შეჯერდა.", 409);
        }

        if (affectedPurchases.size > 0) {
            await tx.purchase.updateMany({
                where: {
                    businessId,
                    id: { in: [...affectedPurchases] },
                },
                data: { updatedAt: new Date() },
            });
        }

        result.removedCost = removedCost?.toFixed(2) ?? null;
    }

    await tx.inventoryItem.update({
        where: { id: existing.id },
        data: { currentStock: nextStock },
    });

    return result;
}