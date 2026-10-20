import type { ProductMatchQuery } from "./match-import-products";
import { ImportDraftFileError } from "./validate-import-draft-file";
import { validateImportRecordKeys } from "./validate-import-record-keys";

type DecisionBase = {
    businessId: string;
    queryToken: string;
};

export type ImportExistingProductLink =
    | (
        DecisionBase & {
            action: "LINK";
            inventoryItemId: string;
            productId: string;
            inventoryUpdatedAt: string;
            productUpdatedAt: string;
            acknowledgedDifferences: boolean;
        }
    )
    | (
        DecisionBase & {
            action: "CREATE";
            acknowledgedCandidates: true;
        }
    );

export type ImportExistingProductLinks = Record<
    string,
    ImportExistingProductLink | null
>;

export function productMatchQueryToken(
    query: ProductMatchQuery,
): string {
    return JSON.stringify([
        query.key,
        query.sourceCode,
        query.name,
        query.brand,
        query.color,
        query.size,
    ]);
}

export function validateExistingProductLinks(
    value: unknown,
    businessId: string,
): ImportExistingProductLinks {
    function fail(): never {
        throw new ImportDraftFileError(
            "პროდუქტის იმპორტის არჩევანი არასწორ ფორმატშია. მონაცემები არ შენახულა.",
        );
    }

    function text(value: unknown): string {
        if (typeof value !== "string" || !value.trim()) fail();
        return value;
    }

    function date(value: unknown): string {
        const result = text(value);

        if (!Number.isFinite(Date.parse(result))) fail();

        return result;
    }

    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail();
    }

    return Object.fromEntries(
        Object.entries(value).map(
            ([key, raw]): [string, ImportExistingProductLink | null] => {
                validateImportRecordKeys([key], "პროდუქტის არჩევანი");

                if (raw === null) return [key, null];

                if (
                    typeof raw !== "object" ||
                    Array.isArray(raw)
                ) {
                    fail();
                }

                const input = raw as Record<string, unknown>;

                if (input.businessId !== businessId) fail();

                const queryToken = text(input.queryToken);

                // ძველი მონახაზების კავშირებს action ჯერ არ ჰქონდათ.
                const action = input.action === undefined
                    ? "LINK"
                    : input.action;

                if (action === "CREATE") {
                    if (input.acknowledgedCandidates !== true) fail();

                    return [key, {
                        action: "CREATE",
                        businessId,
                        queryToken,
                        acknowledgedCandidates: true,
                    }];
                }

                if (
                    action !== "LINK" ||
                    typeof input.acknowledgedDifferences !== "boolean"
                ) {
                    fail();
                }

                return [key, {
                    action: "LINK",
                    businessId,
                    queryToken,
                    inventoryItemId: text(input.inventoryItemId),
                    productId: text(input.productId),
                    inventoryUpdatedAt: date(input.inventoryUpdatedAt),
                    productUpdatedAt: date(input.productUpdatedAt),
                    acknowledgedDifferences: input.acknowledgedDifferences,
                }];
            },
        ),
    );
}