import { Decimal } from "@prisma/client-runtime-utils";

export type CourierBalanceOrder = {
    courierFee: string;
    cashReceived: string;
};

export type CourierBalance = {
    courierFees: string;
    cashReceived: string;
    paidToCourier: string;
    receivedFromCourier: string;
    signedBalance: string;
    amount: string;
    direction: "PAY" | "RECEIVE" | "SETTLED";
};

function money(
    value: string,
    label: string,
    allowNegative = false,
): Decimal {
    if (
        typeof value !== "string" ||
        !/^-?\d+(?:\.\d{1,2})?$/.test(value)
    ) {
        throw new Error(`${label}: თანხის ფორმატი არასწორია.`);
    }

    const result = new Decimal(value);

    if (!allowNegative && result.isNegative()) {
        throw new Error(`${label}: თანხა უარყოფითი ვერ იქნება.`);
    }

    return result;
}

export function calculateCourierBalance(input: {
    orders: readonly CourierBalanceOrder[];
    settlements: readonly string[];
}): CourierBalance {
    let courierFees = new Decimal(0);
    let cashReceived = new Decimal(0);
    let paidToCourier = new Decimal(0);
    let receivedFromCourier = new Decimal(0);

    for (const order of input.orders) {
        const fee = money(
            order.courierFee,
            "საკურიეროს საფასური",
        );

        // საკურიეროს საფასურის გარეშე შეკვეთა
        // საკურიეროსთან ანგარიშსწორებაში არ მონაწილეობს.
        if (fee.isZero()) continue;

        courierFees = courierFees.plus(fee);

        cashReceived = cashReceived.plus(
            money(
                order.cashReceived,
                "საკურიეროსთან მიღებული ქეში",
            ),
        );
    }

    for (const value of input.settlements) {
        const amount = money(
            value,
            "საკურიეროსთან გასწორებული თანხა",
            true,
        );

        if (amount.isPositive()) {
            paidToCourier = paidToCourier.plus(amount);
        } else if (amount.isNegative()) {
            receivedFromCourier =
                receivedFromCourier.plus(amount.abs());
        }
    }

    const balance = courierFees
        .minus(cashReceived)
        .minus(paidToCourier)
        .plus(receivedFromCourier);

    const direction: CourierBalance["direction"] =
        balance.isZero()
            ? "SETTLED"
            : balance.isPositive()
                ? "PAY"
                : "RECEIVE";

    return {
        courierFees: courierFees.toFixed(2),
        cashReceived: cashReceived.toFixed(2),
        paidToCourier: paidToCourier.toFixed(2),
        receivedFromCourier: receivedFromCourier.toFixed(2),
        signedBalance: balance.toFixed(2),
        amount: balance.abs().toFixed(2),
        direction,
    };
}
