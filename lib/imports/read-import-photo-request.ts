import "server-only";

import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";

import {
    validateImportPhotoUpload,
} from "./validate-import-photo-upload";

const MAX_REQUEST_BYTES = 384 * 1024;
const MAX_METADATA_BYTES = 16 * 1024;

function fail(message: string, status = 422): never {
    throw new OrderValidationError(message, status);
}

export async function readImportPhotoRequest(
    request: Request,
) {
    if (
        request.headers.get("origin") !==
        new URL(request.url).origin
    ) {
        fail("მოთხოვნის წყარო დაუშვებელია.", 403);
    }

    const contentType = request.headers.get("content-type");

    if (
        !contentType ||
        contentType.split(";")[0].trim().toLowerCase() !==
            "multipart/form-data"
    ) {
        fail("ფოტოს ატვირთვის მოთხოვნის ფორმატი არასწორია.", 415);
    }

    const contentLength = request.headers.get("content-length");

    if (contentLength !== null) {
        if (
            !/^\d+$/.test(contentLength) ||
            !Number.isSafeInteger(Number(contentLength))
        ) {
            fail("მოთხოვნის ზომა არასწორია.", 400);
        }

        if (Number(contentLength) > MAX_REQUEST_BYTES) {
            fail(
                "ფოტოს მოთხოვნა დასაშვებ ზომას აღემატება. ფოტო თავიდან უნდა შემცირდეს.",
                413,
            );
        }
    }

    if (!request.body) {
        fail("ფოტოს ატვირთვის მოთხოვნა ცარიელია.", 400);
    }

    const reader = request.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let totalBytes = 0;

    try {
        while (true) {
            const chunk = await reader.read();

            if (chunk.done) break;

            totalBytes += chunk.value.byteLength;

            if (totalBytes > MAX_REQUEST_BYTES) {
                await reader.cancel();

                fail(
                    "ფოტოს მოთხოვნა დასაშვებ ზომას აღემატება. ფოტო თავიდან უნდა შემცირდეს.",
                    413,
                );
            }

            const copy = new Uint8Array(chunk.value.byteLength);
            copy.set(chunk.value);
            chunks.push(copy.buffer);
        }
    } catch (cause: unknown) {
        if (cause instanceof OrderValidationError) throw cause;

        fail(
            "ფოტოს მოთხოვნის წაკითხვა შეწყდა. სცადე ხელახლა.",
            400,
        );
    } finally {
        reader.releaseLock();
    }

    let form: FormData;

    try {
        form = await new Response(new Blob(chunks), {
            headers: {
                "Content-Type": contentType,
            },
        }).formData();
    } catch {
        fail("ფოტოს მოთხოვნის შიგთავსი ვერ წავიკითხეთ.", 400);
    }

    for (const key of form.keys()) {
        if (
            key !== "metadata" &&
            key !== "photo" &&
            key !== "thumbnail"
        ) {
            fail("ფოტოს მოთხოვნა უცნობ ველს შეიცავს.");
        }
    }

    if (
        form.getAll("metadata").length !== 1 ||
        form.getAll("photo").length !== 1 ||
        form.getAll("thumbnail").length > 1
    ) {
        fail("ფოტოს მოთხოვნაში ველი აკლია ან მეორდება.");
    }

    const rawMetadata = form.get("metadata");
    const file = form.get("photo");
    const thumbnail = form.get("thumbnail");

    if (
        typeof rawMetadata !== "string" ||
        new TextEncoder().encode(rawMetadata).byteLength >
            MAX_METADATA_BYTES
    ) {
        fail("ფოტოს მდებარეობის მონაცემები არასწორია.");
    }

    if (!(file instanceof File)) {
        fail("ატვირთვის მოთხოვნაში ფოტო ვერ მოიძებნა.");
    }

    if (
        thumbnail !== null &&
        !(thumbnail instanceof File)
    ) {
        fail("ფოტოს მინიატურის ფორმატი არასწორია.");
    }

    let metadata: unknown;

    try {
        metadata = JSON.parse(rawMetadata) as unknown;
    } catch {
        fail("ფოტოს მდებარეობის მონაცემები ვერ წავიკითხეთ.");
    }

    const validated = await validateImportPhotoUpload({
        metadata,
        file,
        thumbnail,
    });

    return {
        ...validated,
        file,
        thumbnail,
    };
}