import {
    readImportOrderGroupMoney,
} from "./read-import-order-group-money";
import type {
    OrderGroupValueResult,
} from "./resolve-order-group-value";
import type {
    PreparedOrderSourceRow,
} from "./prepare-draft-order-rows";

function cents(value: string): bigint {
    const [whole, fraction = ""] = value.split(".");

    return BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0"));
}

function money(value: bigint): string {
    return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function review(message: string): OrderGroupValueResult {
    return {
        kind: "NEEDS_REVIEW",
        value: null,
        message,
        conflicts: [],
    };
}

export function readImportOrderProductMoney(input: {
    rows: readonly PreparedOrderSourceRow[];
    field: "orderTotal" | "paidAmount";
    productTotal?: string;
}): OrderGroupValueResult {
    const amount = readImportOrderGroupMoney({
        rows: input.rows,
        field: input.field,
    });

    if (amount.kind !== "READY") return amount;

    const choices = new Set(
        input.rows.map(row =>
            input.field === "orderTotal"
                ? row.orderTotalIncludesCourier === true
                : row.paidAmountIncludesCourier === true
        ),
    );

    if (choices.size > 1) {
        return review(
            "ერთი შეკვეთის რიგებში საკურიეროს გამიჯვნის " +
            "განსხვავებული წესებია არჩეული. გადაამოწმეთ ფურცლის არჩევანი.",
        );
    }

    if (!choices.has(true)) return amount;

    const courier = readImportOrderGroupMoney({
        rows: input.rows,
        field: "courierFee",
    });

    if (courier.kind === "NEEDS_REVIEW") return courier;

    if (courier.kind === "MISSING") {
        return review(
            "მონიშნულია, რომ თანხაში საკურიეროც შედის, მაგრამ " +
            "მისი ცალკე თანხა ვერ მოიძებნა. აირჩიეთ საკურიეროს " +
            "შესაბამისი სვეტი. თუ თანხა მხოლოდ პროდუქტებს ეხება, " +
            "მოხსენით შესაბამისი მონიშვნა.",
        );
    }

    const amountCents = cents(amount.value);
    const courierCents = cents(courier.value);

    if (
        input.field === "paidAmount" &&
        amountCents === 0n
    ) {
        return amount;
    }

    if (
        amountCents < courierCents &&
        !(
            input.field === "paidAmount" &&
            input.productTotal !== undefined
        )
    ) {
        return review(
            "მითითებული თანხა საკურიეროს საფასურზე ნაკლებია. " +
            "გადაამოწმეთ თანხები და არჩეული სვეტები.",
        );
    }

    // ნაწილობრივი გადახდა ჯერ პროდუქტებს ფარავს: ისტორიული
    // შეკვეთის ფინანსებში საკურიეროს თანხა ისედაც არ გადაგვაქვს.
    if (
        input.field === "paidAmount" &&
        courierCents > 0n &&
        input.productTotal !== undefined &&
        amountCents < cents(input.productTotal) + courierCents
    ) {
        const productCents = cents(input.productTotal);

        return {
            ...amount,
            value: money(
                amountCents < productCents ? amountCents : productCents,
            ),
        };
    }

    if (
        input.field === "paidAmount" &&
        courierCents > 0n &&
        (
            input.productTotal === undefined ||
            amountCents !==
                cents(input.productTotal) + courierCents
        )
    ) {
        return review(
            "გადახდილი თანხა პროდუქტებისა და საკურიეროს სრულ " +
            "ჯამს არ ემთხვევა. ნაწილობრივი გადახდიდან ვერ " +
            "განვსაზღვრავთ, რა ნაწილი ეკუთვნის საკურიეროს. " +
            "მიუთითეთ პროდუქტებისთვის გადახდილი თანხა და მოხსენით " +
            "მონიშვნა „გადახდილ თანხაში საკურიეროც შედის“.",
        );
    }

    return {
        ...amount,
        value: money(amountCents - courierCents),
    };
}