export type CustomerImportField =
    | "sourceCode"
    | "phone"
    | "address"
    | "firstName"
    | "lastName";

export type CustomerColumnDefinition = {
    field: CustomerImportField;
    label: string;
    required: boolean;
    aliases: readonly string[];
};

export const CUSTOMER_IMPORT_COLUMNS: readonly CustomerColumnDefinition[] = [
    {
        field: "phone",
        label: "ტელეფონი",
        required: true,
        aliases: [
            "ტელეფონი",
            "ტელეფონის ნომერი",
            "მობილური",
            "მობილურის ნომერი",
            "საკონტაქტო ნომერი",
            "ნომერი",
            "phone",
            "phone number",
            "mobile",
            "mobile number",
            "telephone",
            "tel",
        ],
    },
    {
        field: "address",
        label: "მისამართი",
        required: true,
        aliases: [
            "მისამართი",
            "მომხმარებლის მისამართი",
            "მიწოდების მისამართი",
            "address",
            "customer address",
            "delivery address",
            "shipping address",
        ],
    },
    {
        field: "firstName",
        label: "სახელი",
        required: false,
        aliases: [
            "სახელი",
            "მომხმარებლის სახელი",
            "კლიენტის სახელი",
            "first name",
            "firstname",
            "given name",
            "name",
            "customer name",
        ],
    },
    {
        field: "lastName",
        label: "გვარი",
        required: false,
        aliases: [
            "გვარი",
            "მომხმარებლის გვარი",
            "კლიენტის გვარი",
            "last name",
            "lastname",
            "surname",
            "family name",
        ],
    },
    {
        field: "sourceCode",
        label: "კოდი ფაილში",
        required: false,
        aliases: [
            "კოდი",
            "მომხმარებლის კოდი",
            "კლიენტის კოდი",
            "მომხმარებლის id",
            "კლიენტის id",
            "id",
            "code",
            "customer id",
            "customer code",
            "client id",
            "client code",
        ],
    },
];

export type CustomerColumnCandidate = {
    columnIndex: number;
    header: string;
};

export type CustomerColumnDetection = {
    field: CustomerImportField;
    label: string;
    required: boolean;
    status: "MATCHED" | "MISSING" | "AMBIGUOUS";
    selectedColumnIndex: number | null;
    candidates: CustomerColumnCandidate[];
};

export function normalizeImportHeader(value: string): string {
    return value
        .normalize("NFKC")
        .toLocaleLowerCase("en-US")
        .replace(/[\p{P}\p{S}_]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function detectCustomerColumns(
    headers: readonly {
        columnIndex: number;
        value: unknown;
    }[],
): CustomerColumnDetection[] {
    const normalizedHeaders = headers
        .filter(
            (header): header is {
                columnIndex: number;
                value: string;
            } =>
                typeof header.value === "string" &&
                Number.isInteger(header.columnIndex) &&
                header.columnIndex >= 1,
        )
        .map(header => ({
            columnIndex: header.columnIndex,
            header: header.value.trim(),
            normalized: normalizeImportHeader(header.value),
        }))
        .filter(header => header.normalized.length > 0);

    const detections = CUSTOMER_IMPORT_COLUMNS.map(
        (definition): CustomerColumnDetection => {
            const aliases = new Set(
                definition.aliases.map(normalizeImportHeader),
            );

            const candidates = normalizedHeaders
                .filter(header => aliases.has(header.normalized))
                .map(header => ({
                    columnIndex: header.columnIndex,
                    header: header.header,
                }));

            return {
                field: definition.field,
                label: definition.label,
                required: definition.required,
                status:
                    candidates.length === 0
                        ? "MISSING"
                        : candidates.length === 1
                            ? "MATCHED"
                            : "AMBIGUOUS",
                selectedColumnIndex:
                    candidates.length === 1
                        ? candidates[0].columnIndex
                        : null,
                candidates,
            };
        },
    );

    // ერთი სვეტი რამდენიმე სხვადასხვა ველს ავტომატურად არ მიენიჭოს.
    const columnUsage = new Map<number, number>();

    for (const detection of detections) {
        for (const candidate of detection.candidates) {
            columnUsage.set(
                candidate.columnIndex,
                (columnUsage.get(candidate.columnIndex) ?? 0) + 1,
            );
        }
    }

    return detections.map(detection => {
        const hasConflict = detection.candidates.some(
            candidate =>
                (columnUsage.get(candidate.columnIndex) ?? 0) > 1,
        );

        if (!hasConflict) return detection;

        return {
            ...detection,
            status: "AMBIGUOUS",
            selectedColumnIndex: null,
        };
    });
}