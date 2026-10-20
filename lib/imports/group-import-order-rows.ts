import type {
    OrderImportOptions,
} from "./order-import-options";

export type OrderGroupingRow = {
    key: string;
    fileId: string;
    sheetName: string;
    rowNumber: number;
    orderCode: string | null;

    // უკვე შემოწმებული თარიღი და ნორმალიზებული ტელეფონი.
    date: string | null;
    phone: string | null;
};

export type ImportedOrderGroup = {
    key: string;
    method: "CODE" | "EACH_ROW" | "PHONE_AND_DATE";
    rows: OrderGroupingRow[];
    requiresConfirmation: boolean;
};

export type OrderGroupingProblem = {
    rowKey: string;
    message: string;
};

export function groupImportOrderRows(
    rows: readonly OrderGroupingRow[],
    grouping: OrderImportOptions["grouping"],
): {
    groups: ImportedOrderGroup[];
    problems: OrderGroupingProblem[];
} {
    const groups = new Map<string, ImportedOrderGroup>();
    const problems: OrderGroupingProblem[] = [];
    const seenKeys = new Set<string>();

    for (const row of rows) {
        if (seenKeys.has(row.key)) {
            throw new Error(
                "შეკვეთის წყაროს ერთი რიგი დაჯგუფებაში ორჯერ მოხვდა.",
            );
        }

        seenKeys.add(row.key);

        const orderCode = row.orderCode
            ?.normalize("NFC")
            .trim() || null;

        let method: ImportedOrderGroup["method"];
        let identity: string[];

        if (orderCode !== null) {
            method = "CODE";
            identity = ["CODE", orderCode];
        } else if (grouping === "EACH_ROW") {
            method = "EACH_ROW";
            identity = ["EACH_ROW", row.key];
        } else if (grouping === "PHONE_AND_DATE") {
            if (!row.phone || !row.date) {
                problems.push({
                    rowKey: row.key,
                    message:
                        "შეკვეთის კოდი არ არის მითითებული და ტელეფონითა " +
                        "და თარიღით დაჯგუფებისთვის ორივე მონაცემი გვჭირდება. " +
                        "შეავსე გამოტოვებული მონაცემი ან აირჩიე თითოეული " +
                        "რიგის ცალკე შეკვეთად გადმოტანა.",
                });
                continue;
            }

            method = "PHONE_AND_DATE";
            identity = ["PHONE_AND_DATE", row.phone, row.date];
        } else {
            problems.push({
                rowKey: row.key,
                message:
                    "შეკვეთის კოდი არ არის მითითებული. აირჩიე, " +
                    "თითოეული რიგი ცალკე შეკვეთაა თუ რამდენიმე რიგი " +
                    "ტელეფონითა და თარიღით უნდა გაერთიანდეს.",
            });
            continue;
        }

        // სხვადასხვა ფაილისა და ფურცლის ერთნაირი კოდები
        // ავტომატურად ერთ შეკვეთად არ ერთიანდება.
        const groupKey = JSON.stringify([
            row.fileId,
            row.sheetName,
            ...identity,
        ]);

        const existing = groups.get(groupKey);

        if (existing) {
            existing.rows.push(row);
        } else {
            groups.set(groupKey, {
                key: groupKey,
                method,
                rows: [row],
                requiresConfirmation: method === "PHONE_AND_DATE",
            });
        }
    }

    return {
        groups: [...groups.values()].map(group => ({
            ...group,
            rows: [...group.rows].sort(
                (left, right) => left.rowNumber - right.rowNumber,
            ),
        })),
        problems,
    };
}