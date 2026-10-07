import "server-only";

import type { Prisma } from "@/generated/prisma/client";

// გამოიძახე იმ ტრანზაქციაში, სადაც ბიზნესის
// ჩანაწერი უკვე დაბლოკილია FOR UPDATE-ით.
export async function createInventorySkuAllocator(
    tx: Prisma.TransactionClient,
    businessId: string,
) {
    const rows = await tx.$queryRaw<
        Array<{ lastNumber: string | null }>
    >`
        SELECT
            MAX(
                SUBSTRING("sku" FROM 3)::numeric
            )::text AS "lastNumber"
        FROM "InventoryItem"
        WHERE "businessId" = ${businessId}
          AND "sku" ~ '^P-[0-9]+$'
    `;

    let lastNumber = BigInt(rows[0]?.lastNumber ?? "0");

    return function nextInventorySku() {
        lastNumber += BigInt(1);

        return `P-${lastNumber.toString().padStart(6, "0")}`;
    };
}