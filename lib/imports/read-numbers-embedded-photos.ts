import type {
    ImportEmbeddedPhoto,
    ImportPhotoReadResult,
} from "./import-photo-types";

import {
    readNumbersPhotoIndex,
} from "./read-numbers-photo-index";

import {
    readNumbersPhotoMedia,
} from "./read-numbers-photo-media";

import {
    readNumbersPhotoTables,
} from "./read-numbers-photo-tables";

import {
    readNumbersTablePhotos,
} from "./read-numbers-table-photos";

function imageMime(bytes: Uint8Array): string | null {
    if (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
    ) {
        return "image/jpeg";
    }

    if (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    ) {
        return "image/png";
    }

    if (
        bytes.length >= 12 &&
        String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
    ) {
        return "image/webp";
    }

    return null;
}

export function readNumbersEmbeddedPhotos(
    buffer: ArrayBuffer,
    parsedSheetNames: readonly string[],
): ImportPhotoReadResult {
    const index = readNumbersPhotoIndex(buffer);
    const media = readNumbersPhotoMedia(index);
    const tables = readNumbersPhotoTables(
        index,
        parsedSheetNames,
    );

    const result: ImportPhotoReadResult = {
        photos: [],
        issues: [],
    };

    const candidates: ImportEmbeddedPhoto[] = [];

    for (const table of tables) {
        let locations: ReturnType<typeof readNumbersTablePhotos>;

        try {
            locations = readNumbersTablePhotos(
                index,
                table.tableId,
            );
        } catch (cause: unknown) {
            result.issues.push({
                code: "UNRESOLVED_IMAGE_POSITION",
                message:
                    "ამ ცხრილის ფოტოების კავშირების წაკითხვა ვერ დასრულდა. " +
                    (
                        cause instanceof Error
                            ? cause.message
                            : "საჭიროა ფოტოების გადამოწმება."
                    ),
                sheetName: table.sheetName,
                rowNumber: null,
            });

            continue;
        }

        for (const location of locations) {
            const photo = media.get(location.imageId);

            if (!photo?.bytes) {
                result.issues.push({
                    code: "BROKEN_IMAGE",
                    message:
                        "უჯრედში ფოტო მითითებულია, მაგრამ მისი ფაილი Numbers-ის არქივში ვერ მოიძებნა.",
                    sheetName: table.sheetName,
                    rowNumber: location.rowNumber,
                });

                continue;
            }

            const mimeType = imageMime(photo.bytes);

            if (mimeType === null) {
                result.issues.push({
                    code: "UNSUPPORTED_IMAGE",
                    message:
                        "უჯრედის ფოტოს ფორმატი ჯერ არ არის მხარდაჭერილი.",
                    sheetName: table.sheetName,
                    rowNumber: location.rowNumber,
                });

                continue;
            }

            const copy = new Uint8Array(photo.bytes.length);
            copy.set(photo.bytes);

            candidates.push({
                sourcePath: photo.sourcePath,
                sheetName: table.sheetName,
                rowNumber: location.rowNumber,
                columnNumber: location.columnNumber,
                originalName: photo.originalName,
                mimeType,
                blob: new Blob([copy.buffer], {
                    type: mimeType,
                }),
            });
        }
    }

    const grouped = new Map<string, ImportEmbeddedPhoto[]>();

    for (const photo of candidates) {
        const key = JSON.stringify([
            photo.sheetName,
            photo.rowNumber,
        ]);

        const group = grouped.get(key);

        if (group) {
            group.push(photo);
        } else {
            grouped.set(key, [photo]);
        }
    }

    for (const group of grouped.values()) {
        result.photos.push(...group);

        if (group.length > 1) {
            result.issues.push({
                code: "MULTIPLE_IMAGES",
                message:
                    "ამ რიგზე რამდენიმე ფოტო მოიძებნა. პროდუქტის ფოტოს არჩევა საჭიროა.",
                sheetName: group[0].sheetName,
                rowNumber: group[0].rowNumber,
            });
        }
    }

    return result;
}