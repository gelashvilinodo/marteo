import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import {
    receivePurchase,
    ReceivePurchaseError,
} from "@/lib/purchases/receive-purchase";

const MAX_BODY_SIZE = 2 * 1024 * 1024;

function errorResponse(message: string, status: number) {
    return NextResponse.json(
        { success: false, error: message },
        {
            status,
            headers: { "Cache-Control": "no-store" },
        },
    );
}

async function readJson(request: Request): Promise<unknown> {
    const contentType = request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();

    if (contentType !== "application/json") {
        throw new ReceivePurchaseError(
            "მონაცემები JSON ფორმატით უნდა გამოიგზავნოს.",
            415,
        );
    }

    const reader = request.body?.getReader();

    if (!reader) {
        throw new ReceivePurchaseError("მოთხოვნის მონაცემები ცარიელია.");
    }

    const chunks: Uint8Array[] = [];
    let total = 0;

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (done) break;

            total += value.byteLength;

            if (total > MAX_BODY_SIZE) {
                await reader.cancel();

                throw new ReceivePurchaseError(
                    "გამოგზავნილი მონაცემები ზედმეტად დიდია.",
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

    try {
        return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
        throw new ReceivePurchaseError(
            "გამოგზავნილი მონაცემების ფორმატი არასწორია.",
        );
    }
}

export async function POST(
    request: Request,
    context: {
        params: Promise<{ purchaseId: string }>;
    },
) {
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
                "პარტიის მისაღებად შედი ანგარიშში.",
                401,
            );
        }

        const { purchaseId } = await context.params;
        const payload = await readJson(request);

        if (
            typeof payload !== "object" ||
            payload === null ||
            Array.isArray(payload)
        ) {
            return errorResponse(
                "მიღების მონაცემების ფორმატი არასწორია.",
                400,
            );
        }

        const body = payload as Record<string, unknown>;

        const purchase = await receivePurchase(
            purchaseId,
            body.items,
        );

        return NextResponse.json(
            {
                success: true,
                purchase,
            },
            {
                headers: { "Cache-Control": "no-store" },
            },
        );
    } catch (error) {
        if (error instanceof ReceivePurchaseError) {
            return errorResponse(error.message, error.status);
        }

        console.error("Purchase receipt failed", error);

        return errorResponse(
            "მიღების შედეგი ვერ დადასტურდა. იგივე მონაცემებით სცადე ხელახლა.",
            500,
        );
    }
}