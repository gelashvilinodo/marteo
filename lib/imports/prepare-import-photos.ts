"use client";

import {
    prepareProductPhoto,
} from "@/lib/images/prepare-product-photo";

import type {
    ImportEmbeddedPhoto,
    ImportPhotoReadIssue,
} from "./import-photo-types";

export type PreparedImportPhoto = {
    sourcePath: string;
    sheetName: string;
    rowNumber: number;
    columnNumber: number;
    file: File;
    thumbnail: File | null;
};

export type PreparedImportPhotosResult = {
    photos: PreparedImportPhoto[];
    issues: ImportPhotoReadIssue[];
};

type Options = {
    signal?: AbortSignal;
    onProgress?: (completed: number, total: number) => void;
};

function checkAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        throw new DOMException(
            "ფოტოების დამუშავება გაუქმებულია.",
            "AbortError",
        );
    }
}

export async function prepareImportPhotos(
    photos: readonly ImportEmbeddedPhoto[],
    options: Options = {},
): Promise<PreparedImportPhotosResult> {
    const result: PreparedImportPhotosResult = {
        photos: [],
        issues: [],
    };

    checkAborted(options.signal);
    options.onProgress?.(0, photos.length);

    for (let index = 0; index < photos.length; index++) {
        checkAborted(options.signal);

        const photo = photos[index];

        try {
            const original = new File(
                [photo.blob],
                photo.originalName,
                { type: photo.mimeType },
            );

            const prepared = await prepareProductPhoto(original);

            // მიმდინარე ფოტოს დამუშავება შესაძლოა უკვე დაწყებულია.
            // გაუქმების შემდეგ მისი შედეგი აღარ გამოიყენება.
            checkAborted(options.signal);

            result.photos.push({
                sourcePath: photo.sourcePath,
                sheetName: photo.sheetName,
                rowNumber: photo.rowNumber,
                columnNumber: photo.columnNumber,
                file: prepared.file,
                thumbnail: prepared.thumbnail,
            });
        } catch (cause: unknown) {
            checkAborted(options.signal);

            if (
                cause instanceof DOMException &&
                cause.name === "AbortError"
            ) {
                throw cause;
            }

            result.issues.push({
                code: "BROKEN_IMAGE",
                message:
                    "ფოტოს შემცირება ვერ მოხერხდა. " +
                    (
                        cause instanceof Error
                            ? cause.message
                            : "აირჩიე ფოტო ხელახლა."
                    ),
                sheetName: photo.sheetName,
                rowNumber: photo.rowNumber,
            });
        }

        checkAborted(options.signal);
        options.onProgress?.(index + 1, photos.length);
    }

    return result;
}