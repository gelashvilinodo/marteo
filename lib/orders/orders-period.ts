export type OrdersPeriod =
    | "day"
    | "three-days"
    | "week"
    | "two-weeks"
    | "month"
    | "custom";

const DAY = 86_400_000;
const OFFSET = 4 * 60 * 60 * 1000;

const durations = {
    day: 1,
    "three-days": 3,
    week: 7,
    "two-weeks": 14,
    month: 30,
} as const;

function validDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

export function resolveOrdersPeriod(
    periodValue: string,
    fromValue: string,
    toValue: string,
    now = new Date(),
) {
    const today = new Date(
        now.getTime() + OFFSET,
    )
        .toISOString()
        .slice(0, 10);

    let period: OrdersPeriod =
        Object.hasOwn(durations, periodValue) ||
            periodValue === "custom"
            ? (periodValue as OrdersPeriod)
            : "week";

    let error = "";

    if (
        period === "custom" &&
        (!validDate(fromValue) ||
            !validDate(toValue) ||
            fromValue > toValue)
    ) {
        error =
            "არჩეული პერიოდი არასწორია. ნაჩვენებია ბოლო ერთი კვირის შეკვეთები.";

        period = "week";
    }

    const to =
        period === "custom" ? toValue : today;

    const from =
        period === "custom"
            ? fromValue
            : new Date(
                new Date(
                    `${today}T00:00:00.000Z`,
                ).getTime() -
                (durations[period] - 1) * DAY,
            )
                .toISOString()
                .slice(0, 10);

    return {
        period,
        from,
        to,
        error,
        start: new Date(
            new Date(
                `${from}T00:00:00.000Z`,
            ).getTime() - OFFSET,
        ),
        end: new Date(
            new Date(
                `${to}T00:00:00.000Z`,
            ).getTime() +
            DAY -
            OFFSET,
        ),
    };
}