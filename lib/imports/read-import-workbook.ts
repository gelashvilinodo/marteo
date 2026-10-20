import type {
    ImportCellValue,
    ImportFileReadIssue,
    ParsedImportFile,
    ParsedImportRow,
} from "./import-file-types";

export async function readImportWorkbook(
    originalName: string,
    buffer: ArrayBuffer,
): Promise<ParsedImportFile> {
    const extension = originalName
        .split(".")
        .pop()
        ?.toLowerCase();

    if (extension !== "xlsx" && extension !== "numbers") {
        throw new Error("აირჩიე Excel ან Apple Numbers ფაილი.");
    }

    const bytes = new Uint8Array(buffer);

    if (
        bytes.length < 4 ||
        bytes[0] !== 0x50 ||
        bytes[1] !== 0x4b ||
        bytes[2] !== 0x03 ||
        bytes[3] !== 0x04
    ) {
        throw new Error(
            "ფაილის შიგთავსი Excel/Numbers ფორმატს არ შეესაბამება.",
        );
    }

    const digest = await crypto.subtle.digest("SHA-256", buffer);

    const sha256 = Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");

    const XLSX = await import("xlsx");

    let workbook: ReturnType<typeof XLSX.read>;

    try {
        workbook = XLSX.read(buffer, {
            type: "array",
            dense: false,
            cellDates: false,
            cellFormula: true,
            cellNF: true,
            cellText: true,
            sheetStubs: true,
            bookVBA: false,
            bookDeps: false,
        });
    } catch {
        throw new Error(
            "ფაილი ვერ გაიხსნა. შესაძლოა დაზიანებულია, პაროლითაა დაცული ან მისი ვერსია არ არის მხარდაჭერილი.",
        );
    }

    if (!workbook.SheetNames.length) {
        throw new Error("ფაილში წასაკითხი ცხრილი ვერ მოიძებნა.");
    }

    const issues: ImportFileReadIssue[] = [];

    const sheets = workbook.SheetNames.map(name => {
        const worksheet = workbook.Sheets[name];

        if (!worksheet) {
            throw new Error(`ცხრილი „${name}“ ვერ წაიკითხა.`);
        }

        const metadata = workbook.Workbook?.Sheets?.find(
            sheet => sheet.name === name,
        );

        const hidden = Boolean(metadata?.Hidden);
        const rows = new Map<number, ParsedImportRow>();
        let formulasWithoutResult = 0;
        let errorCells = 0;

        // მხოლოდ რეალურად არსებული უჯრედები.
        // დიდი ცარიელი დიაპაზონისთვის მილიონობით უჯრედს არ ვქმნით.
        for (const address of Object.keys(worksheet)) {
            if (!/^[A-Z]+[1-9]\d*$/.test(address)) continue;

            const cell = worksheet[address];
            if (!cell) continue;

            const position = XLSX.utils.decode_cell(address);
            const rowNumber = position.r + 1;

            let value: ImportCellValue = null;

            if (
                typeof cell.v === "string" ||
                typeof cell.v === "boolean"
            ) {
                value = cell.v;
            } else if (typeof cell.v === "number") {
                if (!Number.isFinite(cell.v)) {
                    throw new Error(
                        `${name}, ${address}: არასწორი რიცხვითი მნიშვნელობა.`,
                    );
                }

                value = cell.v;
            } else if (
                cell.v !== null &&
                cell.v !== undefined
            ) {
                throw new Error(
                    `${name}, ${address}: უჯრედის მნიშვნელობა დამატებით დამუშავებას მოითხოვს.`,
                );
            }

            const formula =
                typeof cell.f === "string" ? cell.f : null;

            const errorCode = cell.t === "e"
                ? String(cell.v ?? "UNKNOWN")
                : null;

            if (errorCode !== null) {
                errorCells++;
                value = null;
            }

            if (
                formula !== null &&
                (cell.v === undefined || cell.v === null)
            ) {
                formulasWithoutResult++;
            }

            let row = rows.get(rowNumber);

            if (!row) {
                row = { rowNumber, cells: [] };
                rows.set(rowNumber, row);
            }

            row.cells.push({
                address,
                value,
                displayText:
                    typeof cell.w === "string" ? cell.w : null,
                formula,
                numberFormat:
                    typeof cell.z === "string"
                        ? cell.z
                        : typeof cell.z === "number"
                            ? String(cell.z)
                            : null,
                errorCode,
            });
        }

        const sortedRows = [...rows.values()].sort(
            (a, b) => a.rowNumber - b.rowNumber,
        );

        for (const row of sortedRows) {
            row.cells.sort(
                (a, b) =>
                    XLSX.utils.decode_cell(a.address).c -
                    XLSX.utils.decode_cell(b.address).c,
            );
        }

        if (hidden) {
            issues.push({
                severity: "WARNING",
                code: "HIDDEN_SHEET",
                message:
                    `„${name}“ დამალული ცხრილია. მისი გამოყენება ცალკე უნდა დადასტურდეს.`,
                sheetName: name,
                rowNumber: null,
            });
        }

        if (formulasWithoutResult > 0) {
            issues.push({
                severity: "WARNING",
                code: "FORMULA_RESULT_MISSING",
                message:
                    `${formulasWithoutResult} ფორმულას შენახული შედეგი არ აქვს. მნიშვნელობები შესავსები ან გადასამოწმებელია.`,
                sheetName: name,
                rowNumber: null,
            });
        }

        if (errorCells > 0) {
            issues.push({
                severity: "ERROR",
                code: "SOURCE_CELL_ERRORS",
                message:
                    `${errorCells} უჯრედი წყაროშივე შეცდომიანია.`,
                sheetName: name,
                rowNumber: null,
            });
        }

        return {
            name,
            hidden,
            rows: sortedRows,
            mergedRanges: (worksheet["!merges"] ?? []).map(
                range => ({
                    startRow: range.s.r + 1,
                    startColumn: range.s.c + 1,
                    endRow: range.e.r + 1,
                    endColumn: range.e.c + 1,
                }),
            ),
        };
    });

    function metadataDate(value: unknown): string | null {
        if (!(value instanceof Date)) return null;
        if (!Number.isFinite(value.getTime())) return null;

        return value.toISOString();
    }

    return {
        parserVersion: 1,
        originalName,
        format: extension,
        byteSize: buffer.byteLength,
        sha256,
        excelDateSystem: extension === "xlsx"
            ? workbook.Workbook?.WBProps?.date1904
                ? "1904"
                : "1900"
            : null,
        documentCreatedAt: metadataDate(
            workbook.Props?.CreatedDate,
        ),
        documentModifiedAt: metadataDate(
            workbook.Props?.ModifiedDate,
        ),
        csvDelimiter: null,
        sheets,
        issues,
    };
}