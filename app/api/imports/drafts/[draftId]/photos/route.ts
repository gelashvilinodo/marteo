import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";

import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";

import {
    ProductImageError,
} from "@/lib/purchases/product-images";

import {
    ImportDraftFileError,
} from "@/lib/imports/validate-import-draft-file";

import {
    readImportPhotoRequest,
} from "@/lib/imports/read-import-photo-request";

import {
    saveImportPhoto,
} from "@/lib/imports/save-import-photo";

import {
    cleanupUncommittedImportPhoto,
} from "@/lib/imports/cleanup-uncommitted-import-photo";

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

        const { draftId } = await context.params;

        if (!draftId || draftId.length > 200) {
            throw new OrderValidationError(
                "მონახაზის კოდი არასწორია.",
                422,
            );
        }

        const businessId = membership.businessId;
        const prisma = createPrismaClient();
        const uploadedPaths: string[] = [];

        try {
            const access = await prisma.businessMembership.findUnique({
                where: {
                    userId_businessId: {
                        userId: user.id,
                        businessId,
                    },
                },
                select: { role: true },
            });

            if (
                !access ||
                !["OWNER", "ADMIN"].includes(access.role)
            ) {
                throw new OrderValidationError(
                    "იმპორტის ფოტოების შენახვა ხელმისაწვდომია ბიზნესის მფლობელისა და ადმინისტრატორისთვის.",
                    403,
                );
            }

            const upload = await readImportPhotoRequest(request);

            const result = await prisma.$transaction(
                tx => saveImportPhoto(tx, {
                    userId: user.id,
                    businessId,
                    draftId,
                    upload,
                    onUploaded: storagePath => {
                        uploadedPaths.push(storagePath);
                    },
                }),
                {
                    isolationLevel: "ReadCommitted",
                    maxWait: 10_000,
                    timeout: 60_000,
                },
            );

            return json({
                success: true,
                draftId,
                ...result,
            });
        } catch (cause: unknown) {
            // ტრანზაქცია უკვე დასრულებულია ან შეწყვეტილია.
            // გასუფთავება ჯერ ბაზაში შენახულ კავშირებს გადაამოწმებს.
            for (const storagePath of uploadedPaths) {
                await cleanupUncommittedImportPhoto(
                    businessId,
                    storagePath,
                );
            }

            throw cause;
        } finally {
            try {
                await prisma.$disconnect();
            } catch {
                // წარმატებული შენახვის პასუხი მხოლოდ კავშირის
                // დახურვის შეცდომის გამო არ უნდა შეიცვალოს.
                console.error(
                    "Import photo connection close failed",
                );
            }
        }
    } catch (cause: unknown) {
        if (cause instanceof OrderValidationError) {
            return json({
                success: false,
                outcome: "NOT_SAVED",
                message: cause.message,
            }, cause.status);
        }

        if (cause instanceof ImportDraftFileError) {
            return json({
                success: false,
                outcome: "NOT_SAVED",
                message: cause.message,
            }, 422);
        }

        if (cause instanceof ProductImageError) {
            return json({
                success: false,
                outcome: "NOT_SAVED",
                message: cause.message,
            }, 503);
        }

        console.error(
            "Import photo save failed",
            cause instanceof Error
                ? cause.name
                : "UnknownError",
        );

        return json({
            success: false,
            message:
                "ფოტოს შენახვის შედეგი ვერ დავადასტურეთ. იგივე ფოტოთი ხელახლა ცდა შესაძლებელია — უკვე შენახული ფოტო მეორედ არ აიტვირთება.",
        }, 500);
    }
}