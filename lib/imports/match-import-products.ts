export type ProductMatchQuery = {
    key: string;
    sourceCode: string | null;
    name: string;
    brand: string | null;
    color: string | null;
    size: string | null;
};

export type ExistingImportProduct = {
    inventoryItemId: string;
    productId: string;
    sku: string;
    name: string;
    brand: string | null;
    category: string | null;
    color: string | null;
    size: string | null;
    salePrice: string | null;
    currentStock: number;
    isActive: boolean;
    inventoryUpdatedAt: string;
    productUpdatedAt: string;
};

export type ProductComparisonField =
    | "name"
    | "brand"
    | "color"
    | "size";

export type ProductMatchCandidate = {
    existing: ExistingImportProduct;
    reason: "CODE" | "NAME_AND_ATTRIBUTES" | "NAME";
    conflictingFields: ProductComparisonField[];
    unspecifiedFields: ProductComparisonField[];
};

export type ProductMatchResult = {
    key: string;
    candidates: ProductMatchCandidate[];
    complete: boolean;
};

export type ImportProductCheckSnapshot = {
    businessId: string;
    queries: ProductMatchQuery[];
    results: ProductMatchResult[];
    checkedAt: string;
};

export function normalizeProductMatchText(
    value: string | null,
): string {
    return (value ?? "")
        .normalize("NFC")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("en-US");
}

export function matchImportProductCandidates(
    query: ProductMatchQuery,
    existingProducts: readonly ExistingImportProduct[],
): ProductMatchCandidate[] {
    const candidates: ProductMatchCandidate[] = [];
    const seen = new Set<string>();

    for (const existing of existingProducts) {
        if (seen.has(existing.inventoryItemId)) continue;

        const codeMatch =
            query.sourceCode !== null &&
            query.sourceCode.trim() !== "" &&
            query.sourceCode.trim() === existing.sku;

        const nameMatch =
            normalizeProductMatchText(query.name) ===
            normalizeProductMatchText(existing.name);

        if (!codeMatch && !nameMatch) continue;

        seen.add(existing.inventoryItemId);

        const conflictingFields: ProductComparisonField[] = [];
        const unspecifiedFields: ProductComparisonField[] = [];

        if (!nameMatch) {
            conflictingFields.push("name");
        }

        const attributeFields = ["brand", "color", "size"] as const;

        for (const field of attributeFields) {
            const importedValue = normalizeProductMatchText(
                query[field],
            );

            const existingValue = normalizeProductMatchText(
                existing[field],
            );

            if (!importedValue && existingValue) {
                unspecifiedFields.push(field);
            } else if (
                importedValue &&
                importedValue !== existingValue
            ) {
                conflictingFields.push(field);
            }
        }

        const allAttributesMatch = attributeFields.every(
            field =>
                normalizeProductMatchText(query[field]) ===
                normalizeProductMatchText(existing[field]),
        );

        candidates.push({
            existing,
            reason: codeMatch
                ? "CODE"
                : allAttributesMatch
                    ? "NAME_AND_ATTRIBUTES"
                    : "NAME",
            conflictingFields,
            unspecifiedFields,
        });
    }

    const priority: Record<ProductMatchCandidate["reason"], number> = {
        CODE: 0,
        NAME_AND_ATTRIBUTES: 1,
        NAME: 2,
    };

    return candidates.sort((left, right) => {
        const reasonDifference =
            priority[left.reason] - priority[right.reason];

        if (reasonDifference !== 0) return reasonDifference;

        const conflictDifference =
            left.conflictingFields.length -
            right.conflictingFields.length;

        if (conflictDifference !== 0) return conflictDifference;

        if (left.existing.isActive !== right.existing.isActive) {
            return left.existing.isActive ? -1 : 1;
        }

        return left.existing.inventoryItemId.localeCompare(
            right.existing.inventoryItemId,
        );
    });
}