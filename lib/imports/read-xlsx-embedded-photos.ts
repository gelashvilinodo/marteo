import type {
    ImportEmbeddedPhoto,
    ImportPhotoReadResult,
} from "./import-photo-types";
import { readXlsxPhotoArchive } from "./read-xlsx-photo-archive";
import {
    asXmlArray,
    asXmlObject,
    readXlsxPhotoRelationships,
    xmlString,
} from "./read-xlsx-photo-relationships";

function readIndex(value: unknown): number | null {
    const text = xmlString(value);

    if (text === null || !/^\d+$/.test(text)) return null;

    const index = Number(text);

    return Number.isSafeInteger(index) ? index : null;
}

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

export function readXlsxEmbeddedPhotos(
    buffer: ArrayBuffer,
): ImportPhotoReadResult {
    const archive = readXlsxPhotoArchive(buffer);
    const result: ImportPhotoReadResult = {
        photos: [],
        issues: [],
    };

    const workbookDocument = asXmlObject(
        archive.readXml("xl/workbook.xml"),
    );
    const workbook = asXmlObject(workbookDocument?.workbook);
    const sheets = asXmlObject(workbook?.sheets);

    if (sheets === null) {
        throw new Error(
            "Excel-ში ფოტოების შესაბამისი ფურცლები ვერ განვსაზღვრეთ.",
        );
    }

    const workbookLinks = readXlsxPhotoRelationships(
        archive,
        "xl/workbook.xml",
    );

    const candidates: ImportEmbeddedPhoto[] = [];
    const referencedMedia = new Set<string>();

    for (const sheetValue of asXmlArray(sheets.sheet)) {
        const sheet = asXmlObject(sheetValue);
        const sheetName = xmlString(sheet?.["@_name"]);
        const relationshipId = xmlString(sheet?.["@_id"]);
        const sheetLink = relationshipId
            ? workbookLinks.get(relationshipId)
            : undefined;

        if (
            !sheetName ||
            !sheetLink?.targetPath ||
            sheetLink.external ||
            !sheetLink.type.endsWith("/worksheet")
        ) {
            continue;
        }

        const sheetDocument = asXmlObject(
            archive.readXml(sheetLink.targetPath),
        );
        const worksheet = asXmlObject(sheetDocument?.worksheet);
        const sheetLinks = readXlsxPhotoRelationships(
            archive,
            sheetLink.targetPath,
        );

        for (const drawingValue of asXmlArray(worksheet?.drawing)) {
            const drawing = asXmlObject(drawingValue);
            const drawingId = xmlString(drawing?.["@_id"]);
            const drawingLink = drawingId
                ? sheetLinks.get(drawingId)
                : undefined;

            if (
                !drawingLink?.targetPath ||
                drawingLink.external ||
                !drawingLink.type.endsWith("/drawing")
            ) {
                result.issues.push({
                    code: "UNRESOLVED_IMAGE_POSITION",
                    message:
                        "ფურცლის ერთ-ერთი ნახაზის კავშირი ვერ წავიკითხეთ.",
                    sheetName,
                    rowNumber: null,
                });
                continue;
            }

            const drawingDocument = asXmlObject(
                archive.readXml(drawingLink.targetPath),
            );
            const drawingRoot = asXmlObject(
                drawingDocument?.wsDr,
            );
            const drawingLinks = readXlsxPhotoRelationships(
                archive,
                drawingLink.targetPath,
            );

            const anchors = [
                ...asXmlArray(drawingRoot?.oneCellAnchor),
                ...asXmlArray(drawingRoot?.twoCellAnchor),
                ...asXmlArray(drawingRoot?.absoluteAnchor),
            ];

            for (const anchorValue of anchors) {
                const anchor = asXmlObject(anchorValue);
                const picture = asXmlObject(anchor?.pic);

                // დიაგრამებსა და ჩვეულებრივ ფიგურებს ვტოვებთ.
                if (picture === null) continue;

                const from = asXmlObject(anchor?.from);
                const rowIndex = readIndex(from?.row);
                const columnIndex = readIndex(from?.col);
                const rowNumber = rowIndex === null
                    ? null
                    : rowIndex + 1;

                const fill = asXmlObject(picture.blipFill);
                const blip = asXmlObject(fill?.blip);
                const imageId = xmlString(blip?.["@_embed"]);
                const imageLink = imageId
                    ? drawingLinks.get(imageId)
                    : undefined;

                if (
                    !imageLink?.targetPath ||
                    imageLink.external ||
                    !imageLink.type.endsWith("/image")
                ) {
                    result.issues.push({
                        code: "BROKEN_IMAGE",
                        message:
                            "ფოტო ფაილში ჩაშენებული არ არის ან მისი კავშირი დაზიანებულია.",
                        sheetName,
                        rowNumber,
                    });
                    continue;
                }

                const sourcePath = imageLink.targetPath;
                referencedMedia.add(sourcePath);

                if (
                    rowIndex === null ||
                    columnIndex === null ||
                    rowIndex >= 1_048_576 ||
                    columnIndex >= 16_384
                ) {
                    result.issues.push({
                        code: "UNRESOLVED_IMAGE_POSITION",
                        message:
                            "ფოტო მოიძებნა, მაგრამ შესაბამისი რიგი ზუსტად ვერ განვსაზღვრეთ.",
                        sheetName,
                        rowNumber: null,
                    });
                    continue;
                }

                const bytes = archive.readBytes(sourcePath);
                const mimeType = bytes ? imageMime(bytes) : null;

                if (!bytes || mimeType === null) {
                    result.issues.push({
                        code: bytes
                            ? "UNSUPPORTED_IMAGE"
                            : "BROKEN_IMAGE",
                        message: bytes
                            ? "ჩაშენებული ფოტოს ფორმატი ჯერ არ არის მხარდაჭერილი."
                            : "ჩაშენებული ფოტოს ფაილი ვერ მოიძებნა.",
                        sheetName,
                        rowNumber,
                    });
                    continue;
                }

                const copy = new Uint8Array(bytes.length);
                copy.set(bytes);

                candidates.push({
                    sourcePath,
                    sheetName,
                    rowNumber: rowIndex + 1,
                    columnNumber: columnIndex + 1,
                    originalName:
                        sourcePath.split("/").pop() ?? "photo",
                    mimeType,
                    blob: new Blob([copy.buffer], {
                        type: mimeType,
                    }),
                });
            }
        }
    }

    const rowCounts = new Map<string, number>();

    for (const photo of candidates) {
        const key = JSON.stringify([
            photo.sheetName,
            photo.rowNumber,
        ]);

        rowCounts.set(key, (rowCounts.get(key) ?? 0) + 1);
    }

    const reportedRows = new Set<string>();

    for (const photo of candidates) {
        const key = JSON.stringify([
            photo.sheetName,
            photo.rowNumber,
        ]);

        if ((rowCounts.get(key) ?? 0) > 1) {
            if (!reportedRows.has(key)) {
                reportedRows.add(key);
                result.issues.push({
                    code: "MULTIPLE_IMAGES",
                    message:
                        "ამ რიგზე რამდენიმე ფოტო მოიძებნა. პროდუქტის ფოტოს არჩევა საჭიროა.",
                    sheetName: photo.sheetName,
                    rowNumber: photo.rowNumber,
                });
            }

        }

        result.photos.push(photo);
    }

    const unassignedCount = archive.paths.filter(
        path =>
            path.startsWith("xl/media/") &&
            !path.endsWith("/") &&
            !referencedMedia.has(path),
    ).length;

    if (unassignedCount > 0) {
        result.issues.push({
            code: "UNRESOLVED_IMAGE_POSITION",
            message:
                `${unassignedCount} მედია ფაილი მოიძებნა, რომლის პროდუქტთან კავშირი ვერ განისაზღვრა.`,
            sheetName: null,
            rowNumber: null,
        });
    }

    return result;
}