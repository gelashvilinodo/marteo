import "server-only";

import type { PurchaseImageChange } from "./save-purchase";

export class PurchaseFormError extends Error {
    constructor(
        message: string,
        public status = 400,
    ) {
        super(message);
        this.name = "PurchaseFormError";
    }
}

export async function readPurchaseForm(request: Request) {
    const contentType = request.headers.get("content-type");

    if (
        contentType?.split(";")[0].trim().toLowerCase() !==
        "multipart/form-data"
    ) {
        throw new PurchaseFormError(
            "მოთხოვნა FormData ფორმატით უნდა გამოიგზავნოს.",
            415,
        );
    }

    const reader = request.body?.getReader();

    if (!reader) {
        throw new PurchaseFormError("მოთხოვნის მონაცემები ცარიელია.");
    }

    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            total += value.byteLength;

            if (total > 25 * 1024 * 1024) {
                await reader.cancel();

                throw new PurchaseFormError(
                    "მონაცემებისა და ფოტოების საერთო ზომა 25 MB-ს აღემატება.",
                    413,
                );
            }

            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    let formData: FormData;

    try {
        formData = await new Response(bytes.buffer, {
            headers: { "Content-Type": contentType! },
        }).formData();
    } catch {
        throw new PurchaseFormError(
            "გამოგზავნილი მონაცემები ვერ დამუშავდა.",
        );
    }

    const payloadValues = formData.getAll("payload");

    if (
        payloadValues.length !== 1 ||
        typeof payloadValues[0] !== "string"
    ) {
        throw new PurchaseFormError("პარტიის მონაცემები არასწორია.");
    }

    if (
        new TextEncoder().encode(payloadValues[0]).byteLength >
        1024 * 1024
    ) {
        throw new PurchaseFormError(
            "პარტიის ტექსტური მონაცემები ზედმეტად დიდია.",
            413,
        );
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(payloadValues[0]);
    } catch {
        throw new PurchaseFormError(
            "პარტიის მონაცემების ფორმატი არასწორია.",
        );
    }

    if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        throw new PurchaseFormError("პარტიის მონაცემები არასწორია.");
    }

    const payload = parsed as Record<string, unknown>;

    if (
        typeof payload.purchase !== "object" ||
        payload.purchase === null ||
        Array.isArray(payload.purchase)
    ) {
        throw new PurchaseFormError("პარტიის მონაცემები არასწორია.");
    }

    const purchase = payload.purchase as Record<string, unknown>;

    if (
        !Array.isArray(purchase.items) ||
        purchase.items.length === 0 ||
        purchase.items.length > 200
    ) {
        throw new PurchaseFormError(
            "პარტიაში უნდა იყოს 1-დან 200-მდე ჩანაწერი.",
        );
    }

    if (
        !Array.isArray(payload.imageActions) ||
        payload.imageActions.length !== purchase.items.length
    ) {
        throw new PurchaseFormError(
            "პროდუქტებისა და ფოტოების მონაცემები ერთმანეთს არ ემთხვევა.",
        );
    }

    const allowedFields = new Set(["payload"]);

    const imageChanges: PurchaseImageChange[] =
        payload.imageActions.map((action, index) => {
            const fieldName = `image-${index}`;

            if (action === "keep" || action === "remove") {
                if (formData.has(fieldName)) {
                    throw new PurchaseFormError(
                        `პროდუქტი ${index + 1}: ფოტოს მოქმედება და ფაილი ერთმანეთს არ ემთხვევა.`,
                    );
                }

                return { action };
            }

            if (action !== "upload") {
                throw new PurchaseFormError(
                    `პროდუქტი ${index + 1}: ფოტოს მოქმედება არასწორია.`,
                );
            }

            allowedFields.add(fieldName);

            const files = formData.getAll(fieldName);
            const file = files[0];

            if (
                files.length !== 1 ||
                !(file instanceof File) ||
                file.size === 0
            ) {
                throw new PurchaseFormError(
                    `პროდუქტი ${index + 1}: ფოტო ვერ მოიძებნა.`,
                );
            }

            if (file.size > 5 * 1024 * 1024) {
                throw new PurchaseFormError(
                    `პროდუქტი ${index + 1}: ფოტოს მაქსიმალური ზომაა 5 MB.`,
                    413,
                );
            }

            return { action: "upload", file };
        });

    for (const key of formData.keys()) {
        if (!allowedFields.has(key)) {
            throw new PurchaseFormError(
                "მოთხოვნა შეიცავს გაუთვალისწინებელ ველს.",
            );
        }
    }

    return {
        payload,
        purchase,
        imageChanges,
    };
}