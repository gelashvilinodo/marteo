import {
    readImportOrderProductMoney,
} from "./read-import-order-product-money";
import {
    validateImportOrderTotal,
    type ImportedOrderTotal,
} from "./validate-import-order-total";
import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";

export type OrderGroupTotalResult =
    | {
        kind: "READY";
        data: ImportedOrderTotal;
        usedCourierFallback: boolean;
    }
    | {
        kind: "NEEDS_REVIEW";
        message: string;
    };

export function resolveImportOrderGroupTotal(input: {
    rows: readonly PreparedOrderSourceRow[];
    subtotal: string;

    // ძველ მონახაზებთან თავსებადობისთვის ვტოვებთ.
    // ისტორიული იმპორტის თანხებზე აღარ მოქმედებს.
    fallbackCourierFee: string | null;
}): OrderGroupTotalResult {
    const total = readImportOrderProductMoney({
        rows: input.rows,
        field: "orderTotal",
    });

    if (total.kind === "NEEDS_REVIEW") {
        return {
            kind: "NEEDS_REVIEW",
            message: total.message,
        };
    }

    const result = validateImportOrderTotal({
        subtotal: input.subtotal,

        // ისტორიული შეკვეთის ფინანსებში
        // საკურიეროს თანხა არ გადაგვაქვს.
        courierFee: "0.00",

        orderTotal: total.kind === "READY"
            ? total.value
            : null,
        decimalSeparator: ".",
    });

    if (!result.valid) {
        return {
            kind: "NEEDS_REVIEW",
            message: result.issues
                .map(issue => issue.message)
                .join(" "),
        };
    }

    return {
        kind: "READY",
        data: result.data,
        usedCourierFallback: false,
    };
}