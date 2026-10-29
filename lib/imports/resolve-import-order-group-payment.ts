import {
    readExplicitOrderPaymentStatus,
    resolveOrderImportPayment,
} from "./resolve-order-import-payment";
import type {
    OrderPaymentReadResult,
} from "./read-order-import-payment";
import {
    readImportOrderProductMoney,
} from "./read-import-order-product-money";
import {
    resolveOrderGroupValue,
} from "./resolve-order-group-value";
import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";
import type {
    OrderImportOptions,
} from "./order-import-options";

export function resolveImportOrderGroupPayment(input: {
    rows: readonly PreparedOrderSourceRow[];
    payableTotal: string;
    fallback: OrderImportOptions["missingPayment"];
}): OrderPaymentReadResult {
    const values: {
        rowNumber: number;
        value: string;
    }[] = [];

    for (const row of input.rows) {
        const sourceError = row.issues.find(
            issue =>
                issue.severity === "ERROR" &&
                issue.field === "paymentStatus",
        );

        if (sourceError) {
            return {
                kind: "NEEDS_REVIEW",
                message:
                    `რიგი ${row.rowNumber}: ${sourceError.message}`,
            };
        }

        const result = readExplicitOrderPaymentStatus(
            row.input.paymentStatus,
        );

        if (result.kind === "MISSING") continue;

        if (result.kind === "NEEDS_REVIEW") {
            return {
                kind: "NEEDS_REVIEW",
                message:
                    `რიგი ${row.rowNumber}: ${result.message}`,
            };
        }

        values.push({
            rowNumber: row.rowNumber,
            value: result.status,
        });
    }

    const status = resolveOrderGroupValue({
        label: "გადახდის სტატუსი",
        values,
    });

    if (status.kind === "NEEDS_REVIEW") {
        const locations = status.conflicts.map(
            conflict =>
                `${conflict.value} - რიგები ${conflict.rowNumbers.join(", ")}`,
        );

        return {
            kind: "NEEDS_REVIEW",
            message:
                `${status.message} ${locations.join("; ")}.`,
        };
    }

    const paid = readImportOrderProductMoney({
        rows: input.rows,
        field: "paidAmount",
        productTotal: input.payableTotal,
    });

    if (paid.kind === "NEEDS_REVIEW") {
        return {
            kind: "NEEDS_REVIEW",
            message: paid.message,
        };
    }

    return resolveOrderImportPayment({
        paymentStatus:
            status.kind === "READY" ? status.value : null,
        paidAmount:
            paid.kind === "READY" ? paid.value : null,
        payableTotal: input.payableTotal,

        // თანხები ზემოთ უკვე ნორმალიზებულია.
        decimalSeparator: ".",
        fallback: input.fallback,
    });
}