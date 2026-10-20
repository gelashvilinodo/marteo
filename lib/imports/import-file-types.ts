export type ImportFileFormat = "xlsx" | "csv" | "numbers";

export type ImportCellValue =
    | string
    | number
    | boolean
    | null;

export type ParsedImportCell = {
    // მაგალითად: A1, B12.
    address: string;

    // წყაროში შენახული მნიშვნელობა.
    value: ImportCellValue;

    // Excel-ში ნაჩვენები ტექსტი:
    // შეიძლება შეიცავდეს ფორმატირებულ თარიღს ან საწყის ნულებს.
    displayText: string | null;

    // ფორმულას არ ვასრულებთ; მხოლოდ ვინარჩუნებთ.
    formula: string | null;

    // Excel-ის უჯრედის ფორმატირების წესი.
    numberFormat: string | null;

    // Excel-ის შეცდომის კოდი, თუ უჯრედი შეცდომიანია.
    errorCode: string | null;
};

export type ParsedImportRow = {
    // წყაროს რეალური რიგის ნომერი, 1-დან.
    rowNumber: number;
    cells: ParsedImportCell[];
};

export type ImportMergedRange = {
    startRow: number;
    startColumn: number;
    endRow: number;
    endColumn: number;
};

export type ParsedImportSheet = {
    name: string;
    hidden: boolean;
    rows: ParsedImportRow[];
    mergedRanges: ImportMergedRange[];
};

export type ImportFileReadIssue = {
    severity: "ERROR" | "WARNING";
    code: string;
    message: string;
    sheetName: string | null;
    rowNumber: number | null;
};

export type ParsedImportFile = {
    parserVersion: 1;
    originalName: string;
    format: ImportFileFormat;
    byteSize: number;
    sha256: string;

    // მხოლოდ Excel-ისთვის; CSV/Numbers-ზე null.
    excelDateSystem: "1900" | "1904" | null;

    // ფაილის მეტამონაცემები — არა შეკვეთების თარიღები.
    documentCreatedAt: string | null;
    documentModifiedAt: string | null;

    csvDelimiter: string | null;
    sheets: ParsedImportSheet[];
    issues: ImportFileReadIssue[];
};