"use client";

import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";

import type { FinancialTrendPoint } from "@/lib/analytics/get-financial-trend";

type Metric = "sales" | "costs" | "profit";

const labels: Record<Metric, string> = {
    sales: "გაყიდვები",
    costs: "ხარჯები",
    profit: "მოგება",
};

function displayDate(value: string, short = false) {
    const [year, month, day] = value.split("-");

    return short
        ? `${day}.${month}`
        : `${day}.${month}.${year}`;
}

export default function FinancialTrend({
    points,
    profitReady,
}: {
    points: FinancialTrendPoint[];
    profitReady: boolean;
}) {
    const [chosenMetric, setMetric] = useState<Metric>("sales");
    const [chosenDate, setDate] = useState<string | null>(null);

    const metric =
        chosenMetric === "profit" && !profitReady
            ? "sales"
            : chosenMetric;

    const chart = useMemo(() => {
        const rows = points.map(point => ({
            date: point.date,
            amount: point[metric],
            value: Number(point[metric] ?? "0"),
        }));

        const bounds = rows.reduce(
            (result, row) => ({
                min: Math.min(result.min, row.value),
                max: Math.max(result.max, row.value),
            }),
            { min: 0, max: 0 },
        );

        const maximum =
            bounds.max > 0
                ? bounds.max * 1.08
                : bounds.min < 0
                    ? 0
                    : 1;

        const minimum =
            bounds.min < 0 ? bounds.min * 1.08 : 0;

        const range = maximum - minimum;

        const position = (value: number) =>
            ((maximum - value) / range) * 100;

        return {
            rows,
            zero: position(0),
            position,
        };
    }, [points, metric]);

    const selected =
        chart.rows.find(row => row.date === chosenDate) ??
        chart.rows[chart.rows.length - 1];

    return (
        <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                    <Icon
                        icon="solar:chart-2-linear"
                        className="h-5 w-5 text-accent"
                    />
                    ბოლო 7 დღის ფინანსები
                </h2>

                <select
                    aria-label="დიაგრამის მაჩვენებელი"
                    value={metric}
                    onChange={event =>
                        setMetric(event.target.value as Metric)
                    }
                    className="rounded-xl border border-border bg-background px-3 py-2 text-base text-text-primary outline-none focus:border-accent"
                >
                    <option value="sales">გაყიდვები</option>
                    <option value="costs">ხარჯები</option>
                    <option
                        value="profit"
                        disabled={!profitReady}
                    >
                        {profitReady
                            ? "მოგება"
                            : "მოგება — დასაზუსტებელია"}
                    </option>
                </select>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                თითო სვეტი ერთ დღეს ასახავს.
                თანხის სანახავად დააჭირე შესაბამის დღეს.
            </p>

            {metric === "costs" && (
                <p className="mt-2 text-xs text-text-secondary">
                    გაყიდული ნივთების თვითღირებულება და
                    აღრიცხული ბიზნესხარჯები.
                    {!profitReady &&
                        " თვითღირებულების ნაწილი შეიძლება დასაზუსტებელი იყოს."}
                </p>
            )}

            {chart.rows.length === 0 ? (
                <div className="mt-4 flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-5 text-center">
                    <Icon
                        icon="solar:chart-2-linear"
                        className="h-8 w-8 text-text-secondary"
                    />
                    <p className="text-sm text-text-secondary">
                        ამ პერიოდში ფინანსური მოძრაობები
                        ჯერ არ არის აღრიცხული.
                    </p>
                </div>
            ) : (
                <>
                    <div className="mt-5 overflow-x-auto pb-2">
                        <div className="grid w-full grid-cols-7 gap-1 sm:gap-3">
                            {chart.rows.map(row => {
                                const top = chart.position(
                                    Math.max(row.value, 0),
                                );

                                const bottom = chart.position(
                                    Math.min(row.value, 0),
                                );

                                const active =
                                    selected?.date === row.date;

                                const color =
                                    row.value < 0
                                        ? "bg-danger"
                                        : metric === "costs"
                                            ? "bg-warning"
                                            : metric === "profit"
                                                ? "bg-success"
                                                : "bg-accent";

                                return (
                                    <button
                                        key={row.date}
                                        type="button"
                                        aria-pressed={active}
                                        aria-label={`${displayDate(row.date)}: ${labels[metric]} ${row.amount} ლარი`}
                                        title={`${displayDate(row.date)} · ${row.amount} ₾`}
                                        onClick={() => setDate(row.date)}
                                        onFocus={() => setDate(row.date)}
                                        className={`min-w-0 rounded-lg px-1 pt-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${active
                                            ? "bg-accent/10"
                                            : "hover:bg-background"
                                            }`}
                                    >
                                        <div className="relative h-48">
                                            <span
                                                className="absolute inset-x-0 border-t border-border"
                                                style={{
                                                    top: `${chart.zero}%`,
                                                }}
                                            />

                                            {row.value === 0 ? (
                                                <span
                                                    className={`absolute left-1/2 h-1 w-3 -translate-x-1/2 rounded-full sm:w-4 ${color}`}
                                                    style={{
                                                        top: `${chart.zero}%`,
                                                        transform:
                                                            "translateY(-50%)",
                                                    }}
                                                />
                                            ) : (
                                                <span
                                                    className={`absolute left-1/2 w-3 -translate-x-1/2 rounded-md transition-all duration-300 motion-reduce:transition-none sm:w-4 ${color}`}
                                                    style={{
                                                        top: `${top}%`,
                                                        height:
                                                            `${bottom - top}%`,
                                                        minHeight: "2px",
                                                    }}
                                                />
                                            )}
                                        </div>

                                        <span className="mt-3 block whitespace-nowrap pb-2 text-xs tabular-nums text-text-secondary">
                                            {displayDate(row.date, true)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {selected && (
                        <div
                            aria-live="polite"
                            className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-3"
                        >
                            <div>
                                <p className="text-sm text-text-primary">
                                    {displayDate(selected.date)}
                                </p>
                                <p className="mt-1 text-xs text-text-secondary">
                                    {labels[metric]}
                                </p>
                            </div>

                            <p className="text-lg font-semibold tabular-nums text-text-primary">
                                {selected.amount} ₾
                            </p>
                        </div>
                    )}

                    <p className="mt-3 text-xs leading-relaxed text-text-secondary">
                        უარყოფითი მნიშვნელობა შეიძლება
                        დაბრუნების ან გადაცვლის ფინანსური
                        კორექტირებიდან წარმოიშვას.
                    </p>
                </>
            )}
        </section>
    );
}