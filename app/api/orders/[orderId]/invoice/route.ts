import { buildInvoice } from "@/lib/orders/build-invoice";
import { readInvoiceOrder } from "@/lib/orders/read-invoice-order";
import { OrderValidationError } from "@/lib/orders/order-validation-error";

import { cookies } from "next/headers";

function json(data: unknown, status = 200) {
    return Response.json(data, {
        status,
        headers: {
            "Cache-Control": "private, no-store",
        },
    });
}

export async function GET(
    request: Request,
    context: {
        params: Promise<{ orderId: string }>;
    },
) {
    const startedAt = performance.now();
    let stageStartedAt = startedAt;
    const diagnosticsEnabled = typeof process !== "undefined" && process.env.MARTEO_PERFORMANCE_DIAGNOSTICS === "1";

    function measure(stage: string) {
        if (!diagnosticsEnabled) return;
        const now = performance.now();

        console.info("Invoice timing", {
            stage,
            elapsedMs: Math.round((now - stageStartedAt) * 100) / 100,
            totalElapsedMs: Math.round((now - startedAt) * 100) / 100,
        });

        stageStartedAt = now;
    }

    try {
        const { orderId } = await context.params;
        const token = (await cookies()).get("marteo_session")?.value;
        const order = await readInvoiceOrder(token, orderId);

        measure("order-query");

        if (!order) {
            return json(
                {
                    success: false,
                    message: "შეკვეთა ვერ მოიძებნა.",
                },
                404,
            );
        }

        const invoice = buildInvoice(order, request.url);
        measure("invoice-calculation");

        const response = json({ success: true, invoice });
        measure("response-serialization");

        return response;
    } catch (error: unknown) {
        // ბმულის დაცულ კოდს ლოგებში არ ვბეჭდავთ.
        console.error(
            "Invoice preparation failed",
            error instanceof Error
                ? error.name
                : "UnknownError",
        );

        return json(
            {
                success: false,
                message: error instanceof OrderValidationError
                    ? error.message
                    : "ინვოისის მომზადება ვერ მოხერხდა.",
            },
            error instanceof OrderValidationError ? error.status : 500,
        );
    }
}
