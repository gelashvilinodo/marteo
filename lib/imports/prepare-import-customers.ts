import { detectCustomerColumns } from "./detect-customer-columns";
import type { CustomerImportField } from "./detect-customer-columns";
import type { ParsedImportSheet } from "./import-file-types";
import type {
    ImportedCustomer,
    ImportCustomerEdits,
    ImportCustomerMapping,
    ImportIssue,
} from "./import-types";
import { validateImportCustomer } from "./validate-import-customer";

export type CustomerImportSource = {
    fileId: string;
    fileName: string;
    sheet: ParsedImportSheet;
    mapping: ImportCustomerMapping;
    edits: ImportCustomerEdits;
};

export type PreparedImportCustomer = {
    key: string;
    fileId: string;
    fileName: string;
    sheetName: string;
    rowNumber: number;
    sourceCode: string | null;
    input?: Partial<Record<CustomerImportField, unknown>>;
    data: ImportedCustomer | null;
    status: "INVALID" | "NEEDS_REVIEW" | "READY";
    issues: ImportIssue[];
    duplicateKeys: string[];
};

export type CustomerMappingProblem = {
    fileName: string;
    sheetName: string;
    message: string;
};

function getColumnIndex(address: string): number | null {
    const letters = address.match(/^[A-Z]+/i)?.[0].toUpperCase();

    if (!letters) return null;

    let result = 0;

    for (const letter of letters) {
        result = result * 26 + letter.charCodeAt(0) - 64;
    }

    return result;
}

export function prepareImportCustomers(
    sources: readonly CustomerImportSource[],
    excludedKeys: readonly string[] = [],
): {
    records: PreparedImportCustomer[];
    mappingProblems: CustomerMappingProblem[];
} {
    const records: PreparedImportCustomer[] = [];
    const excluded = new Set(excludedKeys);
    const mappingProblems: CustomerMappingProblem[] = [];

    for (const source of sources) {
        const { sheet, mapping, edits } = source;

        if (!mapping.enabled) continue;

        function mappingProblem(message: string) {
            mappingProblems.push({
                fileName: source.fileName,
                sheetName: sheet.name,
                message,
            });
        }

        const header = sheet.rows.find(
            row => row.rowNumber === mapping.headerRowNumber,
        );

        if (!header) {
            mappingProblem(
                "არჩეული სათაურების რიგი ვერ მოიძებნა. მიუთითე რიგი, რომელშიც სვეტების სახელებია.",
            );
            continue;
        }

        const headers = header.cells.flatMap(cell => {
            const columnIndex = getColumnIndex(cell.address);

            if (
                columnIndex === null ||
                cell.errorCode !== null ||
                typeof cell.value !== "string" ||
                !cell.value.trim()
            ) {
                return [];
            }

            return [{ columnIndex, value: cell.value }];
        });

        const selected = detectCustomerColumns(headers)
            .map(item => ({
                ...item,
                column: Object.prototype.hasOwnProperty.call(
                    mapping.overrides,
                    item.field,
                )
                    ? mapping.overrides[item.field] ?? null
                    : item.selectedColumnIndex,
            }));

        // A missing column is not a dead end: retain source rows and allow
        // the required values to be entered in the review editor.
        const assigned = selected.flatMap(
            item => item.column === null ? [] : [item.column],
        );

        const availableColumns = new Set(
            headers.map(item => item.columnIndex),
        );

        if (
            assigned.some(
                column =>
                    !Number.isInteger(column) ||
                    !availableColumns.has(column),
            )
        ) {
            mappingProblem(
                "ერთ-ერთი არჩეული სვეტი სათაურების რიგში ვერ მოიძებნა. გადაამოწმე სვეტების დაკავშირება.",
            );
            continue;
        }

        if (new Set(assigned).size !== assigned.length) {
            mappingProblem(
                "ერთი სვეტი რამდენიმე ველს აქვს მინიჭებული. ტელეფონს, მისამართსა და სხვა ველებს შესაბამისი განსხვავებული სვეტები შეურჩიე.",
            );
            continue;
        }

        for (const row of sheet.rows) {
            if (row.rowNumber <= mapping.headerRowNumber) continue;

            const recordKey = JSON.stringify([
                source.fileId,
                sheet.name,
                row.rowNumber,
            ]);

            if (excluded.has(recordKey)) continue;

            const cells = new Map(
                row.cells.flatMap(cell => {
                    const index = getColumnIndex(cell.address);

                    return index === null
                        ? []
                        : [[index, cell] as const];
                }),
            );

            const input: Partial<
                Record<CustomerImportField, unknown>
            > = {};

            const sourceIssues: ImportIssue[] = [];
            let hasData = false;

            for (const selection of selected) {
                const cell = selection.column === null
                    ? undefined
                    : cells.get(selection.column);

                const rowEdits = edits[row.rowNumber] ?? {};
                const edited = Object.prototype.hasOwnProperty.call(
                    rowEdits,
                    selection.field,
                );

                const value = edited
                    ? rowEdits[selection.field]
                    : cell?.value;

                input[selection.field] = value;

                if (
                    (
                        value !== undefined &&
                        value !== null &&
                        String(value).trim() !== ""
                    ) ||
                    (
                        !edited &&
                        cell &&
                        (
                            cell.errorCode !== null ||
                            Boolean(cell.formula)
                        )
                    )
                ) {
                    hasData = true;
                }

                if (edited || !cell) continue;

                if (cell.errorCode !== null) {
                    sourceIssues.push({
                        severity: "ERROR",
                        code: "SOURCE_CELL_ERROR",
                        field: selection.field,
                        message:
                            `${cell.address}: წყაროს უჯრედში შეცდომაა. გაასწორე ფაილში ან მიუთითე სწორი მონაცემი იმპორტის გვერდზე.`,
                    });
                } else if (
                    cell.formula &&
                    cell.value === null
                ) {
                    sourceIssues.push({
                        severity: "ERROR",
                        code: "FORMULA_RESULT_MISSING",
                        field: selection.field,
                        message:
                            `${cell.address}: ფორმულას შენახული შედეგი არ აქვს. გადაანგარიშე და შეინახე ფაილი ან მნიშვნელობა ხელით მიუთითე.`,
                    });
                }
            }

            if (!hasData) continue;

            const validation = validateImportCustomer(input);
            const issues = [
                ...sourceIssues,
                ...validation.issues,
            ];

            const valid =
                validation.valid &&
                !issues.some(issue => issue.severity === "ERROR");

            records.push({
                key: JSON.stringify([
                    source.fileId,
                    sheet.name,
                    row.rowNumber,
                ]),
                fileId: source.fileId,
                fileName: source.fileName,
                sheetName: sheet.name,
                rowNumber: row.rowNumber,
                sourceCode:
                    typeof input.sourceCode === "string" ||
                        typeof input.sourceCode === "number"
                        ? String(input.sourceCode).trim() || null
                        : null,
                input,
                data: validation.valid ? validation.data : null,
                status: valid ? "READY" : "INVALID",
                issues,
                duplicateKeys: [],
            });
        }
    }

    const phoneGroups = new Map<
        string,
        PreparedImportCustomer[]
    >();

    for (const record of records) {
        if (!record.data || record.status === "INVALID") continue;

        const phone = record.data.phone;
        const group = phoneGroups.get(phone) ?? [];

        group.push(record);
        phoneGroups.set(phone, group);
    }

    for (const group of phoneGroups.values()) {
        if (group.length < 2) continue;

        for (const record of group) {
            record.status = "NEEDS_REVIEW";
            record.duplicateKeys = group
                .filter(other => other.key !== record.key)
                .map(other => other.key);

            record.issues.push({
                severity: "WARNING",
                code: "DUPLICATE_PHONE_IN_IMPORT",
                field: "phone",
                message:
                    `ეს ტელეფონი ატვირთულ მონაცემებში ${group.length} ჩანაწერს აქვს. გადაამოწმე, ერთი მომხმარებელია თუ ნომერია შესასწორებელი. ავტომატურად არ გავაერთიანებთ და მონაცემებს არ გადავაწერთ.`,
            });
        }
    }

    return { records, mappingProblems };
}