import {
    ORDER_IMPORT_COLUMNS,
    type OrderImportField,
} from "./detect-order-columns";
import {
    ImportDraftFileError,
} from "./validate-import-draft-file";

export type OrderImportMapping = {
    enabled: boolean;
    headerRowNumber: number;
    decimalSeparator: "." | ",";
    overrides: Partial<Record<OrderImportField, number | null>>;
    orderTotalIncludesCourier?: boolean;
    paidAmountIncludesCourier?: boolean;
};

export type OrderImportEdits = Record<
    number,
    Partial<Record<OrderImportField, string>>
>;

export function createOrderImportMapping(
    headerRowNumber: number,
): OrderImportMapping {
    return {
        enabled: false,
        headerRowNumber,
        decimalSeparator: ".",
        overrides: {},
        orderTotalIncludesCourier: false,
        paidAmountIncludesCourier: false,
    };
}

function fail(message: string): never {
    throw new ImportDraftFileError(message);
}

function object(
    value: unknown,
    message: string,
): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail(message);
    }

    return value as Record<string, unknown>;
}

function isOrderField(value: string): value is OrderImportField {
    return ORDER_IMPORT_COLUMNS.some(
        definition => definition.field === value,
    );
}

export function validateOrderImportMapping(
    value: unknown,
): OrderImportMapping {
    const message =
        "შეკვეთების სვეტების არჩევანის სტრუქტურა არასწორია. ეს ფაილში შეკვეთების მონაცემების ნაკლებობას არ ნიშნავს.";

    const input = object(value, message);

    if (
        typeof input.enabled !== "boolean" ||
        typeof input.headerRowNumber !== "number" ||
        !Number.isSafeInteger(input.headerRowNumber) ||
        input.headerRowNumber < 1 ||
        (
            input.decimalSeparator !== "." &&
            input.decimalSeparator !== ","
        )
    ) {
        fail(message);
    }

    for (const field of [
        "orderTotalIncludesCourier",
        "paidAmountIncludesCourier",
    ] as const) {
        if (
            input[field] !== undefined &&
            typeof input[field] !== "boolean"
        ) {
            fail(message);
        }
    }

    const rawOverrides = object(input.overrides, message);

    const entries: [OrderImportField, number | null][] = [];

    for (const [field, column] of Object.entries(rawOverrides)) {
        if (
            !isOrderField(field) ||
            (
                column !== null &&
                (
                    typeof column !== "number" ||
                    !Number.isSafeInteger(column) ||
                    column < 1
                )
            )
        ) {
            fail(message);
        }

        entries.push([field, column]);
    }

    return {
        enabled: input.enabled,
        headerRowNumber: input.headerRowNumber,
        decimalSeparator: input.decimalSeparator,
        overrides: Object.fromEntries(entries),
        orderTotalIncludesCourier:
            input.orderTotalIncludesCourier === true,
        paidAmountIncludesCourier:
            input.paidAmountIncludesCourier === true,
    };
}

export function validateOrderImportEdits(
    value: unknown,
): OrderImportEdits {
    const message =
        "შეკვეთების შესწორებების სტრუქტურა არასწორია. მონაცემები არ შენახულა.";

    const input = object(value, message);
    const entries: [
        number,
        Partial<Record<OrderImportField, string>>,
    ][] = [];

    for (const [rowKey, rawFields] of Object.entries(input)) {
        const rowNumber = Number(rowKey);

        if (
            !Number.isSafeInteger(rowNumber) ||
            rowNumber < 1 ||
            String(rowNumber) !== rowKey
        ) {
            fail(message);
        }

        const fields = object(rawFields, message);
        const fieldEntries: [OrderImportField, string][] = [];

        for (const [field, fieldValue] of Object.entries(fields)) {
            if (
                !isOrderField(field) ||
                typeof fieldValue !== "string"
            ) {
                fail(message);
            }

            fieldEntries.push([field, fieldValue]);
        }

        entries.push([
            rowNumber,
            Object.fromEntries(fieldEntries),
        ]);
    }

    return Object.fromEntries(entries);
}