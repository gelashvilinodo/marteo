import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import {
    validateImportDraftFile,
} from "@/lib/imports/validate-import-draft-file";
import {
    validateImportDraftSettings,
    type ImportDraftSettings,
} from "@/lib/imports/validate-import-draft-settings";
import {
    readSavedImportPhotos,
} from "@/lib/imports/read-saved-import-photos";
import {
    readImportPhotoManifest,
} from "@/lib/imports/import-photo-manifest";
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

export async function GET(
    _request: Request,
    context: { params: Promise<{ draftId: string }> },
) {
    try {
        const user = await getCurrentUser();

        if (!user) {
            return json({
                success: false,
                message: "მონახაზის გასახსნელად გაიარე ავტორიზაცია.",
            }, 401);
        }

        const membership = await getCurrentBusiness();

        if (!membership) {
            return json({
                success: false,
                message: "ბიზნესი ვერ მოიძებნა.",
            }, 403);
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
                return json({
                    success: false,
                    message:
                        "მონახაზი ხელმისაწვდომია ბიზნესის მფლობელისა და ადმინისტრატორისთვის.",
                }, 403);
            }

            const saved = await prisma.$transaction(
                async tx => tx.importJob.findFirst({
                    where: {
                        id: draftId,
                        businessId: membership.businessId,
                        status: {
                            in: ["DRAFT", "REVIEW", "PARTIAL"],
                        },
                        schemaVersion: 1,
                        OR: [
                            { expiresAt: null },
                            { expiresAt: { gt: new Date() } },
                        ],
                    },
                    select: {
                        id: true,
                        businessId: true,
                        clientRequestId: true,
                        status: true,
                        schemaVersion: true,
                        revision: true,
                        createdAt: true,
                        updatedAt: true,
                        settings: true,
                        resultSummary: true,
                        files: {
                            orderBy: [
                                { createdAt: "asc" },
                                { id: "asc" },
                            ],
                            select: {
                                id: true,
                                sha256: true,
                                originalName: true,
                                format: true,
                                byteSize: true,
                                structure: true,
                                photos: {
                                    orderBy: [
                                        { sheetName: "asc" },
                                        { rowNumber: "asc" },
                                        { columnNumber: "asc" },
                                        { id: "asc" },
                                    ],
                                    select: {
                                        id: true,
                                        sourceKey: true,
                                        sheetName: true,
                                        rowNumber: true,
                                        columnNumber: true,
                                        sourcePath: true,
                                        originalName: true,
                                        sha256: true,
                                        byteSize: true,
                                        storagePath: true,
                                        imageUrl: true,
                                    },
                                },
                            },
                        },
                    },
                }),
                {
                    isolationLevel: "RepeatableRead",
                },
            );

            if (!saved) {
                return json({
                    success: false,
                    message:
                        "აქტიური მონახაზი ამ ბიზნესში ვერ მოიძებნა.",
                }, 404);
            }

                        const completedSections =
                readImportCompletedSections(
                    saved.resultSummary,
                    {
                        draftId: saved.id,
                        businessId: saved.businessId,
                        revision: saved.revision,
                    },
                );

            const hasCompletedSection =
                completedSections.customers ||
                completedSections.products ||
                completedSections.orders;

            if (
                (
                    saved.status === "PARTIAL" &&
                    !hasCompletedSection
                ) ||
                (
                    saved.status !== "PARTIAL" &&
                    hasCompletedSection
                )
            ) {
                throw new Error(
                    "Import status and completed sections disagree",
                );
            }

            const clientFileIds = new Set<string>();

            const files = saved.files.map(item => {
                const structure = item.structure;

                if (
                    typeof structure !== "object" ||
                    structure === null ||
                    Array.isArray(structure) ||
                    typeof structure.clientFileId !== "string" ||
                    clientFileIds.has(structure.clientFileId)
                ) {
                    throw new Error("Invalid saved file identity");
                }

                clientFileIds.add(structure.clientFileId);

                const file = validateImportDraftFile(
                    structure.parsedFile,
                );

                if (
                    file.sha256 !== item.sha256 ||
                    file.originalName !== item.originalName ||
                    file.format !== item.format ||
                    file.byteSize !== item.byteSize
                ) {
                    throw new Error("Saved file metadata mismatch");
                }

                return {
                    fileId: item.id,
                    clientFileId: structure.clientFileId,
                    file,
                    photos: readSavedImportPhotos(
                        item.photos,
                        membership.businessId,
                        file,
                    ),
                    photoManifest: readImportPhotoManifest(
                        structure.photoManifest,
                        file,
                    ),
                };
            });

            const hasSavedSettings = saved.settings !== null;

            const settings: ImportDraftSettings = hasSavedSettings
                ? validateImportDraftSettings(
                    saved.settings,
                    membership.businessId,
                )
                : {
                    workspaceVersion: 1,
                    productDuplicateDecisions: [],
                    productStockPolicy: null,
                    productStockDate: null,
                    existingProductLinks: {},
                    productEdits: {},
                    productMappings: {},
                    customerMappings: {},
                    customerEdits: {},
                    excludedCustomerKeys: [],
                    excludedProductKeys: [],
                    existingCustomerLinks: {},
                };

            return json({
                success: true,
                draft: {
                    id: saved.id,
                    businessId: saved.businessId,
                    clientRequestId: saved.clientRequestId,
                    status: saved.status,
                    schemaVersion: saved.schemaVersion,
                    revision: saved.revision,
                    createdAt: saved.createdAt,
                    updatedAt: saved.updatedAt,
                },
                files,
                settings,
                completedSections,
                hasSavedSettings,
                requiresCustomerRecheck: true,
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        console.error(
            "Import draft load failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return json({
            success: false,
            message:
                "მონახაზი სრულად ვერ აღვადგინეთ. შენახული მონაცემები არ შეგვიცვლია. ეს საწყის ფაილში ბიზნესინფორმაციის ნაკლებობას არ ნიშნავს — სცადე ხელახლა.",
        }, 500);
    }
}