import {
    matchImportProductCandidates,
    type ExistingImportProduct,
    type ImportProductCheckSnapshot,
    type ProductMatchQuery,
    type ProductMatchResult,
} from "./match-import-products";

function fail(): never {
    throw new Error(
        "პროდუქტების შემოწმების პასუხი არასრულია ან მოთხოვნას არ შეესაბამება. სცადე ხელახლა.",
    );
}

function object(value: unknown): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail();
    }

    return value as Record<string, unknown>;
}

function isExistingProduct(
    value: unknown,
): value is ExistingImportProduct {
    const item = object(value);

    return (
        [
            "inventoryItemId",
            "productId",
            "sku",
            "name",
            "inventoryUpdatedAt",
            "productUpdatedAt",
        ].every(field =>
            typeof item[field] === "string" &&
            item[field] !== "",
        ) &&
        [
            "brand",
            "category",
            "color",
            "size",
            "salePrice",
        ].every(field =>
            item[field] === null ||
            typeof item[field] === "string",
        ) &&
        typeof item.currentStock === "number" &&
        Number.isSafeInteger(item.currentStock) &&
        typeof item.isActive === "boolean" &&
        Number.isFinite(Date.parse(String(item.inventoryUpdatedAt))) &&
        Number.isFinite(Date.parse(String(item.productUpdatedAt)))
    );
}

export function readProductCheckResponse(
    raw: unknown,
    expected: ProductMatchQuery[],
): ImportProductCheckSnapshot {
    const body = object(raw);

    if (
        body.success !== true ||
        typeof body.businessId !== "string" ||
        !body.businessId ||
        typeof body.checkedAt !== "string" ||
        !Number.isFinite(Date.parse(body.checkedAt)) ||
        !Array.isArray(body.queries) ||
        body.queries.length !== expected.length ||
        !Array.isArray(body.results) ||
        body.results.length !== expected.length
    ) {
        fail();
    }

    const fields = [
        "key", "sourceCode", "name", "brand", "color", "size",
    ] as const;

    body.queries.forEach((rawQuery: unknown, index: number) => {
        const query = object(rawQuery);

        if (!fields.every(field => query[field] === expected[index][field])) {
            fail();
        }
    });

    const byKey = new Map(expected.map(query => [query.key, query]));
    const seen = new Set<string>();

    const results = body.results.map(
        (rawResult: unknown): ProductMatchResult => {
            const result = object(rawResult);

            if (
                typeof result.key !== "string" ||
                seen.has(result.key) ||
                typeof result.complete !== "boolean" ||
                !Array.isArray(result.candidates) ||
                result.candidates.length > 20
            ) {
                fail();
            }

            const query = byKey.get(result.key);

            if (!query) fail();

            seen.add(result.key);

            const existing = result.candidates.map((rawCandidate: unknown) => {
                const candidate = object(rawCandidate);

                if (!isExistingProduct(candidate.existing)) fail();

                return candidate.existing;
            });

            const candidates = matchImportProductCandidates(query, existing);

            if (candidates.length !== existing.length) fail();

            return {
                key: result.key,
                complete: result.complete,
                candidates,
            };
        },
    );

    return {
        businessId: body.businessId,
        queries: expected,
        results,
        checkedAt: body.checkedAt,
    };
}