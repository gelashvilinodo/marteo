import {
    resolveImportOrderGroupStatus,
} from "./resolve-import-order-group-status";
import {
    resolveImportOrderGroupDate,
} from "./resolve-import-order-group-date";
import {
    prepareImportOrderGroupLines,
    type PreparedOrderLine,
} from "./prepare-import-order-group-lines";
import {
    resolveImportOrderGroupTotal,
} from "./resolve-import-order-group-total";
import {
    resolveImportOrderGroupPayment,
} from "./resolve-import-order-group-payment";
import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";
import type {
    OrderImportOptions,
} from "./order-import-options";
import type {
    ImportedOrderStatus,
} from "./read-order-import-status";
import type {
    OrderPaymentReadResult,
} from "./read-order-import-payment";
import type {
    ImportedOrderTotal,
} from "./validate-import-order-total";
import {
    resolveImportOrderContact,
    type ImportedOrderContact,
} from "./resolve-import-order-contact";
import {
    readImportOrderNotes,
} from "./read-import-order-notes";
import {
    resolveImportOrderPaymentDate,
} from "./resolve-import-order-payment-date";

export type OrderImportFieldIssue = {
    rowKey: string | null;
    rowNumber: number | null;
    field: string | null;
    code: string;
    message: string;
};

export type PreparedOrderGroupResult =
    | {
        kind: "SKIPPED";
        message: string;
    }
    | {
        kind: "NEEDS_REVIEW";
        messages: string[];
        fieldIssues: OrderImportFieldIssue[];
    }
    | {
        kind: "PREVIEW_READY";
        data: {
            date: string;
            status: ImportedOrderStatus;
            contact: ImportedOrderContact;
            notes: string | null;
            lines: PreparedOrderLine[];
            totals: ImportedOrderTotal;
            paymentDate: string | null;
            payment: Exclude<
                OrderPaymentReadResult,
                { kind: "NEEDS_REVIEW" }
            >;
            totalCost: string | null;
            unknownCostLineCount: number;
            costComplete: boolean;
        };
    };

export function prepareImportOrderGroup(input: {
    rows: readonly PreparedOrderSourceRow[];
    options: OrderImportOptions;
}): PreparedOrderGroupResult {
    if (input.rows.length === 0) {
        return {
            kind: "NEEDS_REVIEW",
            messages: ["შეკვეთის ჯგუფში წყაროს რიგები არ არის."],
            fieldIssues: [],
        };
    }

    const status = resolveImportOrderGroupStatus({
        rows: input.rows,
        fallback: input.options.missingStatus,
    });

    if (status.kind === "SKIPPED") {
        return status;
    }

    const messages: string[] = [];

    const fieldIssues: OrderImportFieldIssue[] = [];

    function addFieldIssue(issue: OrderImportFieldIssue) {
        const exists = fieldIssues.some(current =>
            current.rowKey === issue.rowKey &&
            current.field === issue.field &&
            current.code === issue.code &&
            current.message === issue.message
        );

        if (!exists) {
            fieldIssues.push(issue);
        }
    }

    function addGroupFieldIssue(field: string, code: string, message: string) {
        const provided = input.rows.filter(row => {
            const value = row.input[field as keyof typeof row.input];
            return value !== null && value !== undefined && String(value).trim() !== "";
        });
        // A missing group value can be entered once. Conflicting supplied values
        // are shown on each affected row, without guessing which one is correct.
        for (const row of provided.length > 0 ? provided : input.rows.slice(0, 1)) {
            addFieldIssue({ rowKey: row.key, rowNumber: row.rowNumber, field, code, message });
        }
    }

    for (const row of input.rows) {
        for (const issue of row.issues) {
            // საკურიეროს წყაროს შეცდომას ამოწმებს თანხის
            // გამიჯვნის ფუნქცია მხოლოდ მაშინ, როცა ის საჭიროა.
            if (
                issue.severity === "ERROR" &&
                issue.field !== "courierFee"
            ) {
                messages.push(
                    `რიგი ${row.rowNumber}: ${issue.message}`,
                );

                addFieldIssue({
                    rowKey: row.key,
                    rowNumber: row.rowNumber,
                    field: issue.field,
                    code: issue.code,
                    message: issue.message,
                });
            }
        }
    }

    if (status.kind === "NEEDS_REVIEW") {
        messages.push(status.message);
        addGroupFieldIssue("status", "ORDER_GROUP_STATUS", status.message);
    }

    const date = resolveImportOrderGroupDate({
        rows: input.rows,
        options: input.options,
    });

    if (date.kind === "NEEDS_REVIEW") {
        messages.push(date.message);
        addGroupFieldIssue("date", "ORDER_GROUP_DATE", date.message);
    }

    const contact = resolveImportOrderContact(input.rows);

    if (contact.kind === "NEEDS_REVIEW") {
        messages.push(...contact.messages);
    }

    const notes = readImportOrderNotes(input.rows);

    if (!notes.valid) {
        messages.push(
            ...notes.issues.map(issue => issue.message),
        );
    }


    const products = prepareImportOrderGroupLines(input.rows);

    for (const problem of products.problems) {
        for (const issue of problem.issues) {
            if (issue.severity !== "ERROR") continue;

            messages.push(
                (
                    problem.rowNumber === null
                        ? ""
                        : `რიგი ${problem.rowNumber}: `
                ) + issue.message,
            );

            addFieldIssue({
                rowKey: problem.rowKey,
                rowNumber: problem.rowNumber,
                field: issue.field,
                code: issue.code,
                message: issue.message,
            });
        }
    }

    const totals = products.summary === null
        ? null
        : resolveImportOrderGroupTotal({
            rows: input.rows,
            subtotal: products.summary.subtotal,
            fallbackCourierFee: input.options.fallbackCourierFee,
        });

    if (totals?.kind === "NEEDS_REVIEW") {
        messages.push(totals.message);
    }

    const payment = totals?.kind === "READY"
        ? resolveImportOrderGroupPayment({
            rows: input.rows,
            payableTotal: totals.data.payableTotal,
            fallback: input.options.missingPayment,
        })
        : null;

    if (payment?.kind === "NEEDS_REVIEW") {
        messages.push(payment.message);
    }

    const paymentDate =
        payment !== null && payment.kind !== "NEEDS_REVIEW"
            ? resolveImportOrderPaymentDate({
                rows: input.rows,
                options: input.options,
                orderDate: date.kind === "READY" ? date.date : null,
                payment,
            })
            : null;

    if (paymentDate?.kind === "NEEDS_REVIEW") {
        messages.push(paymentDate.message);
        addGroupFieldIssue("paymentDate", "ORDER_GROUP_PAYMENT_DATE", paymentDate.message);
    }

    if (
        status.kind === "READY" &&
        status.status === "COMPLETED" &&
        payment !== null &&
        payment.kind !== "NEEDS_REVIEW" &&
        (
            payment.kind === "UNKNOWN" ||
            payment.status !== "PAID"
        )
    ) {
        messages.push(
            "შეკვეთა დასრულებულად არის მითითებული, მაგრამ სრული " +
            "გადახდა ვერ დასტურდება. მიუთითე გადახდილი თანხა, " +
            "აირჩიე შესაბამისი საერთო წესი ან შეასწორე შეკვეთის სტატუსი.",
        );
    }

    if (
        messages.length > 0 ||
        status.kind !== "READY" ||
        date.kind !== "READY" ||
        contact.kind !== "READY" ||
        !notes.valid ||
        products.summary === null ||
        totals?.kind !== "READY" ||
        payment === null ||
        payment.kind === "NEEDS_REVIEW" ||
        paymentDate === null ||
        paymentDate.kind === "NEEDS_REVIEW"
    ) {
        return {
            kind: "NEEDS_REVIEW",
            messages: [...new Set(messages)],
            fieldIssues,
        };
    }

    return {
        kind: "PREVIEW_READY",
        data: {
            date: date.date,
            status: status.status,
            contact: contact.data,
            notes: notes.data,
            lines: products.lines,
            totals: totals.data,
            paymentDate:
                paymentDate.kind === "READY"
                    ? paymentDate.date
                    : null,
            payment,
            totalCost: products.summary.totalCost,
            unknownCostLineCount:
                products.summary.unknownCostLineCount,
            costComplete: products.summary.costComplete,
        },
    };
}