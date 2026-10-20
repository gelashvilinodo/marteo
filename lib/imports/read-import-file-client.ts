"use client";

import type { ParsedImportFile } from "./import-file-types";
import type { ImportPhotoReadResult } from "./import-photo-types";

import type {
    ImportCsvOptions,
    ImportReadStage,
    ImportWorkerRequest,
    ImportWorkerResponse,
} from "./import-worker-types";

type Options = {
    signal?: AbortSignal;
    csvOptions?: ImportCsvOptions;
    onStage?: (stage: ImportReadStage) => void;
    onPhotos?: (result: ImportPhotoReadResult) => void;
};

export function readImportFile(
    file: File,
    options: Options = {},
): Promise<ParsedImportFile> {
    return new Promise((resolve, reject) => {
        if (options.signal?.aborted) {
            reject(new DOMException(
                "ფაილის წაკითხვა გაუქმებულია.",
                "AbortError",
            ));
            return;
        }

        let worker: Worker;

        try {
            worker = new Worker(
                new URL(
                    "./import-reader.worker.ts",
                    import.meta.url,
                ),
                { type: "module" },
            );
        } catch {
            reject(new Error(
                "ფაილის დამუშავება ვერ დაიწყო. განაახლე გვერდი და სცადე ხელახლა.",
            ));
            return;
        }

        let settled = false;

        function cleanup() {
            options.signal?.removeEventListener("abort", abort);
            worker.terminate();
        }

        function fail(error: Error) {
            if (settled) return;

            settled = true;
            cleanup();
            reject(error);
        }

        function abort() {
            fail(new DOMException(
                "ფაილის წაკითხვა გაუქმებულია.",
                "AbortError",
            ));
        }

        worker.onmessage = (
            event: MessageEvent<ImportWorkerResponse>,
        ) => {
            if (settled) return;

            const message = event.data;

            if (message.type === "PROGRESS") {
                // UI-ის callback-ის შეცდომამ Worker არ უნდა დატოვოს.
                try {
                    options.onStage?.(message.stage);
                } catch {
                    fail(new Error(
                        "დამუშავების პროგრესის ჩვენება ვერ მოხერხდა.",
                    ));
                }
                return;
            }

            if (message.type === "ERROR") {
                fail(new Error(message.message));
                return;
            }

            if (message.type === "SUCCESS") {
                try {
                    options.onPhotos?.(message.photoResult);
                } catch {
                    fail(new Error(
                        "ფოტოების მიღება ვერ დასრულდა. აირჩიე ფაილი ხელახლა.",
                    ));
                    return;
                }

                settled = true;
                cleanup();
                resolve(message.result);
            }
        };

        worker.onerror = event => {
            event.preventDefault();

            fail(new Error(
                "ფაილის დამუშავება შეწყდა. სცადე ხელახლა; თუ განმეორდა, ფაილი დამატებით შესამოწმებელია.",
            ));
        };

        worker.onmessageerror = () => {
            fail(new Error(
                "დამუშავებული ფაილის შედეგის მიღება ვერ მოხერხდა.",
            ));
        };

        options.signal?.addEventListener(
            "abort",
            abort,
            { once: true },
        );

        // ფაილი Worker-ს გადაეცემა; მთავარი გვერდი მას არ შიფრავს.
        const request: ImportWorkerRequest = {
            file,
            csvOptions: options.csvOptions,
        };

        try {
            worker.postMessage(request);
        } catch {
            fail(new Error(
                "ფაილის დამუშავებაზე გადაცემა ვერ მოხერხდა.",
            ));
        }
    });
}