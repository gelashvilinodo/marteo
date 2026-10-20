import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/prisma";

import {
    removeUncommittedProductImages,
} from "@/lib/purchases/product-images";

// მხოლოდ მიმდინარე მოთხოვნაში uploadProductImage-ისგან
// მიღებული მისამართი გადაეცი. არა მომხმარებლის გამოგზავნილი ტექსტი.
export async function cleanupUncommittedImportPhoto(
    businessId: string,
    storagePath: string,
): Promise<void> {
    const prisma = createPrismaClient();

    try {
        await prisma.$transaction(
            async tx => {
                // იმავე ბიზნესის მიმდინარე ტრანზაქციის
                // დასრულებას ველოდებით, სანამ შედეგს შევამოწმებთ.
                const businesses = await tx.$queryRaw<
                    Array<{ id: string }>
                >(Prisma.sql`
                    SELECT "id"
                    FROM "Business"
                    WHERE "id" = ${businessId}
                    FOR UPDATE
                `);

                if (businesses.length === 0) return;

                const suffix = `/${storagePath}`;

                const references = await tx.$queryRaw<
                    Array<{ used: boolean }>
                >(Prisma.sql`
                    SELECT (
                        EXISTS (
                            SELECT 1
                            FROM "ImportPhoto"
                            WHERE "storagePath" = ${storagePath}
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM "InventoryItem"
                            WHERE RIGHT(
                                "imageUrl",
                                LENGTH(${suffix})
                            ) = ${suffix}
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM "OrderItem"
                            WHERE RIGHT(
                                "imageUrl",
                                LENGTH(${suffix})
                            ) = ${suffix}
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM "OrderReturnItem"
                            WHERE RIGHT(
                                "imageUrl",
                                LENGTH(${suffix})
                            ) = ${suffix}
                        )
                    ) AS "used"
                `);

                if (
                    references.length !== 1 ||
                    references[0].used !== false
                ) {
                    return;
                }

                await removeUncommittedProductImages(
                    businessId,
                    [storagePath],
                );
            },
            {
                isolationLevel: "ReadCommitted",
                maxWait: 10_000,
                timeout: 30_000,
            },
        );
    } catch (cause: unknown) {
        // თუ შედეგი ვერ გადავამოწმეთ, ფოტოს არ ვშლით.
        console.error(
            "Import photo cleanup could not be confirmed",
            cause instanceof Error
                ? cause.name
                : "UnknownError",
        );
    } finally {
        try {
            await prisma.$disconnect();
        } catch {
            console.error(
                "Import photo cleanup connection close failed",
            );
        }
    }
}