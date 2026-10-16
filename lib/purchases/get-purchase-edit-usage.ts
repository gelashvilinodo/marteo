import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { PurchaseEditError } from "./lock-purchase-for-edit";

export type PurchaseUsageEntry = {
    orderItemId: string;
    stockLotId: string | null;
    orderNumber: number | null;
    orderStatus: string;
    name: string;
    color: string | null;
    size: string | null;
    condition: "GOOD" | "DEFECTIVE";
    quantity: number;
    unitCost: string;
    unitPrice: string;
    totalCost: string | null;
};

export type PurchaseItemUsage = {
    usedQuantity: number;
    usedGoodQuantity: number;
    usedDefectiveQuantity: number;
    entries: PurchaseUsageEntry[];
};

export async function getPurchaseEditUsage(
    tx: Prisma.TransactionClient,
    businessId: string,
    purchaseId: string,
): Promise<Map<string, PurchaseItemUsage>> {
    const allocations = await tx.orderItemAllocation.findMany({
        where: {
            purchaseItem: {
                purchaseId,
                purchase: { businessId },
            },
        },
        select: {
            purchaseItemId: true,
            stockLotId: true,
            stockLot: {
                select: {
                    purchaseItemId: true,
                    sourcePurchaseItemId: true,
                },
            },
            quantity: true,
            condition: true,
            unitCost: true,
            totalCost: true,
            returnedQuantity: true,
            returnedCost: true,
            transferredQuantity: true,
            transferredCost: true,
            orderItem: {
                select: {
                    id: true,
                    name: true,
                    color: true,
                    size: true,
                    unitPrice: true,
                    stockRestoredAt: true,
                    order: {
                        select: {
                            businessId: true,
                            number: true,
                            status: true,
                        },
                    },
                },
            },
        },
        orderBy: { id: "asc" },
    });

    const usage = new Map<string, PurchaseItemUsage>();

    const historicalLots = await tx.inventoryStockLot.groupBy({
        by: ["sourcePurchaseItemId"],
        where: {
            sourcePurchaseItem: {
                purchaseId,
                purchase: { businessId },
            },
        },
        _sum: {
            quantity: true,
            defectiveQuantity: true,
        },
    });

    for (const historical of historicalLots) {
        const purchaseItemId = historical.sourcePurchaseItemId;

        if (!purchaseItemId) {
            throw new PurchaseEditError(
                "მარაგის ისტორიული კავშირი არასწორია.",
                409,
            );
        }

        const quantity = historical._sum.quantity ?? 0;
        const defectiveQuantity =
            historical._sum.defectiveQuantity ?? 0;

        if (
            quantity < 0 ||
            defectiveQuantity < 0 ||
            defectiveQuantity > quantity
        ) {
            throw new PurchaseEditError(
                "მარაგის ისტორიული რაოდენობები არასწორია.",
                409,
            );
        }

        usage.set(purchaseItemId, {
            usedQuantity: quantity,
            usedGoodQuantity: quantity - defectiveQuantity,
            usedDefectiveQuantity: defectiveQuantity,
            entries: [],
        });
    }

    for (const allocation of allocations) {
        const item = allocation.orderItem;

        if (item.order.businessId !== businessId) {
            throw new PurchaseEditError(
                "შეკვეთისა და შესყიდვის კავშირი არასწორია.",
                409,
            );
        }

        if (!allocation.purchaseItemId) {
            throw new PurchaseEditError(
                "შესყიდვის განაწილების მონაცემები არასწორია.",
                409,
            );
        }

        const quantity =
            allocation.quantity -
            allocation.returnedQuantity -
            allocation.transferredQuantity;

        if (quantity < 0) {
            throw new PurchaseEditError(
                "გამოყენებული რაოდენობის განაწილება არასწორია.",
                409,
            );
        }

        // სრულად აღდგენილი, დაბრუნებული ან შემდეგ
        // გადაცვლის ციკლზე გადატანილი ნაწილი აღარ ითვლება.
        if (item.stockRestoredAt || quantity === 0) continue;

        const totalCost =
            allocation.totalCost !== null &&
                allocation.transferredCost !== null
                ? allocation.totalCost
                    .minus(allocation.returnedCost)
                    .minus(allocation.transferredCost)
                : null;

        if (totalCost !== null && totalCost.isNegative()) {
            throw new PurchaseEditError(
                "გამოყენებული პროდუქტის თვითღირებულება არასწორია.",
                409,
            );
        }

        let current = usage.get(allocation.purchaseItemId);

        if (!current) {
            current = {
                usedQuantity: 0,
                usedGoodQuantity: 0,
                usedDefectiveQuantity: 0,
                entries: [],
            };

            usage.set(allocation.purchaseItemId, current);
        }

        const lot = allocation.stockLot;

        if (!lot) {
            throw new PurchaseEditError(
                "მარაგის მონაცემების ახალ ფორმატში გადატანა დასრულებული არ არის.",
                409,
            );
        }

        if (lot.purchaseItemId === allocation.purchaseItemId) {
            // მიმდინარე ნაშთიდან გამოყენებული ნაწილი.
            current.usedQuantity += quantity;

            if (allocation.condition === "DEFECTIVE") {
                current.usedDefectiveQuantity += quantity;
            } else {
                current.usedGoodQuantity += quantity;
            }
        } else if (
            lot.purchaseItemId !== null ||
            lot.sourcePurchaseItemId !== allocation.purchaseItemId
        ) {
            throw new PurchaseEditError(
                "პროდუქტის ისტორიული განაწილების კავშირი არასწორია.",
                409,
            );
        }

        // ისტორიული ნაწილი ზემოთ უკვე დათვლილია.
        // მის შეკვეთებს entries-ში მაინც ვინარჩუნებთ.

        current.entries.push({
            orderItemId: item.id,
            stockLotId: allocation.stockLotId,
            orderNumber: item.order.number,
            orderStatus: item.order.status,
            name: item.name,
            color: item.color,
            size: item.size,
            condition: allocation.condition,
            quantity,
            unitCost: allocation.unitCost.toFixed(2),
            unitPrice: item.unitPrice.toFixed(2),
            totalCost: totalCost?.toFixed(2) ?? null,
        });
    }

    return usage;
}