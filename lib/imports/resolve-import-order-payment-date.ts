import {
    validateImportDate,
} from "./validate-import-date";
import {
    resolveOrderGroupValue,
} from "./resolve-order-group-value";
import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";
import type {
    OrderImportOptions,
} from "./order-import-options";
import type {
    OrderPaymentReadResult,
} from "./read-order-import-payment";

export type OrderPaymentDateResult =
    | { kind: "NOT_REQUIRED" }
    | {
        kind: "READY";
        date: string;
        usedFallback: boolean;
    }
    | {
        kind: "NEEDS_REVIEW";
        message: string;
    };

export function resolveImportOrderPaymentDate(input: {
    rows: readonly PreparedOrderSourceRow[];
    options: OrderImportOptions;
    orderDate: string | null;
    payment: Exclude<
        OrderPaymentReadResult,
        { kind: "NEEDS_REVIEW" }
    >;
}): OrderPaymentDateResult {
    if (
        input.payment.kind === "UNKNOWN" ||
        input.payment.paidAmount === "0.00"
    ) {
        return { kind: "NOT_REQUIRED" };
    }

    const values: {
        rowNumber: number;
        value: string;
    }[] = [];

    for (const row of input.rows) {
        const sourceError = row.issues.find(
            issue =>
                issue.severity === "ERROR" &&
                issue.field === "paymentDate",
        );

        if (sourceError) {
            return {
                kind: "NEEDS_REVIEW",
                message:
                    `რიგი ${row.rowNumber}: ${sourceError.message}`,
            };
        }

        const value = row.input.paymentDate;

        if (
            value === null ||
            value === undefined ||
            (
                typeof value === "string" &&
                !value.trim()
            )
        ) {
            continue;
        }

        const result = validateImportDate(value, {
            field: "paymentDate",
            label: "თანხის მიღების თარიღი",
            textOrder: input.options.dateOrder ?? undefined,
            excelDateSystem: row.excelDateSystem ?? undefined,
        });

        if (!result.valid) {
            return {
                kind: "NEEDS_REVIEW",
                message:
                    `რიგი ${row.rowNumber}: ` +
                    result.issues.map(issue => issue.message).join(" "),
            };
        }

        values.push({
            rowNumber: row.rowNumber,
            value: result.data,
        });
    }

    const resolved = resolveOrderGroupValue({
        label: "თანხის მიღების თარიღი",
        values,
    });

    if (resolved.kind === "NEEDS_REVIEW") {
        return {
            kind: "NEEDS_REVIEW",
            message:
                resolved.message + " " +
                resolved.conflicts.map(
                    conflict =>
                        `${conflict.value} — რიგები ${conflict.rowNumbers.join(", ")}`,
                ).join("; "),
        };
    }

    if (resolved.kind === "READY") {
        return {
            kind: "READY",
            date: resolved.value,
            usedFallback: false,
        };
    }

    const fallback =
        input.options.paymentDateMode === "ORDER_DATE"
            ? input.orderDate
            : input.options.paymentDateMode === "COMMON_DATE"
              ? input.options.fallbackPaymentDate
              : null;

    if (fallback === null) {
        return {
            kind: "NEEDS_REVIEW",
            message:
                "გადახდილი თანხა მითითებულია, მაგრამ მიღების თარიღი " +
                "უცნობია. მიუთითე თარიღი ან საერთო არჩევანებში აირჩიე " +
                "თანხის მიღების თარიღის წესი. თითოეული შეკვეთის ცალკე " +
                "შევსება აუცილებელი არ არის.",
        };
    }

    const result = validateImportDate(fallback, {
        field: "paymentDate",
        label: "თანხის მიღების საერთო თარიღი",
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
        date: result.data,
        usedFallback: true,
    };
}