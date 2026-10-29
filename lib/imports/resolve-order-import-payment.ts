import {
    readOrderImportPayment,
    type OrderPaymentReadResult,
} from "./read-order-import-payment";
import type {
    OrderImportOptions,
} from "./order-import-options";

export type ImportedPaymentStatus =
    | "PAID"
    | "UNPAID"
    | "PARTIALLY_PAID";

type PaymentStatus = ImportedPaymentStatus;

const aliases: Record<PaymentStatus, readonly string[]> = {
    PAID: [
        "paid",
        "fully paid",
        "გადახდილი",
        "გადახდილია",
        "სრულად გადახდილი",
        "სრულად გადახდილია",
    ],
    UNPAID: [
        "unpaid",
        "not paid",
        "გადაუხდელი",
        "გადაუხდელია",
        "არ არის გადახდილი",
    ],
    PARTIALLY_PAID: [
        "partially paid",
        "partial",
        "ნაწილობრივ გადახდილი",
        "ნაწილობრივ გადახდილია",
    ],
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

function normalize(value: string): string {
    return value
        .normalize("NFC")
        .trim()
        .toLocaleLowerCase("en-US")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");
}

export function readExplicitOrderPaymentStatus(
    value: unknown,
):
    | { kind: "MISSING" }
    | { kind: "READY"; status: ImportedPaymentStatus }
    | { kind: "NEEDS_REVIEW"; message: string } {
    if (missing(value)) {
        return { kind: "MISSING" };
    }

    if (typeof value !== "string") {
        return {
            kind: "NEEDS_REVIEW",
            message:
                "გადახდის სტატუსის უჯრედში ტექსტური მნიშვნელობა არ არის. " +
                "გადაამოწმე არჩეული სვეტი ან შეასწორე მნიშვნელობა.",
        };
    }

    const normalized = normalize(value);

    const status = (
        Object.keys(aliases) as PaymentStatus[]
    ).find(candidate =>
        aliases[candidate].some(
            alias => normalize(alias) === normalized,
        ),
    );

    if (!status) {
        return {
            kind: "NEEDS_REVIEW",
            message:
                `გადახდის სტატუსი „${value.trim()}“ ავტომატურად ვერ ` +
                "განვსაზღვრეთ. მიუთითე შესაბამისი სტატუსი. " +
                "საერთო არჩევანი უცნობ მნიშვნელობას არ გადაწერს.",
        };
    }

    return { kind: "READY", status };
}


export function resolveOrderImportPayment(input: {
    paymentStatus: unknown;
    paidAmount: unknown;
    payableTotal: string;
    decimalSeparator: "." | ",";
    fallback: OrderImportOptions["missingPayment"];
}): OrderPaymentReadResult {
    const statusResult = readExplicitOrderPaymentStatus(
        input.paymentStatus,
    );

    if (statusResult.kind === "MISSING") {
        return readOrderImportPayment(input);
    }

    if (statusResult.kind === "NEEDS_REVIEW") {
        return statusResult;
    }

    const explicitStatus = statusResult.status;

    const amountMissing = missing(input.paidAmount);

    if (amountMissing && explicitStatus === "PARTIALLY_PAID") {
        return {
            kind: "NEEDS_REVIEW",
            message:
                "შეკვეთა ნაწილობრივ გადახდილია, მაგრამ გადახდილი თანხა " +
                "მითითებული არ არის. მიუთითე რეალურად გადახდილი თანხა - " +
                "მხოლოდ სტატუსით დარჩენილ დავალიანებას ვერ გამოვთვლით.",
        };
    }

    // ფაილში პირდაპირ მითითებული სტატუსი საერთო არჩევანზე
    // პრიორიტეტულია. არსებული თანხა მაინც ცალკე მოწმდება.
    const result = readOrderImportPayment({
        paidAmount: input.paidAmount,
        payableTotal: input.payableTotal,
        decimalSeparator: input.decimalSeparator,
        fallback:
            explicitStatus === "PAID"
                ? "PAID"
                : explicitStatus === "UNPAID"
                  ? "UNPAID"
                  : "UNRESOLVED",
    });

    if (result.kind !== "READY") return result;

    if (result.status !== explicitStatus) {
        return {
            kind: "NEEDS_REVIEW",
            message:
                "გადახდის სტატუსი და თანხა ერთმანეთს არ ემთხვევა: " +
                `ფაილში მითითებულია „${String(input.paymentStatus).trim()}“, ` +
                `გადახდილი თანხაა ${result.paidAmount}, ` +
                `შეკვეთის გადასახდელი კი ${input.payableTotal}. ` +
                "შეასწორე სტატუსი ან თანხა; ავტომატურად არც ერთს არ შევცვლით.",
        };
    }

    return {
        ...result,
        usedFallback: false,
    };
}