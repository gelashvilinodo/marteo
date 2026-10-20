import {
    detectProductColumns,
    type ProductImportField,
} from "./detect-product-columns";
import type { ParsedImportSheet } from "./import-file-types";
import type { ImportIssue } from "./import-types";
import type {
    ProductImportMapping,
    ProductImportEdits,
} from "./product-import-mapping";
import {
    validateImportProduct,
    type ImportedProduct,
} from "./validate-import-product";

export type ProductImportSource = {
    fileId: string;
    fileName: string;
    sheet: ParsedImportSheet;
    mapping: ProductImportMapping;
    edits?: ProductImportEdits;
};

export type PreparedImportProduct = {
    key: string;
    fileId: string;
    fileName: string;
    sheetName: string;
    rowNumber: number;
    mode: ProductImportMapping["mode"];
    decimalSeparator: "." | ",";
    input: Partial<Record<ProductImportField, unknown>>;
    data: ImportedProduct | null;
    status: "INVALID" | "NEEDS_REVIEW" | "READY";
    issues: ImportIssue[];
    duplicateKeys: string[];
};

export type ProductMappingProblem = {
    fileName: string;
    sheetName: string;
    message: string;
};

function columnIndex(address: string): number | null {
    const letters = address.match(/^[A-Z]+/)?.[0];

    if (!letters) return null;

    let index = 0;

    for (const letter of letters) {
        index = index * 26 + letter.charCodeAt(0) - 64;
    }

    return index;
}

function normalized(value: string | null): string {
    return (value ?? "")
        .normalize("NFC")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("en-US");
}

export function prepareImportProducts(
    sources: readonly ProductImportSource[],
    excludedKeys: readonly string[] = [],
): {
    records: PreparedImportProduct[];
    mappingProblems: ProductMappingProblem[];
} {
    const records: PreparedImportProduct[] = [];
    const excluded = new Set(excludedKeys);
    const mappingProblems: ProductMappingProblem[] = [];

    for (const source of sources) {
        const { sheet, mapping } = source;

        if (!mapping.enabled) continue;

        function problem(message: string) {
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
            problem(
                "სათაურების არჩეული რიგი ვერ მოიძებნა. მიუთითე რიგი, რომელშიც სვეტების სახელებია.",
            );
            continue;
        }

        const headers = header.cells.flatMap(cell => {
            const index = columnIndex(cell.address);

            return (
                index !== null &&
                cell.errorCode === null &&
                typeof cell.value === "string" &&
                cell.value.trim()
            )
                ? [{ columnIndex: index, value: cell.value }]
                : [];
        });

        const selected = detectProductColumns(headers)
            .filter(
                item =>
                    mapping.mode === "CURRENT_STOCK" ||
                    item.field !== "currentStock",
            )
            .map(item => ({
                ...item,
                required:
                    item.required ||
                    (
                        mapping.mode === "CURRENT_STOCK" &&
                        item.field === "currentStock"
                    ),
                column: Object.prototype.hasOwnProperty.call(
                    mapping.overrides,
                    item.field,
                )
                    ? mapping.overrides[item.field] ?? null
                    : item.selectedColumnIndex,
            }));

        // Keep incomplete rows available for the inline editor even when a
        // required column is absent from the original spreadsheet.
        const assigned = selected.flatMap(
            item => item.column === null ? [] : [item.column],
        );
        const available = new Set(
            headers.map(item => item.columnIndex),
        );

        if (assigned.some(index => !available.has(index))) {
            problem(
                "არჩეული სვეტი სათაურების რიგში ვერ მოიძებნა. გადაამოწმე სვეტების დაკავშირება.",
            );
            continue;
        }

        if (new Set(assigned).size !== assigned.length) {
            problem(
                "ერთი სვეტი რამდენიმე ველს აქვს მინიჭებული. თითოეულ ველს შესაბამისი განსხვავებული სვეტი შეურჩიე.",
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
                    const index = columnIndex(cell.address);

                    return index === null
                        ? []
                        : [[index, cell] as const];
                }),
            );

            const input: Partial<Record<ProductImportField, unknown>> = {};
            const sourceIssues: ImportIssue[] = [];
            let hasData = false;

            for (const selection of selected) {
                const cell = selection.column === null
                    ? undefined
                    : cells.get(selection.column);

                const rowEdits = source.edits?.[row.rowNumber] ?? {};

                const edited = Object.prototype.hasOwnProperty.call(
                    rowEdits,
                    selection.field,
                );

                const value = edited
                    ? rowEdits[selection.field]
                    : cell?.value;

                input[selection.field] = value;

                const originalHasData = Boolean(
                    cell &&
                    (
                        cell.errorCode !== null ||
                        cell.formula ||
                        (
                            cell.value !== null &&
                            String(cell.value).trim() !== ""
                        )
                    ),
                );

                if (
                    originalHasData ||
                    (
                        value !== undefined &&
                        value !== null &&
                        String(value).trim() !== ""
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
                            `${cell.address}: წყაროს უჯრედში შეცდომაა. ${selection.label} სანდოდ ვერ წავიკითხეთ. შეასწორე ჩანაწერი ან აირჩიე სწორი სვეტი.`,
                    });
                } else if (cell.formula && cell.value === null) {
                    sourceIssues.push({
                        severity: "ERROR",
                        code: "FORMULA_RESULT_MISSING",
                        field: selection.field,
                        message:
                            `${cell.address}: ფორმულას შენახული შედეგი არ აქვს. გადაანგარიშე ფაილი ან მიუთითე მნიშვნელობა აქვე.`,
                    });
                }
            }

            if (!hasData) continue;

            const validation = validateImportProduct(input, mapping);
            const issues = [...sourceIssues, ...validation.issues];

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
                mode: mapping.mode,
                decimalSeparator: mapping.decimalSeparator,
                input,
                data: validation.valid ? validation.data : null,
                status:
                    validation.valid &&
                        !issues.some(issue => issue.severity === "ERROR")
                        ? "READY"
                        : "INVALID",
                issues,
                duplicateKeys: [],
            });
        }
    }

    const codeGroups = new Map<string, PreparedImportProduct[]>();
    const nameGroups = new Map<string, PreparedImportProduct[]>();

    for (const record of records) {
        if (!record.data || record.status === "INVALID") continue;

        const data = record.data;

        if (data.sourceCode) {
            const group = codeGroups.get(data.sourceCode) ?? [];
            group.push(record);
            codeGroups.set(data.sourceCode, group);
        }

        const identity = JSON.stringify([
            normalized(data.name),
            normalized(data.brand),
            normalized(data.color),
            normalized(data.size),
        ]);

        const group = nameGroups.get(identity) ?? [];
        group.push(record);
        nameGroups.set(identity, group);
    }

    function markGroups(
        groups: Map<string, PreparedImportProduct[]>,
        code: string,
        message: string,
    ) {
        for (const group of groups.values()) {
            if (group.length < 2) continue;

            for (const record of group) {
                record.status = "NEEDS_REVIEW";

                record.duplicateKeys = [
                    ...new Set([
                        ...record.duplicateKeys,
                        ...group
                            .filter(other => other.key !== record.key)
                            .map(other => other.key),
                    ]),
                ];

                record.issues.push({
                    severity: "WARNING",
                    field: code === "REPEATED_PRODUCT_CODE"
                        ? "sourceCode"
                        : "name",
                    code,
                    message,
                });
            }
        }
    }

    markGroups(
        codeGroups,
        "REPEATED_PRODUCT_CODE",
        "ეს კოდი რამდენიმე ჩანაწერში მეორდება. გადაამოწმე, ერთი პროდუქტის ვარიანტებია, სხვადასხვა ფურცელში აღწერილი იგივე პროდუქტია თუ შეცდომით გამეორებული კოდი. ავტომატურად არ გავაერთიანებთ.",
    );

    markGroups(
        nameGroups,
        "SIMILAR_PRODUCT",
        "სახელი, ბრენდი, ფერი და ზომა სხვა ჩანაწერს ემთხვევა. ეს მხოლოდ შესაძლო დამთხვევაა — გადაამოწმე ჩანაწერების კავშირი. რაოდენობებს ავტომატურად არ შევკრებთ.",
    );

    return { records, mappingProblems };
}