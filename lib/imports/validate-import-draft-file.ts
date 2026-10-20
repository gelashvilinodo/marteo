import type {
    ParsedImportFile,
    ImportFileReadIssue,
} from "./import-file-types";

export class ImportDraftFileError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ImportDraftFileError";
    }
}

function fail(path: string, message: string): never {
    throw new ImportDraftFileError(
        `${path}: ${message} ეს სამუშაო მონაცემების სტრუქტურის პრობლემაა და არა ფაილში ბიზნესინფორმაციის ნაკლებობა.`,
    );
}

function object(
    value: unknown,
    path: string,
): Record<string, unknown> {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail(path, "მოსალოდნელია მონაცემების ობიექტი.");
    }

    return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) {
        fail(path, "მოსალოდნელია მონაცემების სია.");
    }

    return value;
}

function text(value: unknown, path: string): string {
    if (typeof value !== "string") {
        fail(path, "მოსალოდნელია ტექსტი.");
    }

    return value;
}

function nullableText(
    value: unknown,
    path: string,
): string | null {
    return value === null ? null : text(value, path);
}

function integer(
    value: unknown,
    path: string,
    minimum: number,
): number {
    if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        value < minimum
    ) {
        fail(path, `მოსალოდნელია მთელი რიცხვი, მინიმუმ ${minimum}.`);
    }

    return value;
}

function boolean(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") {
        fail(path, "მოსალოდნელია ლოგიკური მნიშვნელობა.");
    }

    return value;
}

function timestamp(
    value: unknown,
    path: string,
): string | null {
    const result = nullableText(value, path);

    if (result !== null && !Number.isFinite(Date.parse(result))) {
        fail(path, "ფაილის მეტამონაცემის თარიღი არასწორია.");
    }

    return result;
}

export function validateImportDraftFile(
    value: unknown,
): ParsedImportFile {
    const input = object(value, "ფაილი");

    if (input.parserVersion !== 1) {
        fail("ფაილი", "ამოკითხვის ვერსია მხარდაჭერილი არ არის.");
    }

    const originalName = text(input.originalName, "ფაილის სახელი");

    if (!originalName.trim()) {
        fail("ფაილის სახელი", "სახელი ცარიელია.");
    }

    const format = input.format;

    if (
        format !== "xlsx" &&
        format !== "csv" &&
        format !== "numbers"
    ) {
        fail("ფაილის ტიპი", "ამოკითხული ფაილის ტიპი უცნობია.");
    }

    const byteSize = integer(input.byteSize, "ფაილის ზომა", 0);

    if (byteSize > 2147483647) {
        fail(
            "ფაილის ზომა",
            "ზომა მონაცემთა ბაზის ამ ველის დასაშვებ დიაპაზონს სცდება.",
        );
    }

    const sha256 = text(input.sha256, "ფაილის ჰეში").toLowerCase();

    if (!/^[0-9a-f]{64}$/.test(sha256)) {
        fail("ფაილის ჰეში", "SHA-256 მნიშვნელობა არასწორია.");
    }

    const excelDateSystem = input.excelDateSystem;

    if (
        excelDateSystem !== null &&
        excelDateSystem !== "1900" &&
        excelDateSystem !== "1904"
    ) {
        fail("თარიღების სისტემა", "მნიშვნელობა უცნობია.");
    }

    const sheetNames = new Set<string>();

    const sheets = array(input.sheets, "ფურცლები").map(
        (rawSheet, sheetIndex) => {
            const path = `ფურცელი ${sheetIndex + 1}`;
            const sheet = object(rawSheet, path);
            const name = text(sheet.name, `${path} / სახელი`);

            if (!name.trim() || sheetNames.has(name)) {
                fail(path, "ფურცლის სახელი ცარიელია ან მეორდება.");
            }

            sheetNames.add(name);

            const rowNumbers = new Set<number>();

            const rows = array(sheet.rows, `${path} / რიგები`).map(
                rawRow => {
                    const row = object(rawRow, `${path} / რიგი`);
                    const rowNumber = integer(
                        row.rowNumber,
                        `${path} / რიგის ნომერი`,
                        1,
                    );

                    if (rowNumbers.has(rowNumber)) {
                        fail(path, `რიგი ${rowNumber} მეორდება.`);
                    }

                    rowNumbers.add(rowNumber);

                    const rowPath = `${path} / რიგი ${rowNumber}`;
                    const addresses = new Set<string>();

                    const cells = array(
                        row.cells,
                        `${rowPath} / უჯრედები`,
                    ).map(rawCell => {
                        const cell = object(rawCell, rowPath);
                        const address = text(
                            cell.address,
                            `${rowPath} / უჯრედის მისამართი`,
                        );

                        const match = /^([A-Z]+)([1-9]\d*)$/.exec(address);

                        if (
                            !match ||
                            Number(match[2]) !== rowNumber ||
                            addresses.has(address)
                        ) {
                            fail(
                                rowPath,
                                "უჯრედის მისამართი არასწორია ან მეორდება.",
                            );
                        }

                        addresses.add(address);

                        const cellValue = cell.value;

                        if (
                            cellValue !== null &&
                            typeof cellValue !== "string" &&
                            typeof cellValue !== "boolean" &&
                            !(
                                typeof cellValue === "number" &&
                                Number.isFinite(cellValue)
                            )
                        ) {
                            fail(address, "უჯრედის მნიშვნელობა არასწორია.");
                        }

                        return {
                            address,
                            value: cellValue,
                            displayText: nullableText(
                                cell.displayText,
                                `${address} / ნაჩვენები ტექსტი`,
                            ),
                            formula: nullableText(
                                cell.formula,
                                `${address} / ფორმულა`,
                            ),
                            numberFormat: nullableText(
                                cell.numberFormat,
                                `${address} / ფორმატი`,
                            ),
                            errorCode: nullableText(
                                cell.errorCode,
                                `${address} / შეცდომის კოდი`,
                            ),
                        };
                    });

                    return { rowNumber, cells };
                },
            );

            const mergedRanges = array(
                sheet.mergedRanges,
                `${path} / გაერთიანებული უჯრედები`,
            ).map(rawRange => {
                const range = object(rawRange, path);

                const startRow = integer(range.startRow, path, 1);
                const startColumn = integer(range.startColumn, path, 1);
                const endRow = integer(range.endRow, path, 1);
                const endColumn = integer(range.endColumn, path, 1);

                if (startRow > endRow || startColumn > endColumn) {
                    fail(path, "გაერთიანებული უჯრედების საზღვრები არასწორია.");
                }

                return { startRow, startColumn, endRow, endColumn };
            });

            return {
                name,
                hidden: boolean(sheet.hidden, `${path} / ხილვადობა`),
                rows,
                mergedRanges,
            };
        },
    );

    const issues = array(input.issues, "ფაილის შენიშვნები").map(
        (rawIssue): ImportFileReadIssue => {
            const issue = object(rawIssue, "ფაილის შენიშვნა");
            const severity = issue.severity;

            if (severity !== "ERROR" && severity !== "WARNING") {
                fail("ფაილის შენიშვნა", "შეცდომის დონე უცნობია.");
            }

            return {
                severity,
                code: text(issue.code, "შენიშვნის კოდი"),
                message: text(issue.message, "შენიშვნის განმარტება"),
                sheetName: nullableText(
                    issue.sheetName,
                    "შენიშვნის ფურცელი",
                ),
                rowNumber: issue.rowNumber === null
                    ? null
                    : integer(issue.rowNumber, "შენიშვნის რიგი", 1),
            };
        },
    );

    return {
        parserVersion: 1,
        originalName,
        format,
        byteSize,
        sha256,
        excelDateSystem,
        documentCreatedAt: timestamp(
            input.documentCreatedAt,
            "ფაილის შექმნის თარიღი",
        ),
        documentModifiedAt: timestamp(
            input.documentModifiedAt,
            "ფაილის ცვლილების თარიღი",
        ),
        csvDelimiter: nullableText(
            input.csvDelimiter,
            "CSV გამყოფი",
        ),
        sheets,
        issues,
    };
}