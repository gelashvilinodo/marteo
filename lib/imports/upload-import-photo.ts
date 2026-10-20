"use client";

import type {
    PreparedImportPhoto,
} from "./prepare-import-photos";

export type ImportPhotoUploadReceipt = {
    draftId: string;
    photoId: string;
    clientFileId: string;
    sourceKey: string;
    imageUrl: string;
    sha256: string;
    byteSize: number;
    sheetName: string;
    rowNumber: number;
    columnNumber: number;
    revision: number;
    alreadySaved: boolean;
};

export class ImportPhotoUploadError extends Error {
    constructor(
        message: string,
        public status: number | null,
        public confirmedNotSaved = false,
    ) {
        super(message);
        this.name = "ImportPhotoUploadError";
    }
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

async function sha256(
    buffer: ArrayBuffer,
): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", buffer);

    return Array.from(
        new Uint8Array(digest),
        byte => byte.toString(16).padStart(2, "0"),
    ).join("");
}

export async function uploadImportPhoto({
    draftId,
    clientFileId,
    expectedRevision,
    photo,
    signal,
}: {
    draftId: string;
    clientFileId: string;
    expectedRevision: number;
    photo: PreparedImportPhoto;
    signal?: AbortSignal;
}): Promise<ImportPhotoUploadReceipt> {
    if (signal?.aborted) {
        throw new DOMException(
            "ფოტოს ატვირთვა გაუქმებულია.",
            "AbortError",
        );
    }

    const metadata = {
        clientFileId,
        expectedRevision,
        sheetName: photo.sheetName,
        rowNumber: photo.rowNumber,
        columnNumber: photo.columnNumber,
        sourcePath: photo.sourcePath,
    };

    const identity = JSON.stringify([
        photo.sheetName,
        photo.rowNumber,
        photo.columnNumber,
        photo.sourcePath,
    ]);

    const sourceKey = await sha256(
        new TextEncoder().encode(identity).buffer,
    );

    const contentSha256 = await sha256(
        await photo.file.arrayBuffer(),
    );

    if (signal?.aborted) {
        throw new DOMException(
            "ფოტოს ატვირთვა გაუქმებულია.",
            "AbortError",
        );
    }

    const form = new FormData();
    form.set("metadata", JSON.stringify(metadata));
    form.set("photo", photo.file);

    if (photo.thumbnail !== null) {
        form.set("thumbnail", photo.thumbnail);
    }

    let response: Response;

    try {
        response = await fetch(
            `/api/imports/drafts/${encodeURIComponent(draftId)}/photos`,
            {
                method: "POST",
                body: form,
                credentials: "same-origin",
                cache: "no-store",
                signal,
            },
        );
    } catch (cause: unknown) {
        if (signal?.aborted) throw cause;

        throw new ImportPhotoUploadError(
            "ფოტოს შენახვის პასუხი ვერ მივიღეთ. იგივე ფოტოთი ხელახლა ცდა შესაძლებელია.",
            null,
        );
    }

    let raw: unknown;

    try {
        raw = await response.json();
    } catch {
        throw new ImportPhotoUploadError(
            "ფოტოს შენახვის პასუხი სრულად ვერ წავიკითხეთ. შედეგი გადასამოწმებელია.",
            response.ok ? null : response.status,
        );
    }

    const value = object(raw);

    if (!response.ok || value?.success !== true) {
        throw new ImportPhotoUploadError(
            typeof value?.message === "string"
                ? value.message
                : "ფოტოს შენახვა ვერ დადასტურდა.",
            response.ok ? null : response.status,
            value?.success === false &&
                value.outcome === "NOT_SAVED",
        );
    }

    if (
        value.draftId !== draftId ||
        typeof value.photoId !== "string" ||
        !value.photoId ||
        value.clientFileId !== clientFileId.toLowerCase() ||
        value.sourceKey !== sourceKey ||
        value.sha256 !== contentSha256 ||
        value.byteSize !== photo.file.size ||
        value.sheetName !== photo.sheetName ||
        value.rowNumber !== photo.rowNumber ||
        value.columnNumber !== photo.columnNumber ||
        typeof value.imageUrl !== "string" ||
        !value.imageUrl.startsWith("https://") ||
        typeof value.revision !== "number" ||
        !Number.isSafeInteger(value.revision) ||
        value.revision < expectedRevision ||
        typeof value.alreadySaved !== "boolean"
    ) {
        throw new ImportPhotoUploadError(
            "შენახვის პასუხი მოთხოვნილ ფოტოს არ ემთხვევა. შედეგი გადასამოწმებელია.",
            null,
        );
    }

    return {
        draftId,
        photoId: value.photoId,
        clientFileId: value.clientFileId,
        sourceKey,
        imageUrl: value.imageUrl,
        sha256: contentSha256,
        byteSize: photo.file.size,
        sheetName: photo.sheetName,
        rowNumber: photo.rowNumber,
        columnNumber: photo.columnNumber,
        revision: value.revision,
        alreadySaved: value.alreadySaved,
    };
}