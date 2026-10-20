import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { OrderValidationError } from "@/lib/orders/order-validation-error";
import { readImportJson } from "@/lib/imports/read-import-json";
import { executeProductImport } from "@/lib/imports/execute-product-import";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

export async function POST(
    request: Request,
    context: { params: Promise<{ draftId: string }> },
) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            throw new OrderValidationError(
                "გაიარე ავტორიზაცია.",
                401,
            );
        }

        const membership = await getCurrentBusiness();

        if (!membership) {
            throw new OrderValidationError(
                "ბიზნესი ვერ მოიძებნა.",
                403,
            );
        }

        const raw = await readImportJson(request, 4096);

        if (
            typeof raw !== "object" ||
            raw === null ||
            Array.isArray(raw)
        ) {
            throw new OrderValidationError(
                "შენახვის მოთხოვნა არასწორია.",
                422,
            );
        }

        const body = raw as Record<string, unknown>;

        if (
            body.confirmed !== true ||
            typeof body.expectedRevision !== "number" ||
            !Number.isSafeInteger(body.expectedRevision) ||
            body.expectedRevision < 1
        ) {
            throw new OrderValidationError(
                "დაადასტურე პროდუქტების შენახვა და მონახაზის ვერსია.",
                422,
            );
        }

        const { draftId } = await context.params;
        const expectedRevision = body.expectedRevision;
        const prisma = createPrismaClient();

        try {
            const result = await prisma.$transaction(
                tx => executeProductImport(tx, {
                    userId: user.id,
                    businessId: membership.businessId,
                    draftId,
                    expectedRevision,
                }),
                {
                    isolationLevel: "ReadCommitted",
                    maxWait: 10_000,
                    timeout: 60_000,
                },
            );

            return json({
                success: true,
                ...result,
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause) {
        if (cause instanceof OrderValidationError) {
            return json(
                {
                    success: false,
                    message: cause.message,
                },
                cause.status,
            );
        }

        console.error(
            "Product import execution failed",
            cause instanceof Error
                ? cause.name
                : "UnknownError",
        );

        return json(
            {
                success: false,
                message:
                    "შენახვის შედეგი ვერ დავადასტურეთ. იგივე ღილაკით ხელახლა გადაამოწმე — დასრულებული იმპორტი მეორედ არ შესრულდება.",
            },
            500,
        );
    }
}