import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
    OrderValidationError,
} from "./order-validation-error";
import {
    validateImportMoney,
} from "@/lib/imports/validate-import-money";
import {
    validateImportDate,
} from "@/lib/imports/validate-import-date";

export type ResolvedHistoricalPayment = {
    paidAmount: Prisma.Decimal;
    paymentDate: string | null;
    method: "CASH" | "BANK_TRANSFER" | "CARD" | "UNKNOWN";
    bankName: string | null;
};

function fail(message: string): never {
    throw new OrderValidationError(message, 422);
}

export function validatePaymentResolution(
    value: unknown,
    payableTotal: Prisma.Decimal,
): ResolvedHistoricalPayment {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        fail("გადახდის დაზუსტების მონაცემები არასწორია.");
    }

    const input = value as Record<string, unknown>;

    if (input.confirmHistoricalPayment !== true) {
        fail(
            "დაადასტურე, რომ უთითებ უკვე მიღებულ თანხას და არა ახალ ჩარიცხვას.",
        );
    }

    const amount = validateImportMoney(input.paidAmount, {
        field: "paidAmount",
        label: "უკვე მიღებული თანხა",
        decimalSeparator: ".",
    });

    if (!amount.valid) {
        fail(
            amount.issues.map(issue => issue.message).join(" "),
        );
    }

    const paidAmount = new Prisma.Decimal(amount.data);

    if (paidAmount.greaterThan(payableTotal)) {
        fail(
            "უკვე მიღებული თანხა შეკვეთის სრულ თანხას აღემატება. გადაამოწმე გადახდა და შეკვეთის თანხა.",
        );
    }

    let paymentDate: string | null = null;

    if (paidAmount.greaterThan(0)) {
        const date = validateImportDate(input.paymentDate, {
            field: "paymentDate",
            label: "თანხის მიღების თარიღი",
        });

        if (!date.valid) {
            fail(
                date.issues.map(issue => issue.message).join(" "),
            );
        }

        paymentDate = date.data;
    }

    const rawMethod = input.method;

    const method =
        rawMethod === null ||
        rawMethod === undefined ||
        rawMethod === ""
            ? "UNKNOWN"
            : rawMethod;

    if (
        method !== "CASH" &&
        method !== "BANK_TRANSFER" &&
        method !== "CARD" &&
        method !== "UNKNOWN"
    ) {
        fail("გადახდის მეთოდი არასწორია.");
    }

    if (
        input.bankName !== null &&
        input.bankName !== undefined &&
        typeof input.bankName !== "string"
    ) {
        fail("ბანკის დასახელება ტექსტი უნდა იყოს.");
    }

    const bankName =
        method === "BANK_TRANSFER" &&
        typeof input.bankName === "string"
            ? input.bankName.normalize("NFC").trim() || null
            : null;

    return {
        paidAmount,
        paymentDate,
        method,
        bankName,
    };
}