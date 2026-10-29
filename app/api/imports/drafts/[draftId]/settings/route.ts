import { Prisma } from "@/generated/prisma/client";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";

import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";
import { readImportJson } from "@/lib/imports/read-import-json";

import {
    ImportDraftFileError,
    validateImportDraftFile,
} from "@/lib/imports/validate-import-draft-file";

import {
    validateImportDraftSettings,
} from "@/lib/imports/validate-import-draft-settings";

import type {
    ParsedImportFile,
} from "@/lib/imports/import-file-types";

import {
    validatePartialImportSettings,
} from "@/lib/imports/validate-partial-import-settings";
import {
    readImportCompletedSections,
} from "@/lib/imports/read-import-completed-sections";

import {
    getProductDuplicateDecisionKeys,
} from "@/lib/imports/validate-product-duplicate-decisions";
import {
    getProductPhotoDecisionToken,
} from "@/lib/imports/product-photo-decisions";

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

function object(
    value: unknown,
): Record<string, unknown> | null {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    )
        ? value as Record<string, unknown>
        : null;
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
                    "მონახაზის შენახვა ხელმისაწვდომია ბიზნესის მფლობელისა და ადმინისტრატორისთვის.",
                    403,
                );
            }

            const body = object(await readImportJson(request));

            if (!body) {
                fail("პარამეტრების შენახვის მოთხოვნა არასწორია.");
            }

            if (
                typeof body.clientRequestId !== "string" ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    body.clientRequestId,
                )
            ) {
                fail("შენახვის მოთხოვნის იდენტიფიკატორი არასწორია.");
            }

            if (
                typeof body.expectedRevision !== "number" ||
                !Number.isSafeInteger(body.expectedRevision) ||
                body.expectedRevision < 1
            ) {
                fail("მონახაზის მოსალოდნელი ვერსია არასწორია.");
            }

            const clientRequestId = body.clientRequestId.toLowerCase();
            const expectedRevision = body.expectedRevision;

            const settings = validateImportDraftSettings(
                body.settings,
                membership.businessId,
            );

            const digest = await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(JSON.stringify(settings)),
            );

            const payloadSha256 = Array.from(
                new Uint8Array(digest),
                byte => byte.toString(16).padStart(2, "0"),
            ).join("");

            const result = await prisma.$transaction(async tx => {
                const locked = await tx.$queryRaw<{ id: string }[]>`
                    SELECT "id"
                    FROM "ImportJob"
                    WHERE
                        "id" = ${draftId}
                        AND "businessId" = ${membership.businessId}
                    FOR UPDATE
                `;

                if (locked.length === 0) {
                    fail("მონახაზი ამ ბიზნესში ვერ მოიძებნა.", 404);
                }

                const draft = await tx.importJob.findUniqueOrThrow({
                    where: { id: draftId },
                    select: {
                        status: true,
                        schemaVersion: true,
                        revision: true,
                        settings: true,
                        resultSummary: true,
                        expiresAt: true,
                    },
                });

                if (
                    draft.schemaVersion !== 1 ||
                    !["DRAFT", "REVIEW", "PARTIAL"].includes(draft.status)
                ) {
                    fail(
                        "ამ მდგომარეობაში მონახაზის პარამეტრების შეცვლა შეუძლებელია.",
                        409,
                    );
                }

                const savedSettings = object(draft.settings);
                const receipt = object(savedSettings?._saveReceipt);

                if (receipt?.clientRequestId === clientRequestId) {
                    if (receipt.payloadSha256 !== payloadSha256) {
                        fail(
                            "იგივე მოთხოვნის იდენტიფიკატორით განსხვავებული მონაცემები გამოიგზავნა. შენახვა არ შესრულდა.",
                            409,
                        );
                    }

                    return {
                        revision: draft.revision,
                        alreadySaved: true,
                    };
                }

                if (draft.revision !== expectedRevision) {
                    fail(
                        "მონახაზი სხვა მოთხოვნით შეიცვალა. პარამეტრები არ გადაგვიწერია - განაახლე მონახაზი გაგრძელებამდე.",
                        409,
                    );
                }

                                if (
                    draft.expiresAt !== null &&
                    draft.expiresAt.getTime() <= Date.now()
                ) {
                    fail(
                        "მონახაზის შენახვის ვადა ამოიწურა. შექმენი ახალი მონახაზი.",
                        409,
                    );
                }

                if (draft.status === "PARTIAL") {
                    const completed = readImportCompletedSections(
                        draft.resultSummary,
                        {
                            draftId,
                            businessId: membership.businessId,
                            revision: draft.revision,
                        },
                    );

                    if (
                        !completed.customers &&
                        !completed.products &&
                        !completed.orders
                    ) {
                        fail(
                            "მონახაზის დასრულებული განყოფილებები ვერ დადასტურდა.",
                            409,
                        );
                    }

                    try {
                        validatePartialImportSettings({
                            savedSettings: draft.settings,
                            nextSettings: settings,
                            completed,
                            businessId: membership.businessId,
                        });
                    } catch (cause: unknown) {
                        fail(
                            cause instanceof Error
                                ? cause.message
                                : "დარჩენილი კატეგორიების ცვლილებები ვერ შემოწმდა.",
                            422,
                        );
                    }
                }

                const savedFiles = await tx.importFile.findMany({
                    where: { jobId: draftId },
                    select: { structure: true },
                });

                const files = new Map<string, ParsedImportFile>();

                for (const savedFile of savedFiles) {
                    const structure = object(savedFile.structure);
                    const clientFileId = structure?.clientFileId;

                    if (
                        !structure ||
                        typeof clientFileId !== "string" ||
                        files.has(clientFileId)
                    ) {
                        fail(
                            "მონახაზის შენახული ფაილების იდენტობა ვერ დადასტურდა. მონაცემები არ შეგვიცვლია.",
                            409,
                        );
                    }

                    files.set(
                        clientFileId,
                        validateImportDraftFile(structure.parsedFile),
                    );
                }

                function requireSheet(
                    clientFileId: string,
                    sheetName: string,
                ) {
                    const file = files.get(clientFileId);
                    const sheet = file?.sheets.find(
                        item => item.name === sheetName,
                    );

                    if (!sheet) {
                        fail(
                            `ფაილი ან ფურცელი „${sheetName}“ ამ მონახაზში შენახული არ არის. ჯერ ფაილის შენახვა უნდა დასრულდეს.`,
                        );
                    }

                    return sheet;
                }

                for (const [fileId, mappings] of Object.entries(
                    settings.productMappings,
                )) {
                    for (const sheetName of Object.keys(mappings)) {
                        requireSheet(fileId, sheetName);
                    }
                }

                for (const [fileId, mappings] of Object.entries(
                    settings.customerMappings,
                )) {
                    for (const sheetName of Object.keys(mappings)) {
                        requireSheet(fileId, sheetName);
                    }
                }

                for (const [fileId, sheets] of [
                    ...Object.entries(settings.customerEdits),
                    ...Object.entries(settings.productEdits),
                ]) {
                    for (const [sheetName, edits] of Object.entries(sheets)) {
                        const sheet = requireSheet(fileId, sheetName);

                        const rowNumbers = new Set(
                            sheet.rows.map(row => row.rowNumber),
                        );

                        for (const row of Object.keys(edits)) {
                            if (!rowNumbers.has(Number(row))) {
                                fail(
                                    `ფურცელში „${sheetName}“ რიგი ${row} ვერ მოიძებნა. შესწორება ამ მონახაზის მონაცემებს არ შეესაბამება.`,
                                );
                            }
                        }
                    }
                }

                for (const key of [
                    ...settings.excludedCustomerKeys,
                    ...settings.excludedProductKeys,
                    ...Object.keys(settings.existingProductLinks),
                    ...settings.productDuplicateDecisions.flatMap(
                        decision =>
                            getProductDuplicateDecisionKeys(
                                decision.groupToken,
                            ),
                    ),
                ]) {
                    // სტრუქტურა უკვე შემოწმებულია settings validator-ში.
                    const [fileId, sheetName, rowNumber] =
                        JSON.parse(key) as [string, string, number];

                    const sheet = requireSheet(fileId, sheetName);

                    if (
                        !sheet.rows.some(
                            row => row.rowNumber === rowNumber,
                        )
                    ) {
                        fail(
                            `გამოტოვებული ჩანაწერი ფურცელში „${sheetName}“, რიგი ${rowNumber}, ვერ მოიძებნა.`,
                        );
                    }
                }

                for (
                    const decision of
                    settings.productPhotoDecisions ?? []
                ) {
                    const source = files.get(
                        decision.clientFileId,
                    );

                    if (!source) {
                        fail(
                            "ფოტოს არჩევანის წყაროს ფაილი ამ მონახაზში ვერ მოიძებნა.",
                        );
                    }

                    const expectedToken =
                        getProductPhotoDecisionToken(
                            {
                                clientFileId:
                                    decision.clientFileId,
                                sha256: source.sha256,
                            },
                            decision,
                        );

                    if (decision.token !== expectedToken) {
                        fail(
                            "ფოტოს არჩევანი წყაროს ფაილის მიმდინარე ვერსიას არ ემთხვევა. არჩევანი ხელახლა დაადასტურე.",
                        );
                    }

                    if (decision.scope === "ROW") {
                        const sheet = requireSheet(
                            decision.clientFileId,
                            decision.sheetName,
                        );

                        if (
                            !sheet.rows.some(
                                row =>
                                    row.rowNumber ===
                                    decision.rowNumber,
                            )
                        ) {
                            fail(
                                "ფოტოს არჩევანის შესაბამისი რიგი წყაროს ფაილში ვერ მოიძებნა.",
                            );
                        }
                    }
                }

                const storedSettings = JSON.parse(JSON.stringify({
                    ...settings,
                    _saveReceipt: {
                        clientRequestId,
                        payloadSha256,
                    },
                })) as Prisma.InputJsonObject;

                const updated = await tx.importJob.update({
                    where: { id: draftId },
                    data: {
                        settings: storedSettings,
                        status:
                            draft.status === "PARTIAL"
                                ? "PARTIAL"
                                : "DRAFT",
                        revision: { increment: 1 },
                        confirmedRevision: null,
                        previewSummary: Prisma.JsonNull,
                    },
                    select: { revision: true },
                });

                return {
                    revision: updated.revision,
                    alreadySaved: false,
                };
            }, {
                timeout: 15000,
            });

            return json({
                success: true,
                draftId,
                ...result,
            });
        } finally {
            await prisma.$disconnect();
        }
    } catch (cause: unknown) {
        if (cause instanceof ImportDraftFileError) {
            return json({
                success: false,
                message: cause.message,
            }, 422);
        }

        if (cause instanceof OrderValidationError) {
            return json({
                success: false,
                message: cause.message,
            }, cause.status);
        }

        console.error(
            "Import draft settings save failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return json({
            success: false,
            message:
                "მონახაზის პარამეტრების შენახვის შედეგი ვერ დადასტურდა. იგივე მოთხოვნით ხელახლა ცდა მეორე ცვლილებას არ შექმნის. მიმდინარე მონაცემები გვერდზე შეინარჩუნე.",
        }, 500);
    }
}