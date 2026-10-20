import {
    validateImportMoney,
} from "./validate-import-money";
import type {
    ImportIssue,
    ImportValidationResult,
} from "./import-types";

export type ImportedOrderLine = {
    name: string;
    productCode: string | null;
    color: string | null;
    size: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    unitCost: string | null;
};

function missing(value: unknown): boolean {
    return (
        value === null ||
        value === undefined ||
        (
            typeof value === "string" &&
            value.trim() === ""
        )
    );
}

function cents(value: string): bigint {
    const [whole, fraction = ""] = value.split(".");

    return BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0"));
}

function money(value: bigint): string {
    return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

export function validateImportOrderLine(input: {
    name: unknown;
    productCode?: unknown;
    color?: unknown;
    size?: unknown;
    quantity: unknown;
    unitPrice: unknown;
    lineTotal: unknown;
    unitCost: unknown;
    decimalSeparator: "." | ",";
}): ImportValidationResult<ImportedOrderLine> {
    const issues: ImportIssue[] = [];

    function error(field: string, code: string, message: string) {
        issues.push({
            severity: "ERROR",
            field,
            code,
            message,
        });
    }

    function readMoney(
        value: unknown,
        field: string,
        label: string,
    ): string | null {
        if (missing(value)) return null;

        const result = validateImportMoney(value, {
            field,
            label,
            decimalSeparator: input.decimalSeparator,
        });

        issues.push(...result.issues);

        return result.valid ? result.data : null;
    }

    function optionalText(
        value: unknown,
        field: string,
        label: string,
        numeric: "NONE" | "CODE" | "SIZE",
    ): string | null {
        if (missing(value)) return null;

        if (typeof value === "string") {
            return value.normalize("NFC").trim();
        }

        if (
            typeof value === "number" &&
            Number.isFinite(value) &&
            (
                (
                    numeric === "CODE" &&
                    Number.isSafeInteger(value) &&
                    value >= 0
                ) ||
                (
                    numeric === "SIZE" &&
                    value >= 0
                )
            )
        ) {
            return String(value);
        }

        error(
            field,
            "INVALID_ORDER_PRODUCT_DETAIL",
            `${label}: მნიშვნელობის ფორმატი არასწორია. გადაამოწმე არჩეული სვეტი ან შეასწორე მონაცემი.`,
        );

        return null;
    }

    const productCode = optionalText(
        input.productCode,
        "productCode",
        "პროდუქტის კოდი",
        "CODE",
    );

    const color = optionalText(
        input.color,
        "color",
        "ფერი",
        "NONE",
    );

    const size = optionalText(
        input.size,
        "size",
        "ზომა",
        "SIZE",
    );


    const name = typeof input.name === "string"
        ? input.name.normalize("NFC").trim()
        : "";

    if (!name) {
        error(
            "name",
            "ORDER_PRODUCT_NAME_REQUIRED",
            "პროდუქტის სახელი ვერ წავიკითხეთ. აირჩიე დასახელების სვეტი ან შეავსე სახელი.",
        );
    }

    const quantityText =
        typeof input.quantity === "number"
            ? String(input.quantity)
            : typeof input.quantity === "string"
                ? input.quantity.trim()
                : "";

    const quantity = /^\d+$/.test(quantityText)
        ? Number(quantityText)
        : NaN;

    const quantityValid =
        Number.isSafeInteger(quantity) &&
        quantity > 0 &&
        quantity <= 2_147_483_647;

    if (!quantityValid) {
        error(
            "quantity",
            "ORDER_QUANTITY_REQUIRED",
            "მიუთითე გაყიდული რაოდენობა დადებითი მთელი რიცხვით. ცარიელ რაოდენობას ავტომატურად ერთ ცალად არ ჩავთვლით.",
        );
    }

    let unitPrice = readMoney(
        input.unitPrice,
        "unitPrice",
        "ერთეულის გასაყიდი ფასი",
    );

    const suppliedTotal = readMoney(
        input.lineTotal,
        "lineTotal",
        "პროდუქტის ხაზის ჯამი",
    );

    const unitCost = readMoney(
        input.unitCost,
        "unitCost",
        "ერთეულის თვითღირებულება",
    );

    if (
        missing(input.unitPrice) &&
        missing(input.lineTotal)
    ) {
        error(
            "unitPrice",
            "ORDER_PRICE_REQUIRED",
            "არც ერთეულის ფასი და არც პროდუქტის ხაზის ჯამი არ არის მითითებული. მიუთითე ერთ-ერთი, რომ გაყიდვის თანხა გამოვთვალოთ.",
        );
    }

    if (
        missing(input.unitPrice) &&
        suppliedTotal !== null &&
        quantityValid
    ) {
        const totalCents = cents(suppliedTotal);
        const count = BigInt(quantity);

        if (totalCents % count !== 0n) {
            error(
                "unitPrice",
                "ORDER_UNIT_PRICE_NOT_EXACT",
                "ხაზის ჯამი რაოდენობაზე თეთრის სიზუსტით არ იყოფა. მიუთითე ერთეულის ფასი და გადაამოწმე ხაზის ჯამი; თანხას ავტომატურად არ დავამრგვალებთ.",
            );
        } else {
            unitPrice = money(totalCents / count);
        }
    }

    let lineTotal: string | null = null;

    if (unitPrice !== null && quantityValid) {
        const calculated = cents(unitPrice) * BigInt(quantity);

        if (calculated > 999_999_999_999n) {
            error(
                "lineTotal",
                "ORDER_LINE_TOTAL_TOO_LARGE",
                "პროდუქტის ხაზის ჯამი იმპორტისთვის დასაშვებ თანხას აღემატება.",
            );
        } else {
            lineTotal = money(calculated);

            if (
                suppliedTotal !== null &&
                cents(suppliedTotal) !== calculated
            ) {
                error(
                    "lineTotal",
                    "ORDER_LINE_TOTAL_MISMATCH",
                    `რაოდენობისა და ფასის ნამრავლია ${lineTotal}, ხოლო ფაილში ხაზის ჯამია ${suppliedTotal}. გადაამოწმე თანხები ან არჩეული სვეტები.`,
                );
            }
        }
    }

    if (
        issues.some(issue => issue.severity === "ERROR") ||
        unitPrice === null ||
        lineTotal === null
    ) {
        return {
            valid: false,
            data: null,
            issues,
        };
    }

    return {
        valid: true,
        data: {
            name,
            productCode,
            color,
            size,
            quantity,
            unitPrice,
            lineTotal,
            unitCost,
        },
        issues,
    };
}