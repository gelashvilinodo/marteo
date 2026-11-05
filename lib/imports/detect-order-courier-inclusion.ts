import type {
    ParsedImportSheet,
} from "./import-file-types";
import type {
    OrderImportMapping,
} from "./order-import-mapping";
import {
    readImportOrderRows,
} from "./read-import-order-rows";
import {
    validateImportMoney,
} from "./validate-import-money";

export type OrderCourierInclusion = {
    // შეკვეთები, სადაც საკურიერო 0-ზე მეტია და თანხა მითითებულია.
    checkedOrders: number;
    orderTotalIncludesCourier: boolean;
    paidAmountIncludesCourier: boolean;
};

function cents(
    value: unknown,
    decimalSeparator: "." | ",",
): bigint | null {
    if (
        value === null ||
        value === undefined ||
        (typeof value === "string" && !value.trim())
    ) {
        return null;
    }

    const result = validateImportMoney(value, {
        field: "amount",
        label: "თანხა",
        decimalSeparator,
    });

    if (!result.valid || result.data === null) return null;

    const [whole, fraction = ""] = result.data.split(".");

    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

// ფაილის მონაცემებით ვარკვევთ, შედის თუ არა საკურიერო შეკვეთის
// და გადახდილ თანხაში. ვრთავთ მხოლოდ მაშინ, როცა ყველა შემოწმებადი
// შეკვეთა ერთსა და იმავე წესს მიჰყვება.
export function detectOrderCourierInclusion(
    sheet: ParsedImportSheet,
    mapping: OrderImportMapping,
): OrderCourierInclusion {
    const { rows } = readImportOrderRows({
        fileId: "",
        fileName: "",
        sheet,
        mapping,
    });

    const groups = new Map<string, typeof rows>();

    for (const row of rows) {
        const code = row.input.orderCode;
        const key =
            typeof code === "string" && code.trim()
                ? `code:${code.trim()}`
                : typeof code === "number"
                    ? `code:${code}`
                    : `row:${row.rowNumber}`;

        groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const separator = mapping.decimalSeparator;
    let totalWith = 0;
    let totalWithout = 0;
    let paidWith = 0;
    let paidWithout = 0;

    for (const group of groups.values()) {
        let lines = 0n;
        let linesKnown = true;

        for (const row of group) {
            const line = cents(row.input.lineTotal, separator);

            if (line !== null) {
                lines += line;
                continue;
            }

            const quantity = Number(row.input.quantity);
            const price = cents(row.input.unitPrice, separator);

            if (
                price === null ||
                !Number.isInteger(quantity) ||
                quantity <= 0
            ) {
                linesKnown = false;
                break;
            }

            lines += price * BigInt(quantity);
        }

        if (!linesKnown) continue;

        const first = (field: "orderTotal" | "paidAmount" | "courierFee") => {
            for (const row of group) {
                const value = cents(row.input[field], separator);
                if (value !== null) return value;
            }

            return null;
        };

        const courier = first("courierFee");
        if (courier === null || courier <= 0n) continue;

        const total = first("orderTotal");

        if (total === lines + courier) totalWith++;
        else if (total === lines) totalWithout++;

        const paid = first("paidAmount");

        if (paid === lines + courier) paidWith++;
        else if (paid === lines) paidWithout++;
    }

    const orderTotalIncludesCourier =
        totalWith > 0 && totalWithout === 0;

    return {
        checkedOrders: totalWith + totalWithout,
        orderTotalIncludesCourier,
        paidAmountIncludesCourier:
            paidWith > 0 && paidWithout === 0,
    };
}
