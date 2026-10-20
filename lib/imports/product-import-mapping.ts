import {
    PRODUCT_IMPORT_COLUMNS,
    type ProductImportField,
} from "./detect-product-columns";
import { ImportDraftFileError } from "./validate-import-draft-file";

export type ProductImportMapping = {
    enabled: boolean;
    headerRowNumber: number;
    mode: "CATALOG" | "CURRENT_STOCK";
    decimalSeparator: "." | ",";
    overrides: Partial<Record<ProductImportField, number | null>>;
};

export function createProductImportMapping(
    headerRowNumber: number,
): ProductImportMapping {
    return {
        enabled: false,
        headerRowNumber,
        mode: "CATALOG",
        decimalSeparator: ".",
        overrides: {},
    };
}

export function validateProductImportMapping(
    value: unknown,
): ProductImportMapping {
    function fail(): never {
        throw new ImportDraftFileError(
            "პროდუქტების სვეტების არჩევანის სტრუქტურა არასწორია. ეს ფაილში პროდუქტის მონაცემების ნაკლებობას არ ნიშნავს.",
        );
    }

    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail();
    }

    const input = value as Record<string, unknown>;

    if (
        typeof input.enabled !== "boolean" ||
        typeof input.headerRowNumber !== "number" ||
        !Number.isSafeInteger(input.headerRowNumber) ||
        input.headerRowNumber < 1 ||
        (input.mode !== "CATALOG" && input.mode !== "CURRENT_STOCK") ||
        (input.decimalSeparator !== "." && input.decimalSeparator !== ",") ||
        typeof input.overrides !== "object" ||
        input.overrides === null ||
        Array.isArray(input.overrides)
    ) {
        fail();
    }

    const overrides: ProductImportMapping["overrides"] = {};

    for (const [key, column] of Object.entries(input.overrides)) {
        const definition = PRODUCT_IMPORT_COLUMNS.find(
            item => item.field === key,
        );

        if (
            !definition ||
            (
                column !== null &&
                (
                    typeof column !== "number" ||
                    !Number.isSafeInteger(column) ||
                    column < 1
                )
            )
        ) {
            fail();
        }

        overrides[definition.field] = column;
    }

    return {
        enabled: input.enabled,
        headerRowNumber: input.headerRowNumber,
        mode: input.mode,
        decimalSeparator: input.decimalSeparator,
        overrides,
    };
}

export type ProductImportEdits = Record<
    number,
    Partial<Record<ProductImportField, string>>
>;

export function validateProductImportEdits(
    value: unknown,
): ProductImportEdits {
    function fail(): never {
        throw new ImportDraftFileError(
            "პროდუქტის შესწორებების სტრუქტურა არასწორია. მონაცემები არ შენახულა.",
        );
    }

    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail();
    }

    return Object.fromEntries(
        Object.entries(value).map(([rowKey, rawFields]) => {
            const rowNumber = Number(rowKey);

            if (
                !Number.isSafeInteger(rowNumber) ||
                rowNumber < 1 ||
                String(rowNumber) !== rowKey ||
                typeof rawFields !== "object" ||
                rawFields === null ||
                Array.isArray(rawFields)
            ) {
                fail();
            }

            const edits: ProductImportEdits[number] = {};

            for (const [key, fieldValue] of Object.entries(rawFields)) {
                const definition = PRODUCT_IMPORT_COLUMNS.find(
                    item => item.field === key,
                );

                if (!definition || typeof fieldValue !== "string") {
                    fail();
                }

                edits[definition.field] = fieldValue;
            }

            return [rowKey, edits];
        }),
    );
}