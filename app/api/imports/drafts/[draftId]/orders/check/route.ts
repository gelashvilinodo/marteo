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
    readOrderDraftFiles,
} from "@/lib/imports/read-order-draft-files";
import {
    validateImportDraftSettings,
} from "@/lib/imports/validate-import-draft-settings";
import {
    readImportCompletedSections,
} from "@/lib/imports/read-import-completed-sections";
import {
    checkDraftOrders,
} from "@/lib/imports/check-draft-orders";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: { "Cache-Control": "private, no-store" },
    });
}

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

export async function POST(
    request: Request,
    context: { params: Promise<{ draftId: string }> },
) {
    try {
        const user = await getCurrentUser();
        if (!user) fail("გაიარე ავტორიზაცია.", 401);

        const membership = await getCurrentBusiness();

        if (!membership) {
            fail("ბიზნესი ვერ მოიძებნა.", 403);
        }

        const { draftId } = await context.params;

        if (!draftId || draftId.length > 200) {
            fail("მონახაზის კოდი არასწორია.");
        }

        const raw = await readImportJson(request, 4096);

        if (
            raw === null ||
            typeof raw !== "object" ||
            Array.isArray(raw)
        ) {
            fail("შემოწმების მოთხოვნა არასწორია.");
        }

        const body = raw as Record<string, unknown>;

        if (
            typeof body.expectedRevision !== "number" ||
            !Number.isSafeInteger(body.expectedRevision) ||
            body.expectedRevision < 1
        ) {
            fail("მონახაზის ვერსია არასწორია.");
        }

        const expectedRevision = body.expectedRevision;
        const prisma = createPrismaClient();

        try {
            const result = await prisma.$transaction(
                async tx => {
                    const access = await tx.businessMembership.findUnique({
                        where: {
                            userId_businessId: {
                                userId: user.id,
                                businessId: membership.businessId,
                            },
                        },
                        select: { role: true },
                    });

                    if (
                        !access ||
                        !["OWNER", "ADMIN"].includes(access.role)
                    ) {
                        fail(
                            "შეკვეთების იმპორტი ხელმისაწვდომია მფლობელისა და ადმინისტრატორისთვის.",
                            403,
                        );
                    }

                    const saved = await tx.importJob.findFirst({
                        where: {
                            id: draftId,
                            businessId: membership.businessId,
                            schemaVersion: 1,
                            status: {
                                in: ["DRAFT", "REVIEW", "PARTIAL"],
                            },
                            OR: [
                                { expiresAt: null },
                                { expiresAt: { gt: new Date() } },
                            ],
                        },
                        include: {
                            files: {
                                orderBy: [
                                    { createdAt: "asc" },
                                    { id: "asc" },
                                ],
                            },
                        },
                    });

                    if (!saved) {
                        fail(
                            "აქტიური მონახაზი ამ ბიზნესში ვერ მოიძებნა.",
                            404,
                        );
                    }

                    if (saved.revision !== expectedRevision) {
                        fail(
                            "მონახაზი შეიცვალა. ხელახლა გახსენი და შემოწმება თავიდან გაუშვი.",
                            409,
                        );
                    }

                    const completed = readImportCompletedSections(
                        saved.resultSummary,
                        {
                            draftId,
                            businessId: membership.businessId,
                            revision: saved.revision,
                        },
                    );

                    if (completed.orders) {
                        fail(
                            "ამ მონახაზიდან შეკვეთები უკვე გადმოტანილია.",
                            409,
                        );
                    }

                    if (saved.settings === null) {
                        fail(
                            "ჯერ შეინახე მონახაზის არჩევანები და შესწორებები.",
                        );
                    }

                    const settings = validateImportDraftSettings(
                        saved.settings,
                        membership.businessId,
                    );

                    const checked = await checkDraftOrders({
                        prisma: tx,
                        businessId: membership.businessId,
                        jobId: draftId,
                        files: readOrderDraftFiles(saved.files),
                        settings,
                    });

                    return {
                        success: true,
                        draftId,
                        revision: saved.revision,
                        finalImportAvailable: checked.canImport,
                        summary: {
                            createCount: checked.createCount,
                            customerCreateCount:
                                checked.customerPlan.createCount,
                            customerLinkCount:
                                checked.customerPlan.linkCount,
                            customerSkipCount:
                                checked.customerPlan.skipCount,
                            customerProblemCount:
                                checked.customerPlan.blockedCount,
                            pendingCostCount:
                                checked.prepared.summary.unknownCostOrderCount,
                            skippedCount:
                                checked.prepared.summary.skippedCount,
                            excludedCount:
                                checked.prepared.excludedRows.length,
                            confirmationRequiredCount:
                                checked.prepared.summary.confirmationRequiredCount,
                        },
                        problems: checked.problems,
                        customers: {
                            candidates: checked.customerCheck.candidates,
                            plan: checked.customerPlan.items,
                        },
                    };
                },
                {
                    isolationLevel: "RepeatableRead",
                    maxWait: 10_000,
                    timeout: 30_000,
                },
            );

            return json(result);
        } finally {
            try {
                await prisma.$disconnect();
            } catch {
                // წარმატებული შემოწმების პასუხი არ გადაიფაროს.
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
            "Order import check failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return json({
            success: false,
            message:
                "შეკვეთების სერვერული შემოწმება ვერ დასრულდა. სცადე ხელახლა.",
        }, 500);
    }
}