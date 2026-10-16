import { NextResponse } from "next/server";

import {
    changePurchaseStatus,
    PurchaseActionError,
} from "@/lib/purchases/change-purchase-status";

import type { PurchaseDeleteExpectation } from "@/lib/purchases/get-purchase-delete-impact";
import { PurchaseEditError } from "@/lib/purchases/lock-purchase-for-edit";
import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { getPurchaseDeleteImpact } from "@/lib/purchases/get-purchase-delete-impact";

function errorResponse(message: string, status: number) {
    return NextResponse.json(
        {
            success: false,
            error: message,
        },
        {
            status,
            headers: { "Cache-Control": "no-store" },
        },
    );
}

export async function POST(
    request: Request,
    context: {
        params: Promise<{
            purchaseId: string;
            action: string;
        }>;
    },
) {
    try {
        if (
            request.headers.get("origin") !==
            new URL(request.url).origin
        ) {
            return errorResponse(
                "მოთხოვნის წყარო დაუშვებელია.",
                403,
            );
        }

        const { purchaseId, action } = await context.params;

        if (
            action !== "delete" &&
            action !== "archive" &&
            action !== "restore"
        ) {
            return errorResponse(
                "მოქმედება ვერ მოიძებნა.",
                404,
            );
        }

        // მომხმარებლის ავტორიზაცია და ბიზნესზე წვდომა
        // მოწმდება სერვერული ფუნქციის შიგნით.
        let expectedDelete: PurchaseDeleteExpectation | undefined;

        if (action === "delete") {
            const raw: unknown = await request.json().catch(() => null);

            if (
                typeof raw !== "object" ||
                raw === null ||
                Array.isArray(raw)
            ) {
                return errorResponse(
                    "წაშლის დასტურის მონაცემები არასწორია.",
                    400,
                );
            }

            const body = raw as Record<string, unknown>;

            if (
                typeof body.updatedAt !== "string" ||
                !Number.isFinite(Date.parse(body.updatedAt)) ||
                typeof body.remainingQuantity !== "number" ||
                !Number.isSafeInteger(body.remainingQuantity) ||
                body.remainingQuantity < 0 ||
                typeof body.usedQuantity !== "number" ||
                !Number.isSafeInteger(body.usedQuantity) ||
                body.usedQuantity < 0
            ) {
                return errorResponse(
                    "ხელახლა გახსენი წაშლის დადასტურების ფანჯარა.",
                    400,
                );
            }

            expectedDelete = {
                updatedAt: body.updatedAt,
                remainingQuantity: body.remainingQuantity,
                usedQuantity: body.usedQuantity,
            };
        }

        const result = await changePurchaseStatus(
            purchaseId,
            action,
            expectedDelete,
        );

        return NextResponse.json(
            {
                success: true,
                purchase: result,
            },
            {
                headers: { "Cache-Control": "no-store" },
            },
        );
    } catch (error) {
        if (
            error instanceof PurchaseActionError ||
            error instanceof PurchaseEditError
        ) {
            return errorResponse(
                error.message,
                error.status,
            );
        }

        console.error("Purchase action failed", error);

        return errorResponse(
            "მოქმედების შედეგი ვერ დადასტურდა. განაახლე სია და გადაამოწმე პარტიის მდგომარეობა.",
            500,
        );
    }
}

export async function GET(
    _request: Request,
    context: {
        params: Promise<{
            purchaseId: string;
            action: string;
        }>;
    },
) {
    let prisma: ReturnType<typeof createPrismaClient> | undefined;

    try {
        const { purchaseId, action } = await context.params;

        if (
            action !== "delete" ||
            !purchaseId ||
            purchaseId.length > 100
        ) {
            return errorResponse("მოქმედება ვერ მოიძებნა.", 404);
        }

        const user = await getCurrentUser();

        if (!user) {
            return errorResponse("გაიარე ავტორიზაცია.", 401);
        }

        prisma = createPrismaClient();

        const membership = await prisma.businessMembership.findFirst({
            where: { userId: user.id },
            orderBy: { createdAt: "asc" },
            select: { businessId: true },
        });

        if (!membership) {
            return errorResponse("ბიზნესზე წვდომა ვერ მოიძებნა.", 403);
        }

        const impact = await prisma.$transaction(
            async tx => {
                await tx.$queryRaw`
                    SELECT "id"
                    FROM "Business"
                    WHERE "id" = ${membership.businessId}
                    FOR SHARE
                `;

                return getPurchaseDeleteImpact(
                    tx,
                    membership.businessId,
                    purchaseId,
                );
            },
            {
                maxWait: 10000,
                timeout: 15000,
            },
        );

        return NextResponse.json(
            { success: true, impact },
            {
                headers: {
                    "Cache-Control": "private, no-store",
                },
            },
        );
    } catch (error) {
        if (error instanceof PurchaseEditError) {
            return errorResponse(error.message, error.status);
        }

        console.error("Purchase deletion preview failed", error);

        return errorResponse(
            "წაშლის მონაცემები ვერ ჩაიტვირთა. სცადე ხელახლა.",
            500,
        );
    } finally {
        if (prisma) await prisma.$disconnect();
    }
}