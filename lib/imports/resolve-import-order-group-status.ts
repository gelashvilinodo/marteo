import {
    readOrderImportStatus,
    type OrderStatusReadResult,
} from "./read-order-import-status";
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

export function resolveImportOrderGroupStatus(input: {
    rows: readonly PreparedOrderSourceRow[];
    fallback: OrderImportOptions["missingStatus"];
}): OrderStatusReadResult {
    const values: {
        rowNumber: number;
        value: string;
    }[] = [];

    for (const row of input.rows) {
        const sourceError = row.issues.find(
            issue =>
                issue.severity === "ERROR" &&
                issue.field === "status",
        );

        if (sourceError) {
            return {
                kind: "NEEDS_REVIEW",
                message:
                    `რიგი ${row.rowNumber}: ${sourceError.message}`,
            };
        }

        if (missing(row.input.status)) continue;

        const result = readOrderImportStatus(
            row.input.status,
            "UNRESOLVED",
        );

        if (result.kind === "NEEDS_REVIEW") {
            return {
                kind: "NEEDS_REVIEW",
                message:
                    `რიგი ${row.rowNumber}: ${result.message}`,
            };
        }

        values.push({
            rowNumber: row.rowNumber,
            value:
                result.kind === "SKIPPED"
                    ? result.reason
                    : result.status,
        });
    }

    const resolved = resolveOrderGroupValue({
        label: "შეკვეთის სტატუსი",
        values,
    });

    if (resolved.kind === "NEEDS_REVIEW") {
        const locations = resolved.conflicts.map(
            conflict =>
                `${conflict.value} - რიგები ${conflict.rowNumbers.join(", ")}`,
        );

        return {
            kind: "NEEDS_REVIEW",
            message:
                `${resolved.message} ${locations.join("; ")}.`,
        };
    }

    if (resolved.kind === "MISSING") {
        return readOrderImportStatus(null, input.fallback);
    }

    return readOrderImportStatus(
        resolved.value,
        "UNRESOLVED",
    );
}