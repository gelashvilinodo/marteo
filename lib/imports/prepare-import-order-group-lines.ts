import {
    validateImportOrderLine,
    type ImportedOrderLine,
} from "./validate-import-order-line";
import {
    summarizeImportOrderLines,
    type ImportedOrderLinesSummary,
} from "./summarize-import-order-lines";
import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";
import type {
    ImportIssue,
} from "./import-types";

export type PreparedOrderLine = {
    rowKey: string;
    rowNumber: number;
    data: ImportedOrderLine;
};

export type OrderLineProblem = {
    rowKey: string | null;
    rowNumber: number | null;
    issues: ImportIssue[];
};

export function prepareImportOrderGroupLines(
    rows: readonly PreparedOrderSourceRow[],
): {
    lines: PreparedOrderLine[];
    problems: OrderLineProblem[];
    summary: ImportedOrderLinesSummary | null;
} {
    const lines: PreparedOrderLine[] = [];
    const problems: OrderLineProblem[] = [];

    const lineFields = new Set([
        "name",
        "productCode",
        "color",
        "size",
        "quantity",
        "unitPrice",
        "lineTotal",
        "unitCost",
    ]);

    for (const row of rows) {
        const sourceErrors = row.issues.filter(
            issue =>
                issue.severity === "ERROR" &&
                (
                    issue.field === null ||
                    lineFields.has(issue.field)
                ),
        );

        if (sourceErrors.length > 0) {
            problems.push({
                rowKey: row.key,
                rowNumber: row.rowNumber,
                issues: sourceErrors,
            });
            continue;
        }

        const result = validateImportOrderLine({
            name: row.input.name,
            productCode: row.input.productCode,
            color: row.input.color,
            size: row.input.size,
            quantity: row.input.quantity,
            unitPrice: row.input.unitPrice,
            lineTotal: row.input.lineTotal,
            unitCost: row.input.unitCost,
            decimalSeparator: row.decimalSeparator,
        });

        if (!result.valid) {
            problems.push({
                rowKey: row.key,
                rowNumber: row.rowNumber,
                issues: result.issues,
            });
            continue;
        }

        lines.push({
            rowKey: row.key,
            rowNumber: row.rowNumber,
            data: result.data,
        });
    }

    // შეცდომიანი ხაზების გამოკლებით შეკვეთის ჯამს
    // არ ვადგენთ — ამან გაყიდვის თანხა შეიძლება შეამციროს.
    if (problems.length > 0) {
        return {
            lines,
            problems,
            summary: null,
        };
    }

    const summarized = summarizeImportOrderLines(
        lines.map(line => line.data),
    );

    if (!summarized.valid) {
        return {
            lines,
            problems: [{
                rowKey: null,
                rowNumber: null,
                issues: summarized.issues,
            }],
            summary: null,
        };
    }

    return {
        lines,
        problems: [],
        summary: summarized.data,
    };
}