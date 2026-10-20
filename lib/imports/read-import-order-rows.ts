import type {
    ParsedImportSheet,
} from "./import-file-types";
import type {
    ImportIssue,
} from "./import-types";
import type {
    OrderImportField,
} from "./detect-order-columns";
import type {
    OrderImportEdits,
    OrderImportMapping,
} from "./order-import-mapping";
import {
    resolveOrderColumns,
} from "./resolve-order-columns";

export type ReadImportOrderRow = {
    key: string;
    fileId: string;
    fileName: string;
    sheetName: string;
    rowNumber: number;
    input: Partial<Record<OrderImportField, unknown>>;
    issues: ImportIssue[];
};

function columnIndex(address: string): number | null {
    const match = /^([A-Z]+)[1-9]\d*$/.exec(address);

    if (!match) return null;

    let index = 0;

    for (const letter of match[1]) {
        index = index * 26 + letter.charCodeAt(0) - 64;
    }

    return Number.isSafeInteger(index) ? index : null;
}

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

export function readImportOrderRows(source: {
    fileId: string;
    fileName: string;
    sheet: ParsedImportSheet;
    mapping: OrderImportMapping;
    edits?: OrderImportEdits;
}): {
    rows: ReadImportOrderRow[];
    mappingProblems: string[];
} {
    if (!source.mapping.enabled) {
        return { rows: [], mappingProblems: [] };
    }

    const header = source.sheet.rows.find(
        row => row.rowNumber === source.mapping.headerRowNumber,
    );

    if (!header) {
        return {
            rows: [],
            mappingProblems: [
                "სათაურების არჩეული რიგი ვერ მოიძებნა. მიუთითე რიგი, რომელშიც სვეტების სახელებია.",
            ],
        };
    }

    const headers = header.cells.flatMap(cell => {
        const index = columnIndex(cell.address);

        return (
            index !== null &&
            cell.errorCode === null &&
            typeof cell.value === "string"
        )
            ? [{
                columnIndex: index,
                value: cell.value,
            }]
            : [];
    });

    const resolved = resolveOrderColumns(headers, source.mapping);

    if (resolved.problems.length > 0) {
        return {
            rows: [],
            mappingProblems: resolved.problems.map(
                problem => problem.message,
            ),
        };
    }

    const selected = resolved.columns.filter(
        column => column.columnIndex !== null,
    );

    const rows: ReadImportOrderRow[] = [];

    for (const row of source.sheet.rows) {
        if (row.rowNumber <= source.mapping.headerRowNumber) continue;

        const cells = new Map(
            row.cells.flatMap(cell => {
                const index = columnIndex(cell.address);

                return index === null
                    ? []
                    : [[index, cell] as const];
            }),
        );

        const edits = source.edits?.[row.rowNumber] ?? {};
        const input: ReadImportOrderRow["input"] = {};
        const issues: ImportIssue[] = [];

        for (const column of selected) {
            const index = column.columnIndex;

            if (index === null) continue;

            const cell = cells.get(index);

            input[column.field] = cell?.value ?? null;

            const edited = Object.prototype.hasOwnProperty.call(
                edits,
                column.field,
            );

            if (cell?.errorCode !== null && cell?.errorCode !== undefined && !edited) {
                issues.push({
                    severity: "ERROR",
                    field: column.field,
                    code: "ORDER_SOURCE_CELL_ERROR",
                    message:
                        `${column.label}: წყაროს უჯრედში (${cell.address}) ` +
                        `ფაილის შეცდომაა: ${cell.errorCode}. ` +
                        "მიუთითე სწორი მნიშვნელობა ან შეასწორე წყაროს ფაილი.",
                });
            }
        }

        // შესწორებით შეიძლება იმ ველის შევსებაც,
        // რომლის სვეტიც ფაილში საერთოდ არ არსებობს.
        for (const field of Object.keys(edits) as OrderImportField[]) {
            input[field] = edits[field];
        }

        const hasData = Object.values(input).some(
            value => !missing(value),
        );

        if (!hasData && issues.length === 0) continue;

        rows.push({
            key: JSON.stringify([
                source.fileId,
                source.sheet.name,
                row.rowNumber,
            ]),
            fileId: source.fileId,
            fileName: source.fileName,
            sheetName: source.sheet.name,
            rowNumber: row.rowNumber,
            input,
            issues,
        });
    }

    return { rows, mappingProblems: [] };
}