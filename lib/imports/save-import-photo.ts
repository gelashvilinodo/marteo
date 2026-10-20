import "server-only";

import { Prisma } from "@/generated/prisma/client";

import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";

import {
    uploadProductImage,
} from "@/lib/purchases/product-images";

import type {
    readImportPhotoRequest,
} from "./read-import-photo-request";

import {
    validateImportDraftFile,
} from "./validate-import-draft-file";

type PhotoUpload = Awaited<
    ReturnType<typeof readImportPhotoRequest>
>;

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

function object(
    value: unknown,
): Record<string, unknown> | null {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    )
        ? value as Record<string, unknown>
        : null;
}

// გამოიძახე მხოლოდ prisma.$transaction-ის შიგნით.
// onUploaded მხოლოდ ატვირთული მისამართის აღრიცხვისთვისაა.
export async function saveImportPhoto(
    tx: Prisma.TransactionClient,
    input: {
        userId: string;
        businessId: string;
        draftId: string;
        upload: PhotoUpload;
        onUploaded: (storagePath: string) => void;
    },
) {
    const {
        userId,
        businessId,
        draftId,
        upload,
        onUploaded,
    } = input;

    const { metadata } = upload;

    const businesses = await tx.$queryRaw<
        Array<{ id: string }>
    >(Prisma.sql`
        SELECT "id"
        FROM "Business"
        WHERE "id" = ${businessId}
        FOR UPDATE
    `);

    if (businesses.length === 0) {
        fail("ბიზნესი ვერ მოიძებნა.", 404);
    }

    const membership = await tx.businessMembership.findUnique({
        where: {
            userId_businessId: {
                userId,
                businessId,
            },
        },
        select: { role: true },
    });

    if (
        !membership ||
        !["OWNER", "ADMIN"].includes(membership.role)
    ) {
        fail(
            "იმპორტის ფოტოების შენახვა ხელმისაწვდომია ბიზნესის მფლობელისა და ადმინისტრატორისთვის.",
            403,
        );
    }

    const locked = await tx.$queryRaw<
        Array<{ id: string }>
    >(Prisma.sql`
        SELECT "id"
        FROM "ImportJob"
        WHERE "id" = ${draftId}
          AND "businessId" = ${businessId}
        FOR UPDATE
    `);

    if (locked.length === 0) {
        fail("მონახაზი ამ ბიზნესში ვერ მოიძებნა.", 404);
    }

    const draft = await tx.importJob.findUniqueOrThrow({
        where: { id: draftId },
        select: {
            revision: true,
            status: true,
            schemaVersion: true,
            expiresAt: true,
        },
    });

    const files = await tx.importFile.findMany({
        where: { jobId: draftId },
        select: {
            id: true,
            structure: true,
        },
    });

    const matchingFiles = files.filter(file =>
        object(file.structure)?.clientFileId ===
        metadata.clientFileId,
    );

    if (matchingFiles.length !== 1) {
        fail(
            "ფოტოს წყაროს ფაილი მონახაზში ვერ მოიძებნა. ჯერ წყაროს ფაილი უნდა შეინახოს.",
            409,
        );
    }

    const savedFile = matchingFiles[0];

    const existing = await tx.importPhoto.findUnique({
        where: {
            fileId_sourceKey: {
                fileId: savedFile.id,
                sourceKey: upload.sourceKey,
            },
        },
    });

    if (existing) {
        if (
            existing.sha256 !== upload.sha256 ||
            existing.byteSize !== upload.byteSize ||
            existing.sheetName !== metadata.sheetName ||
            existing.rowNumber !== metadata.rowNumber ||
            existing.columnNumber !== metadata.columnNumber ||
            existing.sourcePath !== metadata.sourcePath
        ) {
            fail(
                "ამ მდებარეობისთვის სხვა ფოტო უკვე შენახულია. არსებული ფოტო ავტომატურად არ გადაიწერება.",
                409,
            );
        }

        return {
            photoId: existing.id,
            clientFileId: metadata.clientFileId,
            sourceKey: existing.sourceKey,
            imageUrl: existing.imageUrl,
            sha256: existing.sha256,
            byteSize: existing.byteSize,
            sheetName: existing.sheetName,
            rowNumber: existing.rowNumber,
            columnNumber: existing.columnNumber,
            revision: draft.revision,
            alreadySaved: true,
        };
    }

    if (
        draft.schemaVersion !== 1 ||
        !["DRAFT", "REVIEW"].includes(draft.status)
    ) {
        fail(
            "ამ მდგომარეობაში მონახაზში ახალი ფოტოს დამატება შეუძლებელია.",
            409,
        );
    }

    if (
        draft.expiresAt !== null &&
        draft.expiresAt.getTime() <= Date.now()
    ) {
        fail("მონახაზის მოქმედების ვადა დასრულებულია.", 409);
    }

    if (draft.revision !== metadata.expectedRevision) {
        fail(
            "მონახაზი სხვა მოთხოვნით შეიცვალა. გაგრძელებამდე მისი მიმდინარე ვერსია უნდა ჩაიტვირთოს.",
            409,
        );
    }

    const structure = object(savedFile.structure);

    const parsed = validateImportDraftFile(
        structure?.parsedFile,
    );

    const sheet = parsed.sheets.find(
        item => item.name === metadata.sheetName,
    );

    if (
        !sheet ||
        !sheet.rows.some(
            row => row.rowNumber === metadata.rowNumber,
        )
    ) {
        fail(
            "ფოტოს მითითებული ფურცელი ან რიგი შენახულ წყაროს ფაილში ვერ მოიძებნა.",
        );
    }

    if (
        !upload.file.name.trim() ||
        upload.file.name.length > 512 ||
        /[\u0000-\u001f]/.test(upload.file.name)
    ) {
        fail("მომზადებული ფოტოს სახელი არასწორია.");
    }

    const stored = await uploadProductImage(
        businessId,
        upload.file,
        upload.thumbnail,
    );

    onUploaded(stored.path);

    const photo = await tx.importPhoto.create({
        data: {
            fileId: savedFile.id,
            sourceKey: upload.sourceKey,
            sheetName: metadata.sheetName,
            rowNumber: metadata.rowNumber,
            columnNumber: metadata.columnNumber,
            sourcePath: metadata.sourcePath,
            originalName: upload.file.name,
            sha256: upload.sha256,
            byteSize: upload.byteSize,
            storagePath: stored.path,
            imageUrl: stored.url,
        },
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
        photoId: photo.id,
        clientFileId: metadata.clientFileId,
        sourceKey: photo.sourceKey,
        imageUrl: photo.imageUrl,
        sha256: photo.sha256,
        byteSize: photo.byteSize,
        sheetName: photo.sheetName,
        rowNumber: photo.rowNumber,
        columnNumber: photo.columnNumber,
        revision: updated.revision,
        alreadySaved: false,
    };
}