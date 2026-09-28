import "server-only";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";

export type PurchaseAction = "delete" | "archive" | "restore";

export class PurchaseActionError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
        this.name = "PurchaseActionError";
    }
}

export async function changePurchaseStatus(
    purchaseId: string,
    action: PurchaseAction,
) {
    if (!purchaseId || purchaseId.length > 100) {
        throw new PurchaseActionError("პარტიის კოდი არასწორია.");
    }

    if (!["delete", "archive", "restore"].includes(action)) {
        throw new PurchaseActionError("მოქმედება არასწორია.");
    }

    const user = await getCurrentUser();

    if (!user) {
        throw new PurchaseActionError(
            "მოქმედების შესასრულებლად შედი ანგარიშში.",
            401,
        );
    }

    const prisma = createPrismaClient();

    try {
        const membership = await prisma.businessMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { businessId: true },
        });

        if (!membership) {
            throw new PurchaseActionError(
                "ბიზნესზე წვდომა ვერ მოიძებნა.",
                403,
            );
        }

        const businessId = membership.businessId;

        return await prisma.$transaction(
            async (tx) => {
                // იმავე ბლოკირებას იყენებს შექმნა,
                // რედაქტირება და პარტიის მიღება.
                await tx.$queryRaw`
                    SELECT "id"
                    FROM "Business"
                    WHERE "id" = ${businessId}
                    FOR UPDATE
                `;

                const access = await tx.businessMembership.findFirst({
                    where: {
                        userId: user.id,
                        businessId,
                    },
                    select: { id: true },
                });

                if (!access) {
                    throw new PurchaseActionError(
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
                            select: {
                                remainingQuantity: true,
                                remainingDefectiveQuantity: true,
                            },
                        },
                    },
                });

                if (!purchase) {
                    throw new PurchaseActionError(
                        "პარტია ვერ მოიძებნა. განაახლე სია.",
                        404,
                    );
                }

                if (action === "delete") {
                    if (purchase.receiptStatus !== "IN_TRANSIT") {
                        throw new PurchaseActionError(
                            "ჩამოსული პარტიის წაშლა შეუძლებელია. გამოიყენე დაარქივება.",
                            409,
                        );
                    }

                    if (purchase.archivedAt !== null) {
                        throw new PurchaseActionError(
                            "არქივში არსებული პარტიის წაშლა შეუძლებელია.",
                            409,
                        );
                    }

                    const hasBalance = purchase.items.some(
                        (item) =>
                            item.remainingQuantity !== 0 ||
                            item.remainingDefectiveQuantity !== 0,
                    );

                    const movement = await tx.inventoryMovement.findFirst({
                        where: {
                            purchaseItem: {
                                purchaseId: purchase.id,
                            },
                        },
                        select: { id: true },
                    });

                    const allocation =
                        await tx.orderItemAllocation.findFirst({
                            where: {
                                purchaseItem: {
                                    purchaseId: purchase.id,
                                },
                            },
                            select: { id: true },
                        });

                    if (hasBalance || movement || allocation) {
                        throw new PurchaseActionError(
                            "პარტიაზე მარაგის მოძრაობა ან ნაშთია დაფიქსირებული და მისი წაშლა შეუძლებელია.",
                            409,
                        );
                    }

                    // PurchaseItem ჩანაწერები იშლება Cascade კავშირით.
                    await tx.purchase.delete({
                        where: { id: purchase.id },
                    });

                    return {
                        id: purchase.id,
                        number: purchase.number,
                        action,
                    };
                }

                if (purchase.receiptStatus !== "RECEIVED") {
                    throw new PurchaseActionError(
                        "არქივი მხოლოდ ჩამოსული პარტიებისთვისაა ხელმისაწვდომი.",
                        409,
                    );
                }

                const shouldBeArchived = action === "archive";
                const alreadyArchived = purchase.archivedAt !== null;

                // განმეორებული მოთხოვნა მდგომარეობას აღარ შეცვლის.
                if (shouldBeArchived !== alreadyArchived) {
                    await tx.purchase.update({
                        where: { id: purchase.id },
                        data: {
                            archivedAt: shouldBeArchived
                                ? new Date()
                                : null,
                            updatedAt: new Date(
                                Math.max(
                                    Date.now(),
                                    purchase.updatedAt.getTime() + 1,
                                ),
                            ),
                        },
                    });
                }

                return {
                    id: purchase.id,
                    number: purchase.number,
                    action,
                };
            },
            {
                maxWait: 10000,
                timeout: 60000,
            },
        );
    } finally {
        await prisma.$disconnect();
    }
}