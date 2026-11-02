import "server-only";

import type { createPrismaClient } from "@/lib/prisma";
import type { PurchasePlanEntry } from "./purchase-plan-client";

type Client = ReturnType<typeof createPrismaClient>;

export class PurchasePlanError extends Error {
    constructor(message: string, readonly status = 400) {
        super(message);
    }
}

export const MAX_PLAN_QUANTITY = 100_000;

export function readPlanQuantity(value: unknown) {
    const quantity = Number(value);

    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_PLAN_QUANTITY) {
        throw new PurchasePlanError("რაოდენობა უნდა იყოს 1-დან 100 000-მდე მთელი რიცხვი.");
    }

    return quantity;
}

// ბოლო შესყიდვის ფასი სავარაუდო ღირებულებისთვის; ზუსტი ფასი შესყიდვისას ივსება.
export async function getPurchasePlan(prisma: Client, businessId: string): Promise<PurchasePlanEntry[]> {
    return prisma.$queryRaw<PurchasePlanEntry[]>`
        SELECT plan.id, plan."inventoryItemId", plan.quantity, plan.reason, plan.source::text AS source,
            to_char(plan."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            p.name, i.color, i.size, i.sku, i."imageUrl",
            COALESCE((
                SELECT SUM(lot."remainingQuantity" - lot."remainingDefectiveQuantity")
                FROM "InventoryStockLot" lot
                LEFT JOIN "PurchaseItem" source ON source.id = lot."purchaseItemId"
                LEFT JOIN "Purchase" pu ON pu.id = source."purchaseId"
                WHERE lot."inventoryItemId" = i.id
                    AND (lot."purchaseItemId" IS NULL OR pu."receiptStatus" = 'RECEIVED')
            ), 0)::int AS "goodStock",
            (
                SELECT pi."unitPurchasePrice"::text
                FROM "PurchaseItem" pi
                JOIN "Purchase" pu ON pu.id = pi."purchaseId"
                WHERE pi."inventoryItemId" = i.id AND pu."businessId" = ${businessId}
                ORDER BY pu."purchaseDate" DESC, pi."createdAt" DESC
                LIMIT 1
            ) AS "lastUnitPrice"
        FROM "PurchasePlanItem" plan
        JOIN "InventoryItem" i ON i.id = plan."inventoryItemId"
        JOIN "Product" p ON p.id = i."productId"
        WHERE plan."businessId" = ${businessId} AND i."businessId" = ${businessId} AND i."isActive" = TRUE
        ORDER BY plan."createdAt" DESC, plan.id DESC
    `;
}

export async function countPurchasePlan(prisma: Client, businessId: string) {
    return prisma.purchasePlanItem.count({
        where: { businessId, inventoryItem: { businessId, isActive: true } },
    });
}

// იგივე პროდუქტის ხელახლა დამატება რაოდენობას და მიზეზს ანახლებს.
export async function addToPurchasePlan(
    prisma: Client,
    businessId: string,
    input: { inventoryItemId: string; quantity: number; reason: string | null; source: "AI" | "MANUAL" },
) {
    const item = await prisma.inventoryItem.findFirst({
        where: { id: input.inventoryItemId, businessId, isActive: true },
        select: { id: true },
    });

    if (!item) throw new PurchasePlanError("პროდუქტი ვერ მოიძებნა.", 404);

    return prisma.purchasePlanItem.upsert({
        where: { businessId_inventoryItemId: { businessId, inventoryItemId: item.id } },
        create: { businessId, inventoryItemId: item.id, quantity: input.quantity, reason: input.reason, source: input.source },
        update: { quantity: input.quantity, reason: input.reason ?? undefined, source: input.source },
        select: { id: true },
    });
}

export async function updatePurchasePlanItem(prisma: Client, businessId: string, id: string, quantity: number) {
    const result = await prisma.purchasePlanItem.updateMany({ where: { id, businessId }, data: { quantity } });
    if (result.count === 0) throw new PurchasePlanError("ჩანაწერი ვერ მოიძებნა.", 404);
}

export async function removePurchasePlanItems(prisma: Client, businessId: string, ids: string[]) {
    if (ids.length === 0) return 0;

    const result = await prisma.purchasePlanItem.deleteMany({ where: { businessId, id: { in: ids } } });
    return result.count;
}
