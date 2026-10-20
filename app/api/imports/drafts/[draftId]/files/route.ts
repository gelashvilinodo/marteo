import type { Prisma } from "@/generated/prisma/client";

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
    readImportPhotoManifest,
} from "@/lib/imports/import-photo-manifest";

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

            const raw = await readImportJson(request);

            if (
                typeof raw !== "object" ||
                raw === null ||
                Array.isArray(raw)
            ) {
                fail("ფაილის შენახვის მოთხოვნა არასწორია.");
            }

            const body = raw as Record<string, unknown>;

            if (
                typeof body.clientFileId !== "string" ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    body.clientFileId,
                )
            ) {
                fail("ფაილის სამუშაო იდენტიფიკატორი არასწორია.");
            }

            if (
                typeof body.expectedRevision !== "number" ||
                !Number.isSafeInteger(body.expectedRevision) ||
                body.expectedRevision < 1
            ) {
                fail("მონახაზის მოსალოდნელი ვერსია არასწორია.");
            }

            const clientFileId = body.clientFileId.toLowerCase();
            const expectedRevision = body.expectedRevision;
            const file = validateImportDraftFile(body.file);
                        let photoManifest: ReturnType<
                typeof readImportPhotoManifest
            >;

            try {
                photoManifest = readImportPhotoManifest(
                    body.photoManifest,
                    file,
                );
            } catch (cause: unknown) {
                fail(
                    cause instanceof Error
                        ? cause.message
                        : "წყაროს ფოტოების სია ვერ წავიკითხეთ.",
                );
            }

            const serializedFile = JSON.stringify(file);
            const digest = await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(serializedFile),
            );

            const payloadSha256 = Array.from(
                new Uint8Array(digest),
                byte => byte.toString(16).padStart(2, "0"),
            ).join("");

            const structure = JSON.parse(JSON.stringify({
                clientFileId,
                payloadSha256,
                parsedFile: file,
                photoManifest,
            })) as Prisma.InputJsonObject;

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
                    },
                });

                if (
                    draft.schemaVersion !== 1 ||
                    !["DRAFT", "REVIEW"].includes(draft.status)
                ) {
                    fail(
                        "ამ მდგომარეობაში მონახაზში ახალი ფაილის დამატება შეუძლებელია.",
                        409,
                    );
                }

                const existing = await tx.importFile.findUnique({
                    where: {
                        jobId_sha256: {
                            jobId: draftId,
                            sha256: file.sha256,
                        },
                    },
                    select: {
                        id: true,
                        structure: true,
                    },
                });

                if (existing) {
                    const saved = existing.structure;

                    if (
                        typeof saved !== "object" ||
                        saved === null ||
                        Array.isArray(saved) ||
                        saved.clientFileId !== clientFileId ||
                        saved.payloadSha256 !== payloadSha256 ||
                        JSON.stringify(
                            readImportPhotoManifest(
                                saved.photoManifest,
                                file,
                            ),
                        ) !== JSON.stringify(photoManifest)
                    ) {
                        fail(
                            "ამ ფაილის თავდაპირველი მონაცემები უკვე შენახულია და მოთხოვნას არ ემთხვევა. არსებულ მონაცემებს არ გადავაწერთ — საჭიროა მონახაზის ხელახლა ჩატვირთვა.",
                            409,
                        );
                    }

                    return {
                        fileId: existing.id,
                        clientFileId,
                        revision: draft.revision,
                        alreadySaved: true,
                    };
                }

                if (draft.revision !== expectedRevision) {
                    fail(
                        "მონახაზი სხვა მოთხოვნით შეიცვალა. მონაცემები არ გადაგვიწერია — განაახლე მონახაზი გაგრძელებამდე.",
                        409,
                    );
                }

                const savedFile = await tx.importFile.create({
                    data: {
                        jobId: draftId,
                        originalName: file.originalName,
                        format: file.format,
                        byteSize: file.byteSize,
                        sha256: file.sha256,
                        structure,
                    },
                    select: { id: true },
                });

                const updated = await tx.importJob.update({
                    where: { id: draftId },
                    data: {
                        revision: { increment: 1 },
                        confirmedRevision: null,
                    },
                    select: { revision: true },
                });

                return {
                    fileId: savedFile.id,
                    clientFileId,
                    revision: updated.revision,
                    alreadySaved: false,
                };
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
            "Import draft file save failed",
            cause instanceof Error ? cause.name : "UnknownError",
        );

        return json({
            success: false,
            message:
                "ფაილის მონახაზში შენახვის შედეგი ვერ დადასტურდა. ხელახლა ცდისას იგივე ფაილის იდენტიფიკატორი უნდა გამოვიყენოთ. ეს ფაილში ბიზნესმონაცემების შეცდომას არ ნიშნავს.",
        }, 500);
    }
}