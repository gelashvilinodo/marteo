import {
    normalizeImportHeader,
} from "./detect-customer-columns";

export type OrderImportField =
    | "orderCode"
    | "date"
    | "productCode"
    | "name"
    | "quantity"
    | "unitPrice"
    | "lineTotal"
    | "unitCost"
    | "orderTotal"
    | "paidAmount"
    | "paymentDate"
    | "paymentStatus"
    | "status"
    | "phone"
    | "address"
    | "firstName"
    | "lastName"
    | "courierFee"
    | "color"
    | "size"
    | "notes";

type ColumnDefinition = {
    field: OrderImportField;
    label: string;
    aliases: readonly string[];
};

export const ORDER_IMPORT_COLUMNS: readonly ColumnDefinition[] = [
    {
        field: "orderCode",
        label: "შეკვეთის კოდი",
        aliases: [
            "შეკვეთის კოდი", "შეკვეთის ნომერი",
            "order code", "order number", "order id",
        ],
    },
    {
        field: "date",
        label: "შეკვეთის თარიღი",
        aliases: [
            "თარიღი", "შეკვეთის თარიღი",
            "date", "order date", "created at",
        ],
    },
    {
        field: "productCode",
        label: "პროდუქტის კოდი",
        aliases: [
            "sku", "პროდუქტის კოდი", "არტიკული",
            "product code", "item code", "product id",
        ],
    },
    {
        field: "name",
        label: "პროდუქტის სახელი",
        aliases: [
            "პროდუქტი", "პროდუქტის სახელი",
            "პროდუქტის დასახელება", "საქონელი",
            "დასახელება", "product", "product name", "item name",
        ],
    },
    {
        field: "quantity",
        label: "რაოდენობა",
        aliases: [
            "რაოდენობა", "ცალი", "quantity", "qty",
        ],
    },
    {
        field: "unitPrice",
        label: "ერთეულის გასაყიდი ფასი",
        aliases: [
            "ფასი", "გასაყიდი ფასი", "ერთეულის ფასი",
            "price", "unit price", "sale price",
        ],
    },
    {
        field: "lineTotal",
        label: "პროდუქტის ხაზის ჯამი",
        aliases: [
            "სტრიქონის ჯამი", "ხაზის ჯამი",
            "პროდუქტის ჯამი", "line total", "item total",
        ],
    },
    {
        field: "unitCost",
        label: "ერთეულის თვითღირებულება",
        aliases: [
            "თვითღირებულება", "შესყიდვის ფასი",
            "ერთეულის თვითღირებულება",
            "unit cost", "cost price", "purchase price",
        ],
    },
    {
        field: "orderTotal",
        label: "შეკვეთის სრული თანხა",
        aliases: [
            "შეკვეთის თანხა", "შეკვეთის ჯამი",
            "order total", "grand total",
        ],
    },
    {
        field: "paidAmount",
        label: "გადახდილი თანხა",
        aliases: [
            "გადახდილი თანხა", "ჩარიცხული თანხა",
            "paid amount", "amount paid", "received amount",
        ],
    },
    {
        field: "paymentDate",
        label: "თანხის მიღების თარიღი",
        aliases: [
            "გადახდის თარიღი",
            "ჩარიცხვის თარიღი",
            "თანხის მიღების თარიღი",
            "payment date",
            "paid date",
            "paid at",
            "received date",
        ],
    },
    {
        field: "paymentStatus",
        label: "გადახდის მდგომარეობა",
        aliases: [
            "გადახდის სტატუსი", "გადახდის მდგომარეობა",
            "payment status",
        ],
    },
    {
        field: "status",
        label: "შეკვეთის სტატუსი",
        aliases: [
            "სტატუსი", "შეკვეთის სტატუსი",
            "status", "order status",
        ],
    },
    {
        field: "phone",
        label: "ტელეფონი",
        aliases: [
            "ტელეფონი", "ტელეფონის ნომერი",
            "მობილური", "მობილურის ნომერი",
            "phone", "phone number", "mobile", "telephone",
        ],
    },
    {
        field: "address",
        label: "მისამართი",
        aliases: [
            "მისამართი", "მიწოდების მისამართი",
            "address", "shipping address", "delivery address",
        ],
    },
    {
        field: "firstName",
        label: "მომხმარებლის სახელი",
        aliases: [
            "სახელი", "მომხმარებლის სახელი",
            "first name", "customer name", "recipient name",
        ],
    },
    {
        field: "lastName",
        label: "მომხმარებლის გვარი",
        aliases: [
            "გვარი", "მომხმარებლის გვარი",
            "last name", "surname",
        ],
    },
    {
        field: "courierFee",
        label: "კურიერის საფასური",
        aliases: [
            "კურიერის საფასური", "მიწოდების საფასური",
            "courier fee", "shipping fee", "delivery fee",
        ],
    },
    {
        field: "color",
        label: "ფერი",
        aliases: ["ფერი", "color", "colour"],
    },
    {
        field: "size",
        label: "ზომა",
        aliases: ["ზომა", "size"],
    },
    {
        field: "notes",
        label: "შენიშვნა",
        aliases: [
            "შენიშვნა", "კომენტარი", "შენიშვნები",
            "notes", "note", "comment",
        ],
    },
];

export type OrderColumnDetection = {
    field: OrderImportField;
    label: string;
    status: "MATCHED" | "MISSING" | "AMBIGUOUS";
    selectedColumnIndex: number | null;
    candidates: {
        columnIndex: number;
        header: string;
    }[];
};

export function detectOrderColumns(
    headers: readonly {
        columnIndex: number;
        value: unknown;
    }[],
): OrderColumnDetection[] {
    const normalizedHeaders = headers.flatMap(header => {
        if (
            typeof header.value !== "string" ||
            !Number.isSafeInteger(header.columnIndex) ||
            header.columnIndex < 1
        ) {
            return [];
        }

        const normalized = normalizeImportHeader(header.value);

        return normalized
            ? [{
                columnIndex: header.columnIndex,
                header: header.value.trim(),
                normalized,
            }]
            : [];
    });

    const detections = ORDER_IMPORT_COLUMNS.map(
        (definition): OrderColumnDetection => {
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

    const owners = new Map<number, Set<OrderImportField>>();

    for (const detection of detections) {
        for (const candidate of detection.candidates) {
            const fields =
                owners.get(candidate.columnIndex) ??
                new Set<OrderImportField>();

            fields.add(detection.field);
            owners.set(candidate.columnIndex, fields);
        }
    }

    return detections.map(detection => {
        const conflict = detection.candidates.some(
            candidate =>
                (owners.get(candidate.columnIndex)?.size ?? 0) > 1,
        );

        return conflict
            ? {
                ...detection,
                status: "AMBIGUOUS" as const,
                selectedColumnIndex: null,
            }
            : detection;
    });
}