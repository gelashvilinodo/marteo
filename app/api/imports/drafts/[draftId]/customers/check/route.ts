import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";

import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";

import {
    ImportDraftFileError,
    validateImportDraftFile,
} from "@/lib/imports/validate-import-draft-file";

import {
    validateImportDraftSettings,
} from "@/lib/imports/validate-import-draft-settings";

import {
    readImportJson,
} from "@/lib/imports/read-import-json";

import {
    checkDraftCustomers,
} from "@/lib/imports/check-draft-customers";

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

        if (!membership) fail("ბიზნესი ვერ მოიძებნა.", 403);

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
            fail("მონახაზის მოსალოდნელი ვერსია არასწორია.");
        }

        const expectedRevision = body.expectedRevision;
        const businessId = membership.businessId;
        const prisma = createPrismaClient();

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
                fail(
                    "იმპორტის შემოწმება ხელმისაწვდომია ბიზნესის მფლობელისა და ადმინისტრატორისთვის.",
                    403,
                );
            }

            const response = await prisma.$transaction(
                async tx => {
                    const saved = await tx.importJob.findFirst({
                        where: {
                            id: draftId,
                            businessId,
                            schemaVersion: 1,
                            status: {
                                in: ["DRAFT", "REVIEW", "PARTIAL"],
                            },
                            OR: [
                                { expiresAt: null },
                                { expiresAt: { gt: new Date() } },
                            ],
                        },
                        select: {
                            id: true,
                            revision: true,
                            settings: true,
                            resultSummary: true,
                            files: {
                                orderBy: [
                                    { createdAt: "asc" },
                                    { id: "asc" },
                                ],
                                select: {
                                    sha256: true,
                                    originalName: true,
                                    format: true,
                                    byteSize: true,
                                    structure: true,
                                },
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
                            "მონახაზის ვერსია შეიცვალა. ხელახლა გახსენი მონახაზი და შემოწმება თავიდან გაუშვი.",
                            409,
                        );
                    }

                    const previous = saved.resultSummary;

                    if (
                        previous !== null &&
                        typeof previous === "object" &&
                        !Array.isArray(previous) &&
                        previous.customers !== undefined
                    ) {
                        fail(
                            "ამ მონახაზიდან მომხმარებლები უკვე გადმოტანილია. განმეორებით აღარ შევქმნით.",
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
                        businessId,
                    );

                    const identities = new Set<string>();

                    const files = saved.files.map(item => {
                        const structure = item.structure;

                        if (
                            structure === null ||
                            typeof structure !== "object" ||
                            Array.isArray(structure) ||
                            typeof structure.clientFileId !== "string" ||
                            identities.has(structure.clientFileId)
                        ) {
                            throw new Error(
                                "Invalid saved customer file identity",
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
                                "Saved customer file metadata mismatch",
                            );
                        }

                        return {
                            clientFileId: structure.clientFileId,
                            file,
                        };
                    });

                    const checked = await checkDraftCustomers({
                        prisma: tx,
                        businessId,
                        files,
                        settings,
                    });

                    const problems = checked.plan.items
                        .filter(item => item.action === "BLOCKED")
                        .map(item => ({
                            key: item.record.key,
                            fileName: item.record.fileName,
                            sheetName: item.record.sheetName,
                            rowNumber: item.record.rowNumber,
                            message: item.reason,
                        }));

                    return {
                        success: true,
                        draftId: saved.id,
                        revision: saved.revision,
                        checkedAt: checked.snapshot.checkedAt,
                        finalImportAvailable:
                            (
                                checked.plan.items.length > 0 ||
                                checked.prepared.excludedRecords.length > 0
                            ) &&
                            checked.plan.blockedCount === 0 &&
                            checked.prepared.mappingProblems.length === 0,
                        summary: {
                            total: checked.plan.items.length,
                            createCount: checked.plan.createCount,
                            linkCount: checked.plan.linkCount,
                            problemCount: checked.plan.blockedCount,
                            mappingProblemCount:
                                checked.prepared.mappingProblems.length,
                            excludedCount:
                                checked.prepared.excludedRecords.length,
                        },
                        mappingProblems:
                            checked.prepared.mappingProblems,
                        problems,
                    };
                },
                {
                    isolationLevel: "RepeatableRead",
                    maxWait: 10_000,
                    timeout: 30_000,
                },
            );

            return json(response);
        } finally {
            try {
                await prisma.$disconnect();
            } catch {
                console.error(
                    "Customer import check connection close failed",
                );
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
            "Customer import check failed",
            cause instanceof Error
                ? cause.name
                : "UnknownError",
        );

        return json({
            success: false,
            message:
                "მომხმარებლების საბოლოო შემოწმება ვერ დასრულდა. მონაცემები არ შეგვიცვლია. ეს ფაილში ინფორმაციის ნაკლებობას არ ნიშნავს - სცადე ხელახლა.",
        }, 500);
    }
}