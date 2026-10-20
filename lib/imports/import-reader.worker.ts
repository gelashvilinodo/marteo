import type {
    ImportWorkerRequest,
    ImportWorkerResponse,
} from "./import-worker-types";

import type { ImportPhotoReadResult } from "./import-photo-types";

// ცალკე ტიპი, რათა პროექტის DOM ტიპებს
// WebWorker-ის გლობალური ტიპები არ შევურიოთ.
const workerScope = globalThis as unknown as {
    onmessage:
    | ((event: MessageEvent<ImportWorkerRequest>) => void)
    | null;
    postMessage: (message: ImportWorkerResponse) => void;
};

let running = false;

async function read(request: ImportWorkerRequest) {
    try {
        const { file, csvOptions } = request;

        const extension = file.name
            .split(".")
            .pop()
            ?.toLowerCase();

        if (
            extension !== "xlsx" &&
            extension !== "csv" &&
            extension !== "numbers"
        ) {
            throw new Error(
                "აირჩიე Excel (.xlsx), CSV ან Apple Numbers ფაილი.",
            );
        }

        workerScope.postMessage({
            type: "PROGRESS",
            stage: "READING",
        });

        const buffer = await file.arrayBuffer();

        workerScope.postMessage({
            type: "PROGRESS",
            stage: "PARSING",
        });

        let result;

        let photoResult: ImportPhotoReadResult = {
            photos: [],
            issues: [],
        };

        if (extension === "csv") {
            const { readImportCsv } = await import(
                "./read-import-csv"
            );

            result = await readImportCsv(
                file.name,
                buffer,
                csvOptions,
            );
        } else {
            const { readImportWorkbook } = await import(
                "./read-import-workbook"
            );

            result = await readImportWorkbook(
                file.name,
                buffer,
            );
        }

        if (extension === "xlsx") {
            try {
                const { readXlsxEmbeddedPhotos } = await import(
                    "./read-xlsx-embedded-photos"
                );

                photoResult = readXlsxEmbeddedPhotos(buffer);
            } catch (cause: unknown) {
                photoResult = {
                    photos: [],
                    issues: [{
                        code: "BROKEN_IMAGE",
                        message:
                            "ცხრილის მონაცემები წაიკითხა, მაგრამ ფოტოების ამოღება ვერ დასრულდა. " +
                            (
                                cause instanceof Error
                                    ? cause.message
                                    : "საჭიროა ფოტოების ხელახლა დამატება."
                            ),
                        sheetName: null,
                        rowNumber: null,
                    }],
                };
            }
        }

        if (extension === "numbers") {
            try {
                const { readNumbersEmbeddedPhotos } = await import(
                    "./read-numbers-embedded-photos"
                );

                photoResult = readNumbersEmbeddedPhotos(
                    buffer,
                    result.sheets.map(sheet => sheet.name),
                );
            } catch (cause: unknown) {
                photoResult = {
                    photos: [],
                    issues: [{
                        code: "BROKEN_IMAGE",
                        message:
                            "ცხრილის მონაცემები წაკითხულია, მაგრამ Numbers-ის ფოტოების ამოღება ვერ დასრულდა. " +
                            (
                                cause instanceof Error
                                    ? cause.message
                                    : "საჭიროა ფოტოების გადამოწმება."
                            ),
                        sheetName: null,
                        rowNumber: null,
                    }],
                };
            }
        }

        workerScope.postMessage({
            type: "SUCCESS",
            result,
            photoResult,
        });
    } catch (cause: unknown) {
        workerScope.postMessage({
            type: "ERROR",
            message:
                cause instanceof Error
                    ? cause.message
                    : "ფაილის წაკითხვა ვერ მოხერხდა.",
        });
    } finally {
        running = false;
    }
}

workerScope.onmessage = event => {
    if (running) return;

    running = true;
    void read(event.data);
};