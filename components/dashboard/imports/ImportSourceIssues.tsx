import type { ParsedImportFile } from "@/lib/imports/import-file-types";

const errorNames: Record<string, string> = {
    "0": "არასწორი დიაპაზონების გადაკვეთა",
    "7": "ნულზე გაყოფა",
    "15": "არასწორი მნიშვნელობა",
    "23": "არასწორი უჯრედის ბმული",
    "29": "უცნობი ფორმულის სახელი",
    "36": "არასწორი რიცხვითი გამოთვლა",
    "42": "მნიშვნელობა ვერ მოიძებნა",
    "43": "მონაცემები იტვირთება",
};

export default function ImportSourceIssues({
    result,
}: {
    result: ParsedImportFile;
}) {
    const cellIssues = result.sheets.flatMap(sheet =>
        sheet.rows.flatMap(row =>
            row.cells.flatMap(cell => {
                if (cell.errorCode !== null) {
                    return [{
                        location:
                            `${sheet.name} → რიგი ${row.rowNumber} → ${cell.address}`,
                        message:
                            errorNames[cell.errorCode] ??
                            cell.displayText ??
                            `Excel-ის შეცდომა: ${cell.errorCode}`,
                        error: true,
                    }];
                }

                if (
                    cell.formula !== null &&
                    cell.value === null
                ) {
                    return [{
                        location:
                            `${sheet.name} → რიგი ${row.rowNumber} → ${cell.address}`,
                        message:
                            "ფორმულას შენახული შედეგი არ აქვს. მნიშვნელობა შესავსებია.",
                        error: false,
                    }];
                }

                return [];
            }),
        ),
    );

    // უჯრედების საერთო შეტყობინებები ზემოთ უკვე
    // ზუსტი მდებარეობით არის გაშლილი.
    const fileIssues = result.issues
        .filter(issue =>
            ![
                "SOURCE_CELL_ERRORS",
                "FORMULA_RESULT_MISSING",
            ].includes(issue.code),
        )
        .map(issue => ({
            location: [
                issue.sheetName,
                issue.rowNumber !== null
                    ? `რიგი ${issue.rowNumber}`
                    : null,
            ].filter(Boolean).join(" → ") || result.originalName,
            message: issue.message,
            error: issue.severity === "ERROR",
        }));

    const issues = [...cellIssues, ...fileIssues];

    if (!issues.length) return null;

    return (
        <section className="rounded-xl border border-border bg-background p-3">
            <h3 className="font-semibold">
                წყაროს შეცდომები და გაფრთხილებები ({issues.length})
            </h3>

            <ul className="mt-3 max-h-72 space-y-3 overflow-y-auto text-sm">
                {issues.map((issue, index) => (
                    <li key={index}>
                        <p className="font-medium">
                            {issue.location}
                        </p>

                        <p className={
                            issue.error
                                ? "mt-1 text-danger"
                                : "mt-1 text-text-secondary"
                        }>
                            {issue.message}
                        </p>
                    </li>
                ))}
            </ul>
        </section>
    );
}