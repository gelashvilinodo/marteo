import type { FinancialTrendPeriod } from "./get-financial-trend";

const months = [
    "იანვარი", "თებერვალი", "მარტი",
    "აპრილი", "მაისი", "ივნისი",
    "ივლისი", "აგვისტო", "სექტემბერი",
    "ოქტომბერი", "ნოემბერი", "დეკემბერი",
];

export function chartCents(value: string): bigint {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value
        .replace(/^-/, "")
        .split(".");

    const amount =
        BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0"));

    return negative ? -amount : amount;
}

export function formatTrendDate(
    value: string,
    period: FinancialTrendPeriod,
    short = false,
) {
    const [year, month, day] = value.split("-");

    if (period === "year") {
        return short
            ? month
            : `${months[Number(month) - 1]} ${year}`;
    }

    return short ? day : `${day}.${month}.${year}`;
}

export function getChartScale(values: number[]) {
    let low = 0;
    let high = 0;

    for (const value of values) {
        if (!Number.isFinite(value)) {
            throw new Error("დიაგრამის თანხა არასწორია.");
        }

        low = Math.min(low, value);
        high = Math.max(high, value);
    }

    if (low === 0 && high === 0) high = 1;

    const rawStep = (high - low) * 1.08 / 4;
    const power = 10 ** Math.floor(Math.log10(rawStep));

    const multiplier = [1, 2, 5, 10].find(
        value => value * power >= rawStep,
    )!;

    const step = Math.max(0.01, multiplier * power);
    const minimum = Math.floor(low * 1.04 / step) * step;
    const maximum = Math.ceil(high * 1.04 / step) * step;

    const count = Math.round(
        (maximum - minimum) / step,
    );

    const ticks = Array.from(
        { length: count + 1 },
        (_, index) =>
            Number((maximum - index * step).toFixed(2)),
    );

    const position = (value: number) =>
        ((maximum - value) / (maximum - minimum)) * 100;

    return {
        ticks,
        step,
        position,
        zero: position(0),
    };
}

export function formatAxisMoney(
    value: number,
    step: number,
) {
    const absolute = Math.abs(value);

    if (absolute >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(1)} მლრდ ₾`;
    }

    if (absolute >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)} მლნ ₾`;
    }

    if (absolute >= 10_000) {
        return `${(value / 1_000).toFixed(1)} ათ. ₾`;
    }

    return `${value.toFixed(step < 1 ? 2 : 0)} ₾`;
}