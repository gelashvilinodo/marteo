import type {
    ImportedOrderLine,
} from "./validate-import-order-line";
import type {
    ImportValidationResult,
} from "./import-types";

export type ImportedOrderLinesSummary = {
    subtotal: string;
    totalCost: string | null;
    unknownCostLineCount: number;
    costComplete: boolean;
};

function cents(value: string): bigint {
    const [whole, fraction = ""] = value.split(".");

    return BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0"));
}

function money(value: bigint): string {
    return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

// გადაეცემა მხოლოდ validateImportOrderLine-ით
// უკვე შემოწმებული პროდუქტის ხაზები.
export function summarizeImportOrderLines(
    lines: readonly ImportedOrderLine[],
): ImportValidationResult<ImportedOrderLinesSummary> {
    if (lines.length === 0) {
        return {
            valid: false,
            data: null,
            issues: [{
                severity: "ERROR",
                field: null,
                code: "ORDER_LINES_REQUIRED",
                message:
                    "შეკვეთაში პროდუქტის არც ერთი გამართული ხაზი არ არის. " +
                    "გადაამოწმე პროდუქტების მონაცემები და შეკვეთის დაჯგუფება.",
            }],
        };
    }

    let subtotal = 0n;
    let knownCost = 0n;
    let unknownCostLineCount = 0;

    for (const line of lines) {
        subtotal += cents(line.lineTotal);

        if (line.unitCost === null) {
            unknownCostLineCount++;
        } else {
            knownCost += cents(line.unitCost) * BigInt(line.quantity);
        }
    }

    if (subtotal > 999_999_999_999n) {
        return {
            valid: false,
            data: null,
            issues: [{
                severity: "ERROR",
                field: "orderTotal",
                code: "ORDER_TOTAL_TOO_LARGE",
                message:
                    "პროდუქტების ჯამი იმპორტისთვის დასაშვებ თანხას აღემატება. " +
                    "გადაამოწმე ფასები, რაოდენობები და ხაზების დაჯგუფება.",
            }],
        };
    }

    const costComplete = unknownCostLineCount === 0;

    return {
        valid: true,
        data: {
            subtotal: money(subtotal),
            totalCost: costComplete ? money(knownCost) : null,
            unknownCostLineCount,
            costComplete,
        },
        issues: [],
    };
}