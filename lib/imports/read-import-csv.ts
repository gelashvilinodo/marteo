import type {
    ImportFileReadIssue,
    ParsedImportFile,
    ParsedImportRow,
} from "./import-file-types";

type CsvOptions = {
    delimiter?: "," | ";" | "\t" | "|";
    encoding?: string;
};

function columnName(index: number): string {
    let result = "";
    let value = index + 1;

    while (value > 0) {
        value--;
        result =
            String.fromCharCode(65 + value % 26) +
            result;
        value = Math.floor(value / 26);
    }

    return result;
}

export async function readImportCsv(
    originalName: string,
    buffer: ArrayBuffer,
    options: CsvOptions = {},
): Promise<ParsedImportFile> {
    if (!/\.csv$/i.test(originalName)) {
        throw new Error("აირჩიე CSV ფაილი.");
    }

    const bytes = new Uint8Array(buffer);

    if (!bytes.length) {
        throw new Error("CSV ფაილი ცარიელია.");
    }

    let encoding = options.encoding ?? "utf-8";

    // BOM-ის არსებობისას კოდირება თვითონ ფაილიდან დგინდება.
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
        encoding = "utf-16le";
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
        encoding = "utf-16be";
    } else if (
        bytes[0] === 0xef &&
        bytes[1] === 0xbb &&
        bytes[2] === 0xbf
    ) {
        encoding = "utf-8";
    }

    let text: string;

    try {
        text = new TextDecoder(encoding, {
            fatal: true,
        }).decode(buffer);
    } catch {
        throw new Error(
            "CSV-ის ტექსტი ვერ წაიკითხა. ფაილის კოდირება უნდა შეირჩეს.",
        );
    }

    if (!text.trim()) {
        throw new Error("CSV ფაილში მონაცემები არ არის.");
    }

    if (text.includes("\0")) {
        throw new Error(
            "CSV-ის კოდირება არასწორია ან ფაილი ტექსტური CSV არ არის.",
        );
    }

    const issues: ImportFileReadIssue[] = [];
    const sheetName = "CSV";
    const rows: ParsedImportRow[] = [];

    let delimiter: string | undefined = options.delimiter;
    let sourceRow = 1;

    // Excel-ის ზოგიერთ CSV-ს დასაწყისში აქვს sep=;.
    const separatorLine =
        /^sep=([,;\t|])(?:\r\n|\n|\r)/i.exec(text);

    if (separatorLine) {
        const declaredDelimiter = separatorLine[1];

        if (
            delimiter !== undefined &&
            delimiter !== declaredDelimiter
        ) {
            throw new Error(
                "არჩეული გამყოფი ფაილის sep= წესს არ ემთხვევა.",
            );
        }

        delimiter = declaredDelimiter;
        text = text.slice(separatorLine[0].length);
        sourceRow = 2;

        issues.push({
            severity: "WARNING",
            code: "CSV_SEPARATOR_DECLARATION",
            message:
                "პირველი რიგი გამყოფის წესია და მონაცემებად არ ჩაითვლება.",
            sheetName,
            rowNumber: 1,
        });
    }

    const { default: Papa } = await import("papaparse");

    let previousCursor = 0;
    let detectedDelimiter = delimiter ?? null;

    Papa.parse<string[]>(text, {
        header: false,
        dynamicTyping: false,
        skipEmptyLines: false,
        comments: false,
        delimiter,
        delimitersToGuess: [",", ";", "\t", "|"],

        step(result) {
            const rowNumber = sourceRow;

            if (result.meta.delimiter) {
                detectedDelimiter = result.meta.delimiter;
            }

            for (const issue of result.errors) {
                const ambiguousDelimiter =
                    issue.code === "UndetectableDelimiter";

                issues.push({
                    severity: ambiguousDelimiter
                        ? "WARNING"
                        : "ERROR",
                    code: `CSV_${issue.code}`,
                    message: ambiguousDelimiter
                        ? "სვეტების გამყოფი ერთმნიშვნელოვნად ვერ დადგინდა. გადაამოწმე ცხრილი ან აირჩიე გამყოფი."
                        : `CSV-ის რიგი ვერ დამუშავდა სწორად: ${issue.message}`,
                    sheetName,
                    rowNumber,
                });
            }

            rows.push({
                rowNumber,
                cells: result.data.map((value, index) => ({
                    address: `${columnName(index)}${rowNumber}`,
                    value,
                    displayText: value,
                    formula: null,
                    numberFormat: null,
                    errorCode: null,
                })),
            });

            // ბრჭყალებში მოქცეული ტექსტი შეიძლება რამდენიმე
            // ფიზიკურ ხაზს იკავებდეს. წყაროს ნომერი არ იკარგება.
            const consumed = text.slice(
                previousCursor,
                result.meta.cursor,
            );

            sourceRow +=
                consumed.match(/\r\n|\r|\n/g)?.length ?? 0;

            previousCursor = result.meta.cursor;
        },
    });

    if (!rows.some(row =>
        row.cells.some(cell =>
            typeof cell.value === "string" &&
            cell.value.trim() !== "",
        ),
    )) {
        throw new Error("CSV ფაილში მონაცემები არ არის.");
    }

    const digest = await crypto.subtle.digest(
        "SHA-256",
        buffer,
    );

    const sha256 = Array.from(new Uint8Array(digest))
        .map(byte => byte.toString(16).padStart(2, "0"))
        .join("");

    return {
        parserVersion: 1,
        originalName,
        format: "csv",
        byteSize: buffer.byteLength,
        sha256,
        excelDateSystem: null,
        documentCreatedAt: null,
        documentModifiedAt: null,
        csvDelimiter: detectedDelimiter,
        sheets: [{
            name: sheetName,
            hidden: false,
            rows,
            mergedRanges: [],
        }],
        issues,
    };
}