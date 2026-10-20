import {
    validateImportMoney,
} from "./validate-import-money";
import type {
    ImportIssue,
    ImportValidationResult,
} from "./import-types";

export type ImportedOrderTotal = {
    subtotal: string;
    courierFee: string;
    payableTotal: string;
};

function cents(value: string): bigint {
    const [whole, fraction = ""] = value.split(".");

    return BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0"));
}

function money(value: bigint): string {
    return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

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

export function validateImportOrderTotal(input: {
    // უკვე გამოთვლილი, ნორმალიზებული თანხები.
    subtotal: string;
    courierFee: string;

    // წყაროს ფაილში მითითებული სრული თანხა, თუ არსებობს.
    orderTotal: unknown;
    decimalSeparator: "." | ",";
}): ImportValidationResult<ImportedOrderTotal> {
    const issues: ImportIssue[] = [];

    function read(
        value: unknown,
        field: string,
        label: string,
        decimalSeparator: "." | ",",
    ): string | null {
        const result = validateImportMoney(value, {
            field,
            label,
            decimalSeparator,
        });

        issues.push(...result.issues);

        return result.valid ? result.data : null;
    }

    const subtotal = read(
        input.subtotal,
        "lineTotal",
        "პროდუქტების ჯამი",
        ".",
    );

    const courierFee = read(
        input.courierFee,
        "courierFee",
        "კურიერის საფასური",
        ".",
    );

    const suppliedTotal = missing(input.orderTotal)
        ? null
        : read(
            input.orderTotal,
            "orderTotal",
            "შეკვეთის სრული თანხა",
            input.decimalSeparator,
        );

    if (
        issues.length > 0 ||
        subtotal === null ||
        courierFee === null
    ) {
        return {
            valid: false,
            data: null,
            issues,
        };
    }

    const payableCents = cents(subtotal) + cents(courierFee);

    if (payableCents > 999_999_999_999n) {
        return {
            valid: false,
            data: null,
            issues: [{
                severity: "ERROR",
                field: "orderTotal",
                code: "ORDER_PAYABLE_TOO_LARGE",
                message:
                    "შეკვეთის სრული გადასახდელი თანხა იმპორტისთვის " +
                    "დასაშვებ ზღვარს აღემატება. გადაამოწმე პროდუქტების " +
                    "თანხები და კურიერის საფასური.",
            }],
        };
    }

    const payableTotal = money(payableCents);

    if (
        suppliedTotal !== null &&
        cents(suppliedTotal) !== payableCents
    ) {
        return {
            valid: false,
            data: null,
            issues: [{
                severity: "ERROR",
                field: "orderTotal",
                code: "ORDER_TOTAL_MISMATCH",
                message:
                    `პროდუქტების მიხედვით გამოთვლილი თანხაა ${payableTotal}, ` +
                    `ხოლო ფაილის თანხა საკურიეროს გამიჯვნის შემდეგ არის ${suppliedTotal}. ` +
                    "გადაამოწმე პროდუქტების რაოდენობა, ფასები და შეკვეთის ჯამის სვეტი. " +
                    "თუ ფაილის ჯამში საკურიეროც შედის, მონიშნე ეს შესაბამისი " +
                    "ფურცლის პარამეტრებში და აირჩიე საკურიეროს თანხის სვეტი. " +
                    "სხვაობას ავტომატურად არ შევცვლით.",
            }],
        };
    }

    return {
        valid: true,
        data: {
            subtotal,
            courierFee,
            payableTotal,
        },
        issues: [],
    };
}