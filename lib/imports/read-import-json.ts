import {
    OrderValidationError,
} from "@/lib/orders/order-validation-error";

export async function readImportJson(
    request: Request,
    maxBytes = 16 * 1024 * 1024,
): Promise<unknown> {
    if (request.headers.get("origin") !== new URL(request.url).origin) {
        throw new OrderValidationError(
            "მოთხოვნის წყარო დაუშვებელია.",
            403,
        );
    }

    const contentType = request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();

    if (contentType !== "application/json") {
        throw new OrderValidationError(
            "მონაცემები JSON ფორმატით უნდა გამოიგზავნოს.",
            415,
        );
    }

    if (!request.body) {
        throw new OrderValidationError("მოთხოვნა ცარიელია.", 400);
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parts: string[] = [];
    let bytes = 0;

    try {
        while (true) {
            const chunk = await reader.read();

            if (chunk.done) break;

            bytes += chunk.value.byteLength;

            if (bytes > maxBytes) {
                await reader.cancel();

                throw new OrderValidationError(
                    "ამოკითხული მონაცემები ერთი მოთხოვნის დასაშვებ ზომას აღემატება. მონახაზი ამ მოთხოვნით არ შენახულა; მონაცემების ნაწილებად შენახვაა საჭირო.",
                    413,
                );
            }

            parts.push(decoder.decode(chunk.value, { stream: true }));
        }

        parts.push(decoder.decode());

        return JSON.parse(parts.join("")) as unknown;
    } catch (cause: unknown) {
        if (cause instanceof OrderValidationError) throw cause;

        throw new OrderValidationError(
            "მოთხოვნის მონაცემები სრულად ვერ წავიკითხეთ. ეს საწყის ფაილში ბიზნესინფორმაციის ნაკლებობას არ ნიშნავს.",
            400,
        );
    } finally {
        reader.releaseLock();
    }
}