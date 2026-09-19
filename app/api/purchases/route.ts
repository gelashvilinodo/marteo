import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import {
    savePurchase,
    type PurchaseImageChange,
} from "@/lib/purchases/save-purchase";
import { PurchaseValidationError } from "@/lib/purchases/validate-purchases";
import { ProductImageError } from "@/lib/purchases/product-images";

const MAX_REQUEST_SIZE = 25 * 1024 * 1024;
const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const MAX_PAYLOAD_SIZE = 1024 * 1024;

class RequestError extends Error {
    constructor(
        message: string,
        public status: number = 400,
    ) {
        super(message);
        this.name = "RequestError";
    }
}

function errorResponse(message: string, status: number) {
    return NextResponse.json(
        { error: message },
        {
            status,
            headers: { "Cache-Control": "no-store" },
        },
    );
}

async function readFormData(request: Request): Promise<FormData> {
    const contentType = request.headers.get("content-type");

    if (
        !contentType
            ?.toLowerCase()
            .startsWith("multipart/form-data;")
    ) {
        throw new RequestError(
            "მონაცემების გაგზავნის ფორმატი არასწორია.",
        );
    }

    const reader = request.body?.getReader();

    if (!reader) {
        throw new RequestError("მოთხოვნის მონაცემები ცარიელია.");
    }

    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            total += value.byteLength;

            if (total > MAX_REQUEST_SIZE) {
                await reader.cancel();

                throw new RequestError(
                    "პარტიის მონაცემებისა და ფოტოების საერთო ზომა 25 MB-ს აღემატება.",
                    413,
                );
            }

            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    const body = new Uint8Array(total);
    let offset = 0;

    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }

    try {
        return await new Response(body.buffer, {
            headers: { "Content-Type": contentType },
        }).formData();
    } catch {
        throw new RequestError(
            "გამოგზავნილი მონაცემები ვერ დამუშავდა.",
        );
    }
}

function readPayload(formData: FormData) {
    const values = formData.getAll("payload");

    if (
        values.length !== 1 ||
        typeof values[0] !== "string"
    ) {
        throw new RequestError("პარტიის მონაცემები არასწორია.");
    }

    if (
        new TextEncoder().encode(values[0]).byteLength >
        MAX_PAYLOAD_SIZE
    ) {
        throw new RequestError(
            "პარტიის ტექსტური მონაცემები ზედმეტად დიდია.",
            413,
        );
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(values[0]);
    } catch {
        throw new RequestError(
            "პარტიის მონაცემების ფორმატი არასწორია.",
        );
    }

    if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        throw new RequestError("პარტიის მონაცემები არასწორია.");
    }

    return parsed as Record<string, unknown>;
}

export async function POST(request: Request) {
    try {
        const origin = request.headers.get("origin");

        if (origin !== new URL(request.url).origin) {
            return errorResponse(
                "მოთხოვნის წყარო დაუშვებელია.",
                403,
            );
        }

        const user = await getCurrentUser();

        if (!user) {
            return errorResponse(
                "პარტიის დასამატებლად შედი ანგარიშში.",
                401,
            );
        }

        const formData = await readFormData(request);
        const payload = readPayload(formData);

        if (typeof payload.requestId !== "string") {
            throw new RequestError("მოთხოვნის კოდი არასწორია.");
        }

        if (
            typeof payload.purchase !== "object" ||
            payload.purchase === null ||
            Array.isArray(payload.purchase)
        ) {
            throw new RequestError("პარტიის მონაცემები არასწორია.");
        }

        const purchase = payload.purchase as Record<string, unknown>;

        if (
            !Array.isArray(purchase.items) ||
            purchase.items.length === 0 ||
            purchase.items.length > 200
        ) {
            throw new RequestError(
                "პარტიაში უნდა იყოს 1-დან 200-მდე ჩანაწერი.",
            );
        }

        if (
            !Array.isArray(payload.imageActions) ||
            payload.imageActions.length !== purchase.items.length
        ) {
            throw new RequestError(
                "პროდუქტებისა და ფოტოების რაოდენობა ერთმანეთს არ ემთხვევა.",
            );
        }

        const allowedFields = new Set<string>(["payload"]);

        const imageChanges: PurchaseImageChange[] =
            payload.imageActions.map((action, index) => {
                const fieldName = `image-${index}`;

                if (action === "keep" || action === "remove") {
                    if (formData.has(fieldName)) {
                        throw new RequestError(
                            `პროდუქტი ${index + 1}: ფოტოს მოქმედება და ფაილი ერთმანეთს არ ემთხვევა.`,
                        );
                    }

                    return { action };
                }

                if (action !== "upload") {
                    throw new RequestError(
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
                    throw new RequestError(
                        `პროდუქტი ${index + 1}: ფოტო ვერ მოიძებნა.`,
                    );
                }

                if (file.size > MAX_PHOTO_SIZE) {
                    throw new RequestError(
                        `პროდუქტი ${index + 1}: ფოტოს მაქსიმალური ზომაა 5 MB.`,
                        413,
                    );
                }

                return {
                    action: "upload",
                    file,
                };
            });

        for (const key of formData.keys()) {
            if (!allowedFields.has(key)) {
                throw new RequestError(
                    "მოთხოვნა შეიცავს გაუთვალისწინებელ ველს.",
                );
            }
        }

        const result = await savePurchase(
            purchase,
            payload.requestId,
            imageChanges,
        );

        return NextResponse.json(
            {
                success: true,
                purchase: result,
            },
            {
                status: 200,
                headers: { "Cache-Control": "no-store" },
            },
        );
    } catch (error) {
        if (error instanceof RequestError) {
            return errorResponse(error.message, error.status);
        }

        if (error instanceof PurchaseValidationError) {
            return errorResponse(error.message, 400);
        }

        if (error instanceof ProductImageError) {
            return errorResponse(error.message, 422);
        }

        console.error("Purchase request failed", {
            errorType:
                error instanceof Error
                    ? error.name
                    : "UnknownError",
        });

        return errorResponse(
            "შენახვის შედეგი ვერ დადასტურდა. სცადე ხელახლა იმავე ფორმიდან.",
            500,
        );
    }
}