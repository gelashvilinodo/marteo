import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import {
    ImportDraftFileError,
} from "@/lib/imports/validate-import-draft-file";
import {
    readImportJson,
} from "@/lib/imports/read-import-json";
import {
    executeOrderImport,
} from "@/lib/imports/execute-order-import";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: { "Cache-Control": "private, no-store" },
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

        const { draftId } = await context.params;

        if (!draftId || draftId.length > 200) {
            throw new OrderValidationError(
                "მონახაზის კოდი არასწორია.",
                422,
            );
        }

        const raw = await readImportJson(request, 4096);

        if (
            raw === null ||
            typeof raw !== "object" ||
            Array.isArray(raw)
        ) {
            throw new OrderValidationError(
                "შეკვეთების შენახვის მოთხოვნა არასწორია.",
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
                "დაადასტურე შეკვეთების შენახვა და მონახაზის ვერსია.",
                422,
            );
        }

        const expectedRevision = body.expectedRevision;
        const prisma = createPrismaClient();

        try {
            const result = await prisma.$transaction(
                tx => executeOrderImport(tx, {
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
            try {
                await prisma.$disconnect();
            } catch {
                // კავშირის დახურვის შეცდომამ წარმატებული
                // ტრანზაქციის პასუხი არ უნდა გადაფაროს.
            }
        }
    } catch (cause: unknown) {
        if (cause instanceof OrderValidationError) {
            return json({
                success: false,
                message: cause.message,
            }, cause.status);
        }

        if (cause instanceof ImportDraftFileError) {
            return json({
                success: false,
                message: cause.message,
            }, 422);
        }

        console.error(
            "Order import execution failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return json({
            success: false,
            message:
                "შეკვეთების შენახვის შედეგი ვერ დავადასტურეთ. " +
                "იგივე ღილაკით ხელახლა გადაამოწმე — დასრულებული " +
                "იმპორტი მეორედ არ შესრულდება.",
        }, 500);
    }
}