import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";
import type {
    ImportIssue,
    ImportValidationResult,
} from "./import-types";

export function readImportOrderNotes(
    rows: readonly PreparedOrderSourceRow[],
): ImportValidationResult<string | null> {
    const notes = new Set<string>();
    const issues: ImportIssue[] = [];

    for (const row of rows) {
        const sourceErrors = row.issues.filter(
            issue =>
                issue.severity === "ERROR" &&
                issue.field === "notes",
        );

        if (sourceErrors.length > 0) {
            issues.push(...sourceErrors.map(issue => ({
                ...issue,
                message:
                    `რიგი ${row.rowNumber}: ${issue.message}`,
            })));
            continue;
        }

        const value = row.input.notes;

        if (value === null || value === undefined) continue;

        if (typeof value !== "string") {
            issues.push({
                severity: "ERROR",
                field: "notes",
                code: "INVALID_ORDER_NOTES",
                message:
                    `რიგი ${row.rowNumber}: შენიშვნის სვეტში ტექსტის ` +
                    "ნაცვლად სხვა ტიპის მნიშვნელობაა. გადაამოწმე " +
                    "არჩეული სვეტი ან შეასწორე მონაცემი.",
            });
            continue;
        }

        const text = value
            .normalize("NFC")
            .replace(/\r\n?/g, "\n")
            .trim();

        if (text) notes.add(text);
    }

    if (issues.length > 0) {
        return {
            valid: false,
            data: null,
            issues,
        };
    }

    return {
        valid: true,
        data: notes.size > 0
            ? [...notes].join("\n\n")
            : null,
        issues: [],
    };
}