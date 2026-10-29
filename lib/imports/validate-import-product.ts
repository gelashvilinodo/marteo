import type {
    ImportIssue,
    ImportValidationResult,
} from "./import-types";
import type {
    ProductImportMapping,
} from "./product-import-mapping";
import { validateImportMoney } from "./validate-import-money";

export type ImportedProduct = {
    sourceCode: string | null;
    name: string;
    brand: string | null;
    description: string | null;
    category: string | null;
    color: string | null;
    size: string | null;
    salePrice: string | null;
    currentStock: number | null;
    unitCost: string | null;
    imageReference: string | null;
};

type Options = Pick<
    ProductImportMapping,
    "mode" | "decimalSeparator"
>;

export function validateImportProduct(
    value: unknown,
    options: Options,
): ImportValidationResult<ImportedProduct> {
    const issues: ImportIssue[] = [];

    function issue(
        severity: ImportIssue["severity"],
        field: string | null,
        code: string,
        message: string,
    ) {
        issues.push({ severity, field, code, message });
    }

    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        return {
            valid: false,
            data: null,
            issues: [{
                severity: "ERROR",
                field: null,
                code: "INVALID_PRODUCT",
                message:
                    "პროდუქტის სამუშაო მონაცემები ვერ წავიკითხეთ. გადაამოწმე სვეტების დაკავშირება.",
            }],
        };
    }

    const input = value as Record<string, unknown>;

    function empty(raw: unknown): boolean {
        return (
            raw === undefined ||
            raw === null ||
            (typeof raw === "string" && raw.trim() === "")
        );
    }

    function text(
        field: string,
        label: string,
        allowNumber = false,
    ): string | null {
        const raw = input[field];

        if (empty(raw)) return null;

        if (
            allowNumber &&
            typeof raw === "number" &&
            Number.isFinite(raw)
        ) {
            if (field === "sourceCode") {
                issue(
                    "WARNING",
                    field,
                    "NUMERIC_PRODUCT_CODE",
                    "კოდი ფაილში რიცხვადაა შენახული. საწყისი ნულები შესაძლოა დაკარგული იყოს - სხვა ფურცლებთან დაკავშირებამდე გადაამოწმე.",
                );
            }

            return String(raw);
        }

        if (typeof raw !== "string") {
            issue(
                "ERROR",
                field,
                "INVALID_PRODUCT_TEXT",
                `${label}: ტექსტური მნიშვნელობა ვერ წავიკითხეთ. შეასწორე უჯრედი ან აირჩიე შესაბამისი სვეტი.`,
            );
            return null;
        }

        return raw.normalize("NFC").replace(/\r\n?/g, "\n").trim();
    }

    function money(field: string, label: string): string | null {
        if (empty(input[field])) return null;

        const result = validateImportMoney(input[field], {
            field,
            label,
            decimalSeparator: options.decimalSeparator,
        });

        issues.push(
            ...result.issues.map(item => ({
                ...item,
                message:
                    `${item.message} გადაამოწმე არჩეული სვეტი და ათწილადის გამყოფი, ან შეასწორე მნიშვნელობა.`,
            })),
        );

        return result.valid ? result.data : null;
    }

    const sourceCode = text("sourceCode", "კოდი", true);
    const name = text("name", "პროდუქტის სახელი");
    const brand = text("brand", "ბრენდი");
    const description = text("description", "აღწერა");
    const category = text("category", "კატეგორია");
    const color = text("color", "ფერი");
    const size = text("size", "ზომა", true);
    const imageReference = text("imageReference", "ფოტოს მითითება");
    const salePrice = money("salePrice", "გასაყიდი ფასი");
    const unitCost = money("unitCost", "ერთეულის სრული თვითღირებულება");

    if (!name && !issues.some(item => item.field === "name")) {
        issue(
            "ERROR",
            "name",
            "PRODUCT_NAME_REQUIRED",
            "პროდუქტის სახელი არ არის მითითებული. ახალი პროდუქტის შესაქმნელად დასახელება გვჭირდება. აირჩიე სახელის სვეტი ან შეავსე ჩანაწერი. კოდი აუცილებელი არ არის.",
        );
    }

    let currentStock: number | null = null;

    if (options.mode === "CURRENT_STOCK") {
        const raw = input.currentStock;

        if (empty(raw)) {
            issue(
                "ERROR",
                "currentStock",
                "STOCK_REQUIRED",
                "მიმდინარე რაოდენობა არ არის მითითებული. მარაგის დასამატებლად ნაშთი გვჭირდება. შეავსე რაოდენობა, დააკავშირე მისი სვეტი ან აირჩიე „მხოლოდ პროდუქტები“.",
            );
        } else {
            const numeric =
                typeof raw === "number"
                    ? raw
                    : typeof raw === "string" && /^\d+$/.test(raw.trim())
                        ? Number(raw.trim())
                        : NaN;

            if (
                !Number.isSafeInteger(numeric) ||
                numeric < 0 ||
                numeric > 2147483647
            ) {
                issue(
                    "ERROR",
                    "currentStock",
                    "INVALID_STOCK",
                    "მიმდინარე რაოდენობა უნდა იყოს არაუარყოფითი მთელი რიცხვი, მაქსიმუმ 2147483647. უარყოფით ან წილად რაოდენობას მარაგად ვერ შევინახავთ - გადაამოწმე უჯრედი და არჩეული სვეტი.",
                );
            } else {
                currentStock = numeric;
            }
        }
    }

    if (salePrice === null && empty(input.salePrice)) {
        issue(
            "WARNING",
            "salePrice",
            "SALE_PRICE_NOT_PROVIDED",
            "გასაყიდი ფასი მითითებული არ არის. ეს პროდუქტის მომზადებას არ აფერხებს - ფასის დამატება მოგვიანებით შეგიძლია.",
        );
    }

    if (imageReference !== null) {
        issue(
            "WARNING",
            "imageReference",
            "IMAGE_REFERENCE_PENDING",
            "ფოტოს მითითება შენარჩუნებულია. ფოტოს ამოცნობა და პროდუქტთან დაკავშირება ცალკე შესამოწმებელია; მხოლოდ მითითების არსებობა ფოტოს გადმოტანას ჯერ არ ადასტურებს.",
        );
    }

    if (issues.some(item => item.severity === "ERROR") || !name) {
        return { valid: false, data: null, issues };
    }

    return {
        valid: true,
        data: {
            sourceCode,
            name,
            brand,
            description,
            category,
            color,
            size,
            salePrice,
            currentStock,
            unitCost,
            imageReference,
        },
        issues,
    };
}