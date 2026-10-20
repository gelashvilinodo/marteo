import {
    validateImportMoney,
} from "./validate-import-money";
import {
    resolveOrderGroupValue,
    type OrderGroupValueResult,
} from "./resolve-order-group-value";
import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";

export type OrderGroupMoneyField =
    | "orderTotal"
    | "paidAmount"
    | "courierFee";

const labels: Record<OrderGroupMoneyField, string> = {
    orderTotal: "შეკვეთის სრული თანხა",
    paidAmount: "გადახდილი თანხა",
    courierFee: "კურიერის საფასური",
};

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

export function readImportOrderGroupMoney(input: {
    rows: readonly PreparedOrderSourceRow[];
    field: OrderGroupMoneyField;
}): OrderGroupValueResult {
    const label = labels[input.field];

    const values: {
        rowNumber: number;
        value: string;
    }[] = [];

    for (const row of input.rows) {
        const sourceError = row.issues.find(
            issue =>
                issue.severity === "ERROR" &&
                issue.field === input.field,
        );

        if (sourceError) {
            return {
                kind: "NEEDS_REVIEW",
                value: null,
                message:
                    `რიგი ${row.rowNumber}: ${sourceError.message}`,
                conflicts: [],
            };
        }

        const raw = row.input[input.field];

        if (missing(raw)) continue;

        const result = validateImportMoney(raw, {
            field: input.field,
            label,
            decimalSeparator: row.decimalSeparator,
        });

        if (!result.valid) {
            return {
                kind: "NEEDS_REVIEW",
                value: null,
                message:
                    `რიგი ${row.rowNumber}: ` +
                    result.issues
                        .map(issue => issue.message)
                        .join(" "),
                conflicts: [],
            };
        }

        values.push({
            rowNumber: row.rowNumber,
            value: result.data,
        });
    }

    const resolved = resolveOrderGroupValue({
        label,
        values,
    });

    if (resolved.kind !== "NEEDS_REVIEW") {
        return resolved;
    }

    const locations = resolved.conflicts.map(
        conflict =>
            `${conflict.value} — რიგები ${conflict.rowNumbers.join(", ")}`,
    );

    return {
        ...resolved,
        message:
            `${resolved.message} ${locations.join("; ")}.`,
    };
}