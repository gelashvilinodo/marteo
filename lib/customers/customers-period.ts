export type CustomersPeriod =
    | "week"
    | "month"
    | "three-months"
    | "all"
    | "custom";

const DAY = 86_400_000;
const OFFSET = 4 * 60 * 60 * 1000;

const durations = {
    week: 7,
    month: 30,
    "three-months": 90,
} as const;

function validDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

export function resolveCustomersPeriod(
    periodValue: string,
    fromValue: string,
    toValue: string,
    now = new Date(),
) {
    const today = new Date(
        now.getTime() + OFFSET,
    ).toISOString().slice(0, 10);

    let period: CustomersPeriod =
        Object.hasOwn(durations, periodValue) ||
            periodValue === "all" ||
            periodValue === "custom"
            ? periodValue as CustomersPeriod
            : "month";

    let error = "";

    if (
        period === "custom" &&
        (
            !validDate(fromValue) ||
            !validDate(toValue) ||
            fromValue > toValue
        )
    ) {
        period = "month";
        error =
            "არჩეული პერიოდი არასწორია. ნაჩვენებია ბოლო ერთი თვე.";
    }

    if (period === "all") {
        return {
            period,
            from: "",
            to: "",
            start: null,
            end: null,
            error,
        };
    }

    const to = period === "custom"
        ? toValue
        : today;

    const from = period === "custom"
        ? fromValue
        : new Date(
            new Date(`${today}T00:00:00.000Z`).getTime() -
            (durations[period] - 1) * DAY,
        ).toISOString().slice(0, 10);

    return {
        period,
        from,
        to,
        start: new Date(
            new Date(`${from}T00:00:00.000Z`).getTime() -
            OFFSET,
        ),
        end: new Date(
            new Date(`${to}T00:00:00.000Z`).getTime() +
            DAY -
            OFFSET,
        ),
        error,
    };
}