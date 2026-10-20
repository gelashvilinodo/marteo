import {
    groupImportOrderRows,
    type OrderGroupingRow,
    type OrderGroupingProblem,
    type ImportedOrderGroup,
} from "./group-import-order-rows";
import {
    readOrderImportDate,
} from "./read-order-import-date";
import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";
import type {
    OrderImportOptions,
} from "./order-import-options";

function groupingPhone(value: unknown): string | null {
    let text: string;

    if (typeof value === "string") {
        text = value.normalize("NFC").trim();
    } else if (
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value > 0
    ) {
        text = String(value);
    } else {
        return null;
    }

    if (!/^\+?[\d\s()-]+$/.test(text)) return null;

    let digits = text.replace(/\D/g, "");

    if (digits.startsWith("00")) digits = digits.slice(2);
    if (/^5\d{8}$/.test(digits)) digits = `995${digits}`;

    return /^[1-9]\d{7,14}$/.test(digits)
        ? `+${digits}`
        : null;
}

export function prepareOrderGrouping(input: {
    rows: readonly PreparedOrderSourceRow[];
    options: OrderImportOptions;
}): {
    groups: ImportedOrderGroup[];
    problems: OrderGroupingProblem[];
    sourceRows: Map<string, PreparedOrderSourceRow>;
} {
    const sourceRows = new Map<string, PreparedOrderSourceRow>();
    const groupingRows: OrderGroupingRow[] = [];
    const problems: OrderGroupingProblem[] = [];

    for (const row of input.rows) {
        if (sourceRows.has(row.key)) {
            throw new Error(
                "შეკვეთების დასაჯგუფებელ წყაროში ერთი რიგი მეორდება.",
            );
        }

        sourceRows.set(row.key, row);

        const rawCode = row.input.orderCode;

        const codeMissing =
            rawCode === null ||
            rawCode === undefined ||
            (
                typeof rawCode === "string" &&
                !rawCode.trim()
            );

        let orderCode: string | null = null;

        if (!codeMissing) {
            if (typeof rawCode === "string") {
                orderCode = rawCode.normalize("NFC").trim();
            } else if (
                typeof rawCode === "number" &&
                Number.isSafeInteger(rawCode) &&
                rawCode >= 0
            ) {
                orderCode = String(rawCode);
            } else {
                problems.push({
                    rowKey: row.key,
                    message:
                        "შეკვეთის კოდი ვერ წავიკითხეთ. აირჩიე შესაბამისი " +
                        "სვეტი ან შეასწორე მნიშვნელობა. კოდის საერთოდ " +
                        "არქონის შემთხვევაში შეგიძლია დაჯგუფების სხვა წესი აირჩიო.",
                });
                continue;
            }
        }

        let date: string | null = null;
        let phone: string | null = null;

        if (
            orderCode === null &&
            input.options.grouping === "PHONE_AND_DATE"
        ) {
            const result = readOrderImportDate({
                value: row.input.date,
                fallbackDate: input.options.fallbackDate,
                textOrder: input.options.dateOrder,
                excelDateSystem: row.excelDateSystem,
            });

            if (result.kind === "NEEDS_REVIEW") {
                problems.push({
                    rowKey: row.key,
                    message: result.message,
                });
                continue;
            }

            date = result.date;
            phone = groupingPhone(row.input.phone);

            if (phone === null) {
                problems.push({
                    rowKey: row.key,
                    message:
                        "ტელეფონითა და თარიღით დაჯგუფებისთვის ამ რიგზე " +
                        "სწორი ტელეფონის ნომერი გვჭირდება. შეასწორე ნომერი " +
                        "ან აირჩიე თითოეული რიგის ცალკე შეკვეთად გადმოტანა. " +
                        "თავად შეკვეთის მიღებას მომხმარებელთან კავშირი არ სჭირდება.",
                });
                continue;
            }
        }

        groupingRows.push({
            key: row.key,
            fileId: row.fileId,
            sheetName: row.sheetName,
            rowNumber: row.rowNumber,
            orderCode,
            date,
            phone,
        });
    }

    const grouped = groupImportOrderRows(
        groupingRows,
        input.options.grouping,
    );

    return {
        groups: grouped.groups,
        problems: [...problems, ...grouped.problems],
        sourceRows,
    };
}