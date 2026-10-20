import {
    detectOrderColumns,
    type OrderImportField,
} from "./detect-order-columns";
import type {
    OrderImportMapping,
} from "./order-import-mapping";

export type ResolvedOrderColumn = {
    field: OrderImportField;
    label: string;
    columnIndex: number | null;
    status: "SELECTED" | "UNASSIGNED" | "NEEDS_REVIEW";
};

export type OrderColumnProblem = {
    field: OrderImportField;
    message: string;
};

export function resolveOrderColumns(
    headers: readonly {
        columnIndex: number;
        value: unknown;
    }[],
    mapping: OrderImportMapping,
): {
    columns: ResolvedOrderColumn[];
    problems: OrderColumnProblem[];
} {
    const problems: OrderColumnProblem[] = [];

    const columns = detectOrderColumns(headers).map(
        (detected): ResolvedOrderColumn => {
            const hasOverride =
                Object.prototype.hasOwnProperty.call(
                    mapping.overrides,
                    detected.field,
                );

            if (hasOverride) {
                const selected =
                    mapping.overrides[detected.field] ?? null;

                return {
                    field: detected.field,
                    label: detected.label,
                    columnIndex: selected,
                    status:
                        selected === null
                            ? "UNASSIGNED"
                            : "SELECTED",
                };
            }

            if (detected.status === "AMBIGUOUS") {
                problems.push({
                    field: detected.field,
                    message:
                        `${detected.label}: რამდენიმე შესაძლო სვეტი მოიძებნა. ` +
                        "აირჩიე შესაბამისი სვეტი ან მიუთითე, რომ ამ ველს არ გადმოიტან.",
                });

                return {
                    field: detected.field,
                    label: detected.label,
                    columnIndex: null,
                    status: "NEEDS_REVIEW",
                };
            }

            return {
                field: detected.field,
                label: detected.label,
                columnIndex: detected.selectedColumnIndex,
                status:
                    detected.selectedColumnIndex === null
                        ? "UNASSIGNED"
                        : "SELECTED",
            };
        },
    );

    const usage = new Map<number, ResolvedOrderColumn[]>();

    for (const column of columns) {
        if (column.columnIndex === null) continue;

        const assigned = usage.get(column.columnIndex) ?? [];
        assigned.push(column);
        usage.set(column.columnIndex, assigned);
    }

    for (const assigned of usage.values()) {
        if (assigned.length < 2) continue;

        const labels = assigned.map(column => column.label).join(", ");

        for (const column of assigned) {
            column.status = "NEEDS_REVIEW";

            problems.push({
                field: column.field,
                message:
                    `${column.label}: ერთი სვეტი რამდენიმე მნიშვნელობას დაუკავშირდა ` +
                    `(${labels}). მიუთითე თითოეულის შესაბამისი სვეტი, ` +
                    "რომ თანხები ან სხვა მონაცემები არასწორად არ წავიკითხოთ.",
            });
        }
    }

    return { columns, problems };
}