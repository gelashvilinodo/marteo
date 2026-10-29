"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import type { StatisticsCharts as ChartsData } from "@/lib/statistics/get-statistics-charts";

const methods = {
    UNKNOWN: { label: "მეთოდი უცნობია", color: "#94a3b8" },
    CASH: { label: "ნაღდი", color: "#16c45b" },
    CARD: { label: "ბარათი", color: "#598bed" },
    BANK_TRANSFER: { label: "გადარიცხვა", color: "#a78bfa" },
};

function date(value: string) {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
}

function cents(value: string): bigint {
    const [whole, fraction = "00"] = value.split(".");
    return BigInt(whole) * 100n + BigInt(fraction);
}

export default function StatisticsCharts({
    data,
    from,
    to,
}: {
    data: ChartsData;
    from: string;
    to: string;
}) {
    const [selectedDate, setSelectedDate] = useState("");
    const [selectedMethod, setSelectedMethod] = useState("");

    const selected =
        data.orders.find(point => point.from === selectedDate) ??
        data.orders[data.orders.length - 1];

    const counts = data.orders.map(point => point.count);
    const highest = Math.max(0, ...counts);
    const lowest = counts.length ? Math.min(...counts) : 0;

    const rawStep = Math.max(1, highest / 4);
    const power = 10 ** Math.floor(Math.log10(rawStep));
    const factor =
        [1, 2, 5, 10].find(value => value * power >= rawStep) ?? 10;
    const step = Math.max(1, factor * power);
    const axisMax = Math.max(step * 4, Math.ceil(highest / step) * step);

    const ticks = Array.from(
        { length: Math.round(axisMax / step) + 1 },
        (_, index) => axisMax - index * step,
    );

    const bucketLabel =
        data.bucket === "day"
            ? "თითო სვეტი ერთ დღეს ასახავს"
            : data.bucket === "week"
                ? "თითო სვეტი ერთ კვირას ასახავს"
                : "თითო სვეტი ერთ თვეს ასახავს";

    function shortLabel(value: string) {
        const [year, month, day] = value.split("-");

        return data.bucket === "month"
            ? `${month}.${year.slice(-2)}`
            : `${day}.${month}`;
    }

    const totalCents = cents(data.receivedTotal);
    let offset = 0;

    const segments = data.payments.map(payment => {
        const value = cents(payment.amount);
        const share =
            totalCents > 0n
                ? Number((value * 1000000n) / totalCents) / 10000
                : 0;

        const segment = { ...payment, share, offset };
        offset += share;
        return segment;
    });

    const chosenPayment = data.payments.find(
        payment => payment.method === selectedMethod,
    );

    const panel =
        "min-w-0 rounded-2xl border border-border bg-surface p-4";

    return (
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <section className={panel}>
                <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                    <Icon
                        icon="solar:chart-2-linear"
                        className="h-5 w-5 shrink-0 text-accent"
                    />
                    დასრულებული შეკვეთები
                </h2>

                <p className="mt-3 text-xs text-text-secondary">
                    {bucketLabel}. რაოდენობის სანახავად დააჭირე სვეტს.
                </p>

                <div className="mt-5 grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-2">
                    <div className="relative mt-3 h-48">
                        {ticks.map(tick => (
                            <span
                                key={tick}
                                style={{
                                    top: `${(1 - tick / axisMax) * 100}%`,
                                }}
                                className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-text-secondary"
                            >
                                {tick}
                            </span>
                        ))}
                    </div>

                    <div className="h-64 min-w-0 overflow-x-auto overscroll-x-contain pb-2">
                        <div
                            style={{
                                minWidth: `${data.orders.length * 44}px`,
                                gridTemplateColumns: `repeat(${Math.max(
                                    1,
                                    data.orders.length,
                                )}, minmax(0, 1fr))`,
                            }}
                            className="relative grid min-w-full gap-1 pt-3"
                        >
                            <div className="pointer-events-none absolute inset-x-0 top-3 h-48">
                                {ticks.map(tick => (
                                    <div
                                        key={tick}
                                        style={{
                                            top: `${(1 - tick / axisMax) * 100}%`,
                                        }}
                                        className={`absolute inset-x-0 border-t border-border ${tick === 0 ? "" : "border-dashed"
                                            }`}
                                    />
                                ))}
                            </div>

                            {data.orders.map(point => {
                                const color =
                                    highest === lowest
                                        ? "bg-accent"
                                        : point.count === highest
                                            ? "bg-success"
                                            : point.count === lowest
                                                ? "bg-warning"
                                                : "bg-accent";

                                return (
                                    <button
                                        key={point.from}
                                        type="button"
                                        aria-pressed={
                                            selected?.from === point.from
                                        }
                                        aria-label={`${date(point.from)}${point.from !== point.to
                                                ? ` - ${date(point.to)}`
                                                : ""
                                            }: ${point.count} შეკვეთა`}
                                        onClick={() =>
                                            setSelectedDate(point.from)
                                        }
                                        className={`relative min-w-0 rounded-xl px-1 pb-2 text-center transition-colors ${selected?.from === point.from
                                                ? "bg-accent/10"
                                                : "hover:bg-background"
                                            }`}
                                    >
                                        <div className="relative h-48">
                                            <div
                                                style={{
                                                    height:
                                                        point.count === 0
                                                            ? "3px"
                                                            : `${(point.count /
                                                                axisMax) *
                                                            100}%`,
                                                }}
                                                className={`absolute bottom-0 left-1/2 w-2 -translate-x-1/2 rounded-full sm:w-3 ${color}`}
                                            />
                                        </div>

                                        <span className="mt-3 block whitespace-nowrap text-[10px] tabular-nums text-text-secondary">
                                            {shortLabel(point.from)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {selected && (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
                        <div className="min-w-0">
                            <p className="text-sm text-text-primary">
                                {date(selected.from)}
                                {selected.from !== selected.to &&
                                    ` - ${date(selected.to)}`}
                            </p>
                            <p className="mt-1 text-xs text-text-secondary">
                                დასრულებული შეკვეთები
                            </p>
                        </div>
                        <p className="shrink-0 text-xl font-semibold tabular-nums text-text-primary">
                            {selected.count}
                        </p>
                    </div>
                )}

                <p className="mt-3 text-xs text-text-secondary">
                    ითვლება შეკვეთის პირველი დასრულება.
                </p>
            </section>

            <section className={`${panel} flex flex-col`}>
                <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                    <Icon
                        icon="solar:pie-chart-2-linear"
                        className="h-5 w-5 shrink-0 text-accent"
                    />
                    გადახდის მეთოდები
                </h2>

                <p className="mt-3 text-xs text-text-secondary">
                    {date(from)} - {date(to)}
                </p>

                <div className="my-5 grid min-w-0 flex-1 grid-cols-2 items-center gap-3 sm:gap-5">
                    <div className="relative mx-auto aspect-square w-full max-w-64">
                        <svg
                            viewBox="0 0 100 100"
                            role="img"
                            aria-label="მიღებული თანხის განაწილება გადახდის მეთოდებით"
                            className="h-full w-full -rotate-90"
                        >
                            <circle
                                cx="50"
                                cy="50"
                                r="40"
                                fill="none"
                                strokeWidth="12"
                                className="stroke-border"
                            />

                            {segments
                                .filter(segment => segment.share > 0)
                                .map(segment => (
                                    <circle
                                        key={segment.method}
                                        cx="50"
                                        cy="50"
                                        r="40"
                                        pathLength="100"
                                        fill="none"
                                        stroke={methods[segment.method].color}
                                        strokeWidth="12"
                                        strokeDasharray={`${segment.share} ${100 - segment.share
                                            }`}
                                        strokeDashoffset={-segment.offset}
                                    />
                                ))}
                        </svg>

                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                            <p className="text-xs text-text-secondary">
                                {chosenPayment
                                    ? methods[chosenPayment.method].label
                                    : "მიღებული თანხა"}
                            </p>
                            <p className="text-sm font-semibold tabular-nums text-text-primary sm:text-lg">
                                {chosenPayment?.amount ??
                                    data.receivedTotal}{" "}
                                ₾
                            </p>
                        </div>
                    </div>

                    <div className="min-w-0 space-y-3">
                        {segments.map(segment => (
                            <button
                                key={segment.method}
                                type="button"
                                aria-pressed={
                                    selectedMethod === segment.method
                                }
                                onClick={() =>
                                    setSelectedMethod(current =>
                                        current === segment.method
                                            ? ""
                                            : segment.method,
                                    )
                                }
                                className={`flex w-full items-start gap-2 rounded-xl p-2 text-left transition-colors ${selectedMethod === segment.method
                                        ? "bg-background"
                                        : "hover:bg-background"
                                    }`}
                            >
                                <span
                                    style={{
                                        backgroundColor:
                                            methods[segment.method].color,
                                    }}
                                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                                />

                                <span className="min-w-0">
                                    <span className="block break-words text-xs text-text-secondary sm:text-sm">
                                        {methods[segment.method].label}
                                    </span>
                                    <span className="mt-1 block break-words text-sm font-semibold tabular-nums text-text-primary">
                                        {segment.amount} ₾
                                    </span>
                                    <span className="mt-1 block text-xs tabular-nums text-text-secondary">
                                        {segment.share.toFixed(1)}%
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <p className="text-xs text-text-secondary">
                    {totalCents === 0n
                        ? "ამ პერიოდში მიღებული გადახდები არ არის."
                        : "მიღებული გადახდების განაწილება; დაბრუნებული თანხა აქ არ გამოაკლდება."}
                </p>
            </section>
        </div>
    );
}