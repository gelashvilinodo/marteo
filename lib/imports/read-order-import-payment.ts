import {
    validateImportMoney,
} from "./validate-import-money";
import type {
    OrderImportOptions,
} from "./order-import-options";

export type OrderPaymentReadResult =
    | {
        kind: "READY";
        status: "PAID" | "UNPAID" | "PARTIALLY_PAID";
        paidAmount: string;
        usedFallback: boolean;
    }
    | {
        kind: "UNKNOWN";
        paidAmount: null;
        message: string;
    }
    | {
        kind: "NEEDS_REVIEW";
        message: string;
    };

function cents(value: string): bigint {
    const [whole, fraction = ""] = value.split(".");

    return (
        BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0"))
    );
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

export function readOrderImportPayment(input: {
    paidAmount: unknown;
    payableTotal: string;
    decimalSeparator: "." | ",";
    fallback: OrderImportOptions["missingPayment"];
}): OrderPaymentReadResult {
    // payableTotal უკვე გამოთვლილი შეკვეთის სრული გადასახდელია.
    // აქ მას ხელახლა ვამოწმებთ, რათა არასწორი თანხით
    // გადახდის მდგომარეობა არ განვსაზღვროთ.
    const total = validateImportMoney(input.payableTotal, {
        field: "orderTotal",
        label: "შეკვეთის გადასახდელი თანხა",
        decimalSeparator: ".",
    });

    if (!total.valid || total.data === null) {
        return {
            kind: "NEEDS_REVIEW",
            message:
                "შეკვეთის გადასახდელი თანხა ჯერ ვერ განვსაზღვრეთ. " +
                "გადახდის შესამოწმებლად საჭიროა პროდუქტების ფასებისა " +
                "და შეკვეთის ჯამის დაზუსტება.",
        };
    }

    let paidAmount: string;
    let usedFallback = false;

    if (missing(input.paidAmount)) {
        if (input.fallback === "UNRESOLVED") {
            return {
                kind: "UNKNOWN",
                paidAmount: null,
                message:
                    "გადახდილი თანხა მითითებული არ არის. " +
                    "შეგიძლია დატოვო დაუზუსტებლად, მიუთითო თანხა " +
                    "ან აირჩიო საერთო წესი გადახდის ინფორმაციის გარეშე შეკვეთებისთვის.",
            };
        }

        usedFallback = true;

        if (input.fallback === "PAID") {
            paidAmount = total.data;
        } else if (input.fallback === "UNPAID") {
            paidAmount = "0.00";
        } else {
            return {
                kind: "NEEDS_REVIEW",
                message: "გადახდის საერთო არჩევანი ვერ დადასტურდა.",
            };
        }
    } else {
        const paid = validateImportMoney(input.paidAmount, {
            field: "paidAmount",
            label: "გადახდილი თანხა",
            decimalSeparator: input.decimalSeparator,
        });

        if (!paid.valid || paid.data === null) {
            return {
                kind: "NEEDS_REVIEW",
                message:
                    paid.issues.map(issue => issue.message).join(" ") ||
                    "გადახდილი თანხის წაკითხვა ვერ მოხერხდა.",
            };
        }

        paidAmount = paid.data;
    }

    const totalCents = cents(total.data);
    const paidCents = cents(paidAmount);

    if (paidCents > totalCents) {
        return {
            kind: "NEEDS_REVIEW",
            message:
                `გადახდილი თანხა (${paidAmount}) შეკვეთის ` +
                `გადასახდელ თანხას (${total.data}) აღემატება. ` +
                "გადაამოწმე თანხების სვეტები და შეკვეთის ხაზების დაჯგუფება. " +
                "ზედმეტ თანხას ავტომატურად არ ჩამოვაჭრით.",
        };
    }

    return {
        kind: "READY",
        status:
            paidCents === totalCents
                ? "PAID"
                : paidCents === 0n
                  ? "UNPAID"
                  : "PARTIALLY_PAID",
        paidAmount,
        usedFallback,
    };
}