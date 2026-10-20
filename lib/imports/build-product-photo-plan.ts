import type {
    ParsedImportFile,
} from "./import-file-types";

import type {
    ProductImportPlanItem,
} from "./build-product-import-plan";

import {
    readSavedImportPhotos,
    type SavedImportPhoto,
} from "./read-saved-import-photos";

import {
    readImportPhotoManifest,
    type ImportPhotoManifest,
} from "./import-photo-manifest";

import type {
    ProductPhotoDecision,
} from "./product-photo-decisions";

import {
    resolveProductPhotoDecision,
} from "./resolve-product-photo-decision";

export type ProductPhotoProblem = {
    recordKey: string;
    fileName: string;
    sheetName: string;
    rowNumber: number | null;
    message: string;
};

export function buildProductPhotoPlan({
    businessId,
    files,
    items,
    decisions = [],
}: {
    businessId: string;
    files: readonly {
        clientFileId: string;
        file: ParsedImportFile;
        photos: unknown;
        photoManifest?: unknown;
    }[];
    items: readonly ProductImportPlanItem[];
    decisions?: readonly ProductPhotoDecision[];
}) {
    const photosByRow = new Map<string, SavedImportPhoto[]>();

    const sourcesByFile = new Map<
        string,
        {
            format: ParsedImportFile["format"];
            sha256: string;
            manifest: ImportPhotoManifest | null;
        }
    >();

    for (const source of files) {
        if (sourcesByFile.has(source.clientFileId)) {
            throw new Error(
                "ფოტოების გეგმაში წყაროს ფაილის კოდი მეორდება.",
            );
        }

        sourcesByFile.set(source.clientFileId, {
            format: source.file.format,
            sha256: source.file.sha256,
            manifest: readImportPhotoManifest(
                source.photoManifest,
                source.file,
            ),
        });

        const photos = readSavedImportPhotos(
            source.photos,
            businessId,
            source.file,
        );

        for (const photo of photos) {
            const key = JSON.stringify([
                source.clientFileId,
                photo.sheetName,
                photo.rowNumber,
            ]);

            const group = photosByRow.get(key);

            if (group) {
                group.push(photo);
            } else {
                photosByRow.set(key, [photo]);
            }
        }
    }

    const photosByRecordKey = new Map<string, SavedImportPhoto>();
    const skippedRecordKeys = new Set<string>();
    const problems: ProductPhotoProblem[] = [];
    const reported = new Set<string>();

    for (const item of items) {
        // არსებულ პროდუქტთან დაკავშირება მის ფოტოს არ ცვლის.
        if (item.action !== "CREATE") continue;

        const record = item.record;
        const source = sourcesByFile.get(record.fileId);

        if (!source) {
            throw new Error(
                "პროდუქტის ფოტოს წყაროს ფაილი ვერ მოიძებნა.",
            );
        }

        function report(
            message: string,
            token: string,
            rowNumber: number | null = record.rowNumber,
        ) {
            if (reported.has(token)) return;

            reported.add(token);

            problems.push({
                recordKey: record.key,
                fileName: record.fileName,
                sheetName: record.sheetName,
                rowNumber,
                message,
            });
        }

        const rowKey = JSON.stringify([
            record.fileId,
            record.sheetName,
            record.rowNumber,
        ]);

        const photos = photosByRow.get(rowKey) ?? [];

        const resolved = resolveProductPhotoDecision({
            decisions,
            clientFileId: record.fileId,
            sha256: source.sha256,
            sheetName: record.sheetName,
            rowNumber: record.rowNumber,
        });

        if (resolved.stale) {
            report(
                "ფოტოს წინა არჩევანი წყაროს მიმდინარე ვერსიას აღარ ემთხვევა. აირჩიე ფოტო ან მისი გამოტოვება ხელახლა.",
                JSON.stringify([rowKey, "STALE_DECISION"]),
            );
            continue;
        }

        const decision = resolved.decision;

        if (
            decision?.action === "SKIP_ALL" ||
            decision?.action === "SKIP"
        ) {
            skippedRecordKeys.add(record.key);
            continue;
        }

        if (decision?.action === "USE") {
            const selected = photos.filter(photo =>
                photo.sourcePath === decision.sourcePath &&
                photo.columnNumber === decision.columnNumber,
            );

            if (selected.length !== 1) {
                report(
                    "არჩეული ფოტო მონახაზში შენახული არ არის ან მისი კავშირი ერთმნიშვნელოვანი არ არის. შეინახე მონახაზი და არჩევანი გადაამოწმე.",
                    JSON.stringify([rowKey, "SELECTED_PHOTO_MISSING"]),
                );
            } else {
                photosByRecordKey.set(record.key, selected[0]);
            }

            continue;
        }

        const manifest = source.manifest;

        if (manifest === null && source.format !== "csv") {
            report(
                "ამ ძველ მონახაზში წყაროს ფოტოების საწყისი სია შენახული არ არის. ამიტომ ვერ ვადასტურებთ, ყველა ფოტო გადმოვიდა თუ არა. აირჩიე ორიგინალი ფაილი ახალ მონახაზში ხელახლა.",
                JSON.stringify([record.fileId, "MISSING_MANIFEST"]),
                null,
            );
        }

        if (manifest !== null) {
            for (const issue of manifest.issues) {
                if (
                    issue.sheetName !== null &&
                    issue.sheetName !== record.sheetName
                ) {
                    continue;
                }

                if (
                    issue.rowNumber !== null &&
                    issue.rowNumber !== record.rowNumber
                ) {
                    continue;
                }

                report(
                    `წყაროს ფოტოს წაკითხვა გადასამოწმებელია: ${issue.message}`,
                    JSON.stringify([
                        record.fileId,
                        "SOURCE_ISSUE",
                        issue.sheetName,
                        issue.rowNumber,
                        issue.code,
                        issue.message,
                    ]),
                    issue.rowNumber,
                );
            }

            const expected = manifest.sources.filter(photo =>
                photo.sheetName === record.sheetName &&
                photo.rowNumber === record.rowNumber,
            );

            const missing = expected.filter(photo =>
                !photos.some(saved =>
                    saved.sourcePath === photo.sourcePath &&
                    saved.columnNumber === photo.columnNumber,
                ),
            );

            if (missing.length > 0) {
                report(
                    `წყაროში ამ რიგზე ${missing.length} ფოტო მოიძებნა, რომელიც მონახაზში შენახული არ არის. შესაძლოა დამუშავება ან ატვირთვა შეწყდა. თუ გვერდი ჯერ გახსნილია, სცადე მონახაზის ხელახლა შენახვა. თუ ხელახლა გახსენი და ფოტო აღარ გაქვს გვერდზე, ორიგინალი ფაილი ახალ მონახაზში აირჩიე.`,
                    JSON.stringify([rowKey, "MISSING_UPLOAD"]),
                );
            }
        }

        if (photos.length > 1) {
            report(
                "ამ პროდუქტის რიგზე რამდენიმე შენახული ფოტო მოიძებნა. საჭიროა პროდუქტის ფოტოს არჩევა.",
                JSON.stringify([rowKey, "MULTIPLE_PHOTOS"]),
            );
        } else if (photos.length === 1) {
            photosByRecordKey.set(record.key, photos[0]);
        } else if (record.data?.imageReference != null) {
            report(
                "წყაროში ფოტოს მითითება არსებობს, მაგრამ შესაბამისი ფოტო მონახაზში შენახული არ არის. საჭიროა ფოტოს დამატება ან მისი გამოტოვების დადასტურება.",
                JSON.stringify([rowKey, "IMAGE_REFERENCE"]),
            );
        }
    }

    return {
        photosByRecordKey,
        skippedRecordKeys,
        problems,
    };
}