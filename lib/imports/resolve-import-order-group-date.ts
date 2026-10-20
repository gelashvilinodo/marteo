import {
    readOrderImportDate,
    type OrderDateReadResult,
} from "./read-order-import-date";
import {
    resolveOrderGroupValue,
} from "./resolve-order-group-value";
import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";
import type {
    OrderImportOptions,
} from "./order-import-options";

function missing(value: unknown): boolean {
    return (
        value === null ||
        value === undefined ||
        (
            typeof value === "string" &&
            value.trim() === ""
        )
    );
}

export function resolveImportOrderGroupDate(input: {
    rows: readonly PreparedOrderSourceRow[];
    options: OrderImportOptions;
}): OrderDateReadResult {
    const values: {
        rowNumber: number;
        value: string;
    }[] = [];

    for (const row of input.rows) {
        const sourceError = row.issues.find(
            issue =>
                issue.severity === "ERROR" &&
                issue.field === "date",
        );

        if (sourceError) {
            return {
                kind: "NEEDS_REVIEW",
                message:
                    `რიგი ${row.rowNumber}: ${sourceError.message}`,
            };
        }

        if (missing(row.input.date)) continue;

        const result = readOrderImportDate({
            value: row.input.date,
            fallbackDate: null,
            textOrder: input.options.dateOrder,
            excelDateSystem: row.excelDateSystem,
        });

        if (result.kind === "NEEDS_REVIEW") {
            return {
                kind: "NEEDS_REVIEW",
                message:
                    `რიგი ${row.rowNumber}: ${result.message}`,
            };
        }

        values.push({
            rowNumber: row.rowNumber,
            value: result.date,
        });
    }

    const resolved = resolveOrderGroupValue({
        label: "შეკვეთის თარიღი",
        values,
    });

    if (resolved.kind === "NEEDS_REVIEW") {
        const locations = resolved.conflicts.map(
            conflict =>
                `${conflict.value} — რიგები ${conflict.rowNumbers.join(", ")}`,
        );

        return {
            kind: "NEEDS_REVIEW",
            message:
                `${resolved.message} ${locations.join("; ")}.`,
        };
    }

    if (resolved.kind === "READY") {
        return {
            kind: "READY",
            date: resolved.value,
            usedFallback: false,
        };
    }

    return readOrderImportDate({
        value: null,
        fallbackDate: input.options.fallbackDate,
        textOrder: input.options.dateOrder,
        excelDateSystem: null,
    });
}