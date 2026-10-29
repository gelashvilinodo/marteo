import { getCurrentUser } from "@/lib/auth/session";
import {
    getCurrentBusiness,
} from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import {
    readImportJson,
} from "@/lib/imports/read-import-json";
import {
    validateImportDraftFile,
} from "@/lib/imports/validate-import-draft-file";
import {
    validateImportDraftSettings,
} from "@/lib/imports/validate-import-draft-settings";
import {
    checkDraftProducts,
} from "@/lib/imports/check-draft-products";
import {
    buildProductPhotoPlan,
} from "@/lib/imports/build-product-photo-plan";
import {
    readImportCompletedSections,
} from "@/lib/imports/read-import-completed-sections";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
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

        const raw = await readImportJson(request, 4096);

        if (
            typeof raw !== "object" ||
            raw === null ||
            Array.isArray(raw)
        ) {
            fail("შემოწმების მოთხოვნა არასწორია.");
        }

        const body = raw as Record<string, unknown>;
        const expectedRevision = body.expectedRevision;

        if (
            typeof expectedRevision !== "number" ||
            !Number.isSafeInteger(expectedRevision) ||
            expectedRevision < 1
        ) {
            fail("მონახაზის ვერსია მითითებული არ არის.");
        }

        const { draftId } = await context.params;
        const prisma = createPrismaClient();

        try {
            const access =
                await prisma.businessMembership.findUnique({
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
                    "იმპორტის შემოწმება ხელმისაწვდომია მფლობელისა და ადმინისტრატორისთვის.",
                    403,
                );
            }

            const response = await prisma.$transaction(
                async tx => {
                    const saved = await tx.importJob.findFirst({
                        where: {
                            id: draftId,
                            businessId: membership.businessId,
                            status: {
                                in: ["DRAFT", "REVIEW", "PARTIAL"],
                            },
                            schemaVersion: 1,
                            OR: [
                                { expiresAt: null },
                                {
                                    expiresAt: {
                                        gt: new Date(),
                                    },
                                },
                            ],
                        },
                        select: {
                            id: true,
                            revision: true,
                            settings: true,
                            resultSummary: true,
                            files: {
                                select: {
                                    sha256: true,
                                    originalName: true,
                                    format: true,
                                    byteSize: true,
                                    structure: true,
                                    photos: true,
                                },
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
                            "მონახაზის შენახული ვერსია შეიცვალა. ხელახლა გახსენი და შემოწმება თავიდან გაუშვი.",
                            409,
                        );
                    }

                    const completedSections =
                        readImportCompletedSections(
                            saved.resultSummary,
                            {
                                draftId,
                                businessId: membership.businessId,
                                revision: saved.revision,
                            },
                        );

                    if (completedSections.products) {
                        fail(
                            "ამ მონახაზიდან პროდუქტები უკვე გადმოტანილია.",
                            409,
                        );
                    }

                    if (saved.settings === null) {
                        fail(
                            "ჯერ შეინახე მონახაზის არჩევანი და შესწორებები.",
                        );
                    }

                    const settings = validateImportDraftSettings(
                        saved.settings,
                        membership.businessId,
                    );

                    const identities = new Set<string>();

                    const files = saved.files.map(item => {
                        const structure = item.structure;

                        if (
                            typeof structure !== "object" ||
                            structure === null ||
                            Array.isArray(structure) ||
                            typeof structure.clientFileId !== "string" ||
                            identities.has(structure.clientFileId)
                        ) {
                            throw new Error(
                                "Invalid saved file identity",
                            );
                        }

                        identities.add(structure.clientFileId);

                        const file = validateImportDraftFile(
                            structure.parsedFile,
                        );

                        if (
                            file.sha256 !== item.sha256 ||
                            file.originalName !== item.originalName ||
                            file.format !== item.format ||
                            file.byteSize !== item.byteSize
                        ) {
                            throw new Error(
                                "Saved file metadata mismatch",
                            );
                        }

                        return {
                            clientFileId: structure.clientFileId,
                            file,
                            photos: item.photos,
                            photoManifest: structure.photoManifest,
                        };
                    });

                    const checked = await checkDraftProducts({
                        prisma: tx,
                        businessId: membership.businessId,
                        files,
                        settings,
                    });

                    const photoPlan = buildProductPhotoPlan({
                        businessId: membership.businessId,
                        files,
                        items: checked.plan.items,
                        decisions: settings.productPhotoDecisions ?? [],
                    });

                    const pendingImageCount =
                        photoPlan.problems.length;

                    const finalImportAvailable =
                        (
                            checked.plan.items.length > 0 ||
                            checked.prepared.excludedRecords.length > 0
                        ) &&
                        checked.prepared.mappingProblems.length === 0 &&
                        checked.plan.items.every(
                            item => item.action !== "BLOCKED",
                        ) &&
                        pendingImageCount === 0;

                    return {
                        success: true,
                        draftId: saved.id,
                        revision: saved.revision,
                        checkedAt: checked.snapshot.checkedAt,
                        finalImportAvailable,
                        summary: {
                            pendingImageCount,
                            total: checked.plan.items.length,
                            createCount: checked.plan.createCount,
                            linkCount: checked.plan.linkCount,
                            problemCount:
                                checked.plan.problems.length +
                                photoPlan.problems.length,
                            mappingProblemCount:
                                checked.prepared.mappingProblems.length,
                            excludedCount:
                                checked.prepared.excludedRecords.length,
                            omittedDuplicateCount:
                                checked.prepared.omittedDuplicates.length,
                            unknownCostCount:
                                checked.plan.unknownCostCount,
                        },
                        mappingProblems:
                            checked.prepared.mappingProblems,
                        problems: [
                            ...checked.plan.problems.map(item => ({
                                key: item.record.key,
                                fileName: item.record.fileName,
                                sheetName: item.record.sheetName,
                                rowNumber: item.record.rowNumber,
                                name: item.record.data?.name ?? null,
                                code: item.reasonCode,
                                message: item.reason,
                            })),
                            ...photoPlan.problems.map(problem => ({
                                key: problem.recordKey,
                                fileName: problem.fileName,
                                sheetName: problem.sheetName,
                                rowNumber: problem.rowNumber,
                                name: null,
                                code: "PHOTO_REVIEW",
                                message: problem.message,
                            })),
                        ],
                    };
                },
                {
                    isolationLevel: "RepeatableRead",
                    timeout: 30_000,
                },
            );

            return json(response);
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
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
            "Import draft product check failed",
            cause instanceof Error
                ? cause.name
                : "UnknownError",
        );

        return json(
            {
                success: false,
                message:
                    "შენახული მონახაზის შემოწმება ვერ დასრულდა. ეს ფაილში ინფორმაციის ნაკლებობას არ ნიშნავს. მონაცემები არ შეცვლილა - სცადე ხელახლა.",
            },
            500,
        );
    }
}