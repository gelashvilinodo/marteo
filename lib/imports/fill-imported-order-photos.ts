import "server-only";

import type { Prisma } from "@/generated/prisma/client";

// Imported order lines are saved as MANUAL items without a photo or a stock
// link. Copy the photo of the stock item with the same product name
// (preferring the same color and size), the same way a normal order copies
// the inventory photo into OrderItem.imageUrl. Runs after both the order and
// the product import, so it works whichever section is imported first.
export async function fillImportedOrderPhotos(
    tx: Prisma.TransactionClient,
    businessId: string,
): Promise<number> {
    return tx.$executeRaw`
        UPDATE "OrderItem" target
        SET "imageUrl" = match.image_url
        FROM "OrderItem" i
        JOIN "Order" o ON o.id = i."orderId"
        CROSS JOIN LATERAL (
            SELECT ii."imageUrl" AS image_url
            FROM "InventoryItem" ii
            JOIN "Product" p ON p.id = ii."productId"
            WHERE p."businessId" = ${businessId}
                AND ii."businessId" = ${businessId}
                AND LOWER(TRIM(p.name)) = LOWER(TRIM(i.name))
                AND ii."imageUrl" IS NOT NULL
            ORDER BY
                (COALESCE(ii.color, '') = COALESCE(i.color, '')) DESC,
                (COALESCE(ii.size, '') = COALESCE(i.size, '')) DESC,
                ii."isActive" DESC,
                ii."createdAt" ASC
            LIMIT 1
        ) match
        WHERE target.id = i.id
            AND o."businessId" = ${businessId}
            AND o.imported = TRUE
            AND i.source = 'MANUAL'
            AND i."imageUrl" IS NULL
    `;
}
