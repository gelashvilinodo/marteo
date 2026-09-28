import "server-only";

import { Prisma } from "@/generated/prisma/client";

export class PurchaseEditError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
        this.name = "PurchaseEditError";
    }
}

import { assertPurchaseEditable } from "./assert-purchase-editable";

type EditLockInput = {
    userId: string;
    businessId: string;
    purchaseId: string;
    expectedUpdatedAt: string;
    purchaseItemIds: Array<string | null>;
};

export async function lockPurchaseForEdit(
    tx: Prisma.TransactionClient,
    input: EditLockInput,
) {
    const {
        userId,
        businessId,
        purchaseId,
        expectedUpdatedAt,
        purchaseItemIds,
    } = input;

    const expectedDate = new Date(expectedUpdatedAt);

    if (
        !expectedUpdatedAt ||
        !Number.isFinite(expectedDate.getTime())
    ) {
        throw new PurchaseEditError(
            "პარტიის ვერსია არასწორია. გახსენი რედაქტირება თავიდან.",
        );
    }

    // იგივე ბლოკირებას იყენებს პარტიის შექმნა და მიღებაც.
    await tx.$queryRaw`
        SELECT "id"
        FROM "Business"
        WHERE "id" = ${businessId}
        FOR UPDATE
    `;

    const membership = await tx.businessMembership.findFirst({
        where: {
            userId,
            businessId,
        },
        select: { id: true },
    });

    if (!membership) {
        throw new PurchaseEditError(
            "ამ ბიზნესზე წვდომა აღარ გაქვს.",
            403,
        );
    }

    const purchase = await tx.purchase.findFirst({
        where: {
            id: purchaseId,
            businessId,
        },
        include: {
            items: {
                include: {
                    inventoryItem: {
                        include: {
                            product: true,
                        },
                    },
                },
            },
        },
    });

    if (!purchase) {
        throw new PurchaseEditError(
            "პარტია ვერ მოიძებნა.",
            404,
        );
    }



    if (
        purchase.updatedAt.getTime() !== expectedDate.getTime()
    ) {
        throw new PurchaseEditError(
            "პარტია სხვა ფანჯრიდან შეიცვალა. გახსენი რედაქტირება თავიდან.",
            409,
        );
    }

    if (
        purchase.items.some(
            (item) =>
                item.inventoryItem.businessId !== businessId ||
                item.inventoryItem.product.businessId !== businessId,
        )
    ) {
        throw new PurchaseEditError(
            "პარტიის პროდუქტების კავშირები არასწორია.",
            409,
        );
    }

    await assertPurchaseEditable(tx, purchase);

    const existingIds = new Set(
        purchase.items.map((item) => item.id),
    );

    const submittedIds = new Set<string>();

    for (const id of purchaseItemIds) {
        // null ნიშნავს ახლად დამატებულ სტრიქონს.
        if (id === null) continue;

        if (!existingIds.has(id)) {
            throw new PurchaseEditError(
                "პროდუქტის ჩანაწერი ამ პარტიას არ ეკუთვნის.",
            );
        }

        if (submittedIds.has(id)) {
            throw new PurchaseEditError(
                "პარტიის პროდუქტის ჩანაწერი მეორდება.",
            );
        }

        submittedIds.add(id);
    }

    return purchase;
}