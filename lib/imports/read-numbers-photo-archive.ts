import { unzipSync } from "fflate";

export type NumbersPhotoArchive = {
    paths: readonly string[];
    readBytes: (path: string) => Uint8Array | null;
};

const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

export function readNumbersPhotoArchive(
    buffer: ArrayBuffer,
): NumbersPhotoArchive {
    let entryCount = 0;
    let totalBytes = 0;

    const files = unzipSync(new Uint8Array(buffer), {
        filter(entry) {
            entryCount++;

            if (entryCount > MAX_ENTRIES) {
                throw new Error(
                    "Numbers-ის ფაილი ზედმეტად ბევრ შიდა ფაილს შეიცავს.",
                );
            }

            const relevant =
                (
                    entry.name.startsWith("Index/") &&
                    entry.name.endsWith(".iwa")
                ) ||
                (
                    entry.name.startsWith("Data/") &&
                    !entry.name.endsWith("/")
                );

            if (!relevant) return false;

            if (
                !Number.isSafeInteger(entry.originalSize) ||
                entry.originalSize < 0 ||
                entry.originalSize > MAX_ENTRY_BYTES
            ) {
                throw new Error(
                    "Numbers-ში ჩაშენებული ერთ-ერთი ფაილი დასამუშავებლად ძალიან დიდია.",
                );
            }

            totalBytes += entry.originalSize;

            if (totalBytes > MAX_TOTAL_BYTES) {
                throw new Error(
                    "Numbers-ის შიდა მონაცემების საერთო ზომა ძალიან დიდია. დაყავი ფაილი რამდენიმე ნაწილად.",
                );
            }

            return true;
        },
    });

    if (
        !Object.prototype.hasOwnProperty.call(
            files,
            "Index/Document.iwa",
        )
    ) {
        throw new Error(
            "Numbers-ის დოკუმენტის შიდა სტრუქტურა ვერ მოიძებნა.",
        );
    }

    return {
        paths: Object.keys(files),

        readBytes(path) {
            return Object.prototype.hasOwnProperty.call(files, path)
                ? files[path]
                : null;
        },
    };
}