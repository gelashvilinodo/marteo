import {
    normalizeImportHeader,
} from "./detect-customer-columns";

export type ProductImportField =
    | "sourceCode"
    | "name"
    | "brand"
    | "description"
    | "category"
    | "color"
    | "size"
    | "salePrice"
    | "currentStock"
    | "unitCost"
    | "imageReference";

export type ProductColumnDefinition = {
    field: ProductImportField;
    label: string;
    required: boolean;
    aliases: readonly string[];
};

export const PRODUCT_IMPORT_COLUMNS:
    readonly ProductColumnDefinition[] = [
        {
            field: "name",
            label: "პროდუქტის სახელი",
            required: true,
            aliases: [
                "პროდუქტი",
                "პროდუქტის სახელი",
                "პროდუქტის დასახელება",
                "საქონელი",
                "საქონლის დასახელება",
                "დასახელება",
                "სახელი",
                "product",
                "product name",
                "item name",
                "name",
            ],
        },
        {
            field: "sourceCode",
            label: "კოდი ფაილში",
            required: false,
            aliases: [
                "sku",
                "კოდი",
                "პროდუქტის კოდი",
                "საქონლის კოდი",
                "არტიკული",
                "ბარკოდი",
                "product code",
                "item code",
                "product id",
                "barcode",
                "code",
            ],
        },
        {
            field: "brand",
            label: "ბრენდი",
            required: false,
            aliases: [
                "ბრენდი",
                "მწარმოებელი",
                "brand",
                "manufacturer",
            ],
        },
        {
            field: "description",
            label: "აღწერა",
            required: false,
            aliases: [
                "აღწერა",
                "პროდუქტის აღწერა",
                "description",
                "product description",
            ],
        },
        {
            field: "category",
            label: "კატეგორია",
            required: false,
            aliases: [
                "კატეგორია",
                "პროდუქტის კატეგორია",
                "category",
                "product category",
            ],
        },
        {
            field: "color",
            label: "ფერი",
            required: false,
            aliases: ["ფერი", "color", "colour"],
        },
        {
            field: "size",
            label: "ზომა",
            required: false,
            aliases: ["ზომა", "size"],
        },
        {
            field: "salePrice",
            label: "გასაყიდი ფასი",
            required: false,
            aliases: [
                "გასაყიდი ფასი",
                "გაყიდვის ფასი",
                "საცალო ფასი",
                "sale price",
                "selling price",
                "retail price",
            ],
        },
        {
            field: "currentStock",
            label: "რაოდენობა / ნაშთი",
            required: false,
            aliases: [
                "მიმდინარე ნაშთი",
                "ნაშთი",
                "მარაგი",
                "რაოდენობა",
                "current stock",
                "stock",
                "stock quantity",
                "quantity",
                "qty",
                "balance",
            ],
        },
        {
            field: "unitCost",
            label: "ერთეულის სრული თვითღირებულება",
            required: false,
            aliases: [
                "თვითღირებულება",
                "ერთეულის თვითღირებულება",
                "სრული თვითღირებულება",
                "unit cost",
                "cost per unit",
                "landed unit cost",
            ],
        },
        {
            field: "imageReference",
            label: "ფოტოს ბმული / მითითება",
            required: false,
            aliases: [
                "ფოტო",
                "ფოტოს ბმული",
                "სურათი",
                "სურათის ბმული",
                "image",
                "image url",
                "photo",
                "photo url",
                "picture",
            ],
        },
    ];

export type ProductColumnDetection = {
    field: ProductImportField;
    label: string;
    required: boolean;
    status: "MATCHED" | "MISSING" | "AMBIGUOUS";
    selectedColumnIndex: number | null;
    candidates: {
        columnIndex: number;
        header: string;
    }[];
};

export function detectProductColumns(
    headers: readonly {
        columnIndex: number;
        value: unknown;
    }[],
): ProductColumnDetection[] {
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

    const detections = PRODUCT_IMPORT_COLUMNS.map(
        (definition): ProductColumnDetection => {
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

    const columnUsage = new Map<number, number>();

    for (const detection of detections) {
        for (const candidate of detection.candidates) {
            columnUsage.set(
                candidate.columnIndex,
                (columnUsage.get(candidate.columnIndex) ?? 0) + 1,
            );
        }
    }

    return detections.map(
        (detection): ProductColumnDetection => {
            const conflict = detection.candidates.some(
                candidate =>
                    (columnUsage.get(candidate.columnIndex) ?? 0) > 1,
            );

            return conflict
                ? {
                    ...detection,
                    status: "AMBIGUOUS",
                    selectedColumnIndex: null,
                }
                : detection;
        },
    );
}