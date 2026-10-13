"use client";

import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Icon } from "@iconify/react";
import { useFinancialTrend } from "./useFinancialTrend";

import {
    chartCents,
    formatAxisMoney,
    formatTrendDate,
    getChartScale,
} from "@/lib/analytics/chart-scale";

import type { FinancialTrendPeriod } from "@/lib/analytics/get-financial-trend";

import type { FinancialTrendPoint } from "@/lib/analytics/get-financial-trend";

type Metric = "sales" | "costs" | "profit";

const labels: Record<Metric, string> = {
    sales: "გაყიდვები",
    costs: "ხარჯები",
    profit: "მოგება",
};

export default function FinancialTrend({
    points,
}: {
    points: FinancialTrendPoint[];
    profitReady: boolean;
}) {
    const trend = useFinancialTrend(points);

    const [chosenMetric, setMetric] =
        useState<Metric>("sales");

    const [chosenDate, setDate] =
        useState<string | null>(null);

    const viewport = useRef<HTMLDivElement>(null);

    const metric =
        chosenMetric === "profit" && !trend.profitReady
            ? "sales"
            : chosenMetric;

    const chart = useMemo(() => {
        const rows = trend.points.map(point => ({
            date: point.date,
            amount: point[metric] ?? "0.00",
            value: Number(point[metric] ?? "0"),
            cents: chartCents(point[metric] ?? "0.00"),
        }));

        const minimumAmount = rows.reduce(
            (minimum, row) =>
                row.cents < minimum ? row.cents : minimum,
            rows[0]?.cents ?? 0n,
        );

        const maximumAmount = rows.reduce(
            (maximum, row) =>
                row.cents > maximum ? row.cents : maximum,
            rows[0]?.cents ?? 0n,
        );

        return {
            rows,
            minimumAmount,
            maximumAmount,
            ...getChartScale(rows.map(row => row.value)),
        };
    }, [trend.points, metric]);

    useEffect(() => {
        const element = viewport.current;

        if (!element) return;

        element.scrollLeft =
            trend.period === "month"
                ? element.scrollWidth - element.clientWidth
                : 0;
    }, [trend.period, trend.points]);

    const selected =
        chart.rows.find(row => row.date === chosenDate) ??
        chart.rows[chart.rows.length - 1];

    const titles = {
        week: "ბოლო 7 დღე",
        month: "ბოლო 30 დღე",
        year: "ბოლო 12 თვე",
    };

    function barColor(amount: bigint) {
        const different =
            chart.minimumAmount !== chart.maximumAmount;

        if (different && amount === chart.maximumAmount) {
            return metric === "costs"
                ? "bg-warning"
                : "bg-success";
        }

        if (different && amount === chart.minimumAmount) {
            return metric === "costs"
                ? "bg-success"
                : "bg-warning";
        }

        return metric === "costs"
            ? "bg-violet-400"
            : "bg-accent";
    }

    return (
        <section
            aria-busy={trend.loading}
            className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5"
        >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                    <Icon
                        icon="solar:chart-2-linear"
                        className="h-5 w-5 shrink-0 text-accent"
                    />
                    ფინანსები
                </h2>

                <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2 sm:w-52">
                    <select
                        aria-label="დიაგრამის პერიოდი"
                        value={trend.requestedPeriod}
                        onChange={event => {
                            setDate(null);

                            void trend.loadPeriod(
                                event.target.value as
                                    FinancialTrendPeriod,
                            );
                        }}
                        className="h-10 min-w-0 rounded-xl border border-border bg-background px-2 text-base text-text-primary outline-none focus:border-accent sm:text-sm"
                    >
                        <option value="week">7 დღე</option>
                        <option value="month">თვე</option>
                        <option value="year">წელი</option>
                    </select>

                    <select
                        aria-label="დიაგრამის მაჩვენებელი"
                        value={metric}
                        disabled={trend.loading}
                        onChange={event =>
                            setMetric(
                                event.target.value as Metric,
                            )
                        }
                        className="h-10 min-w-0 rounded-xl border border-border bg-background px-2 text-base text-text-primary outline-none focus:border-accent sm:text-sm"
                    >
                        <option value="sales">გაყიდვები</option>
                        <option value="costs">ხარჯები</option>
                        <option
                            value="profit"
                            disabled={!trend.profitReady}
                        >
                            მოგება
                        </option>
                    </select>
                </div>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                {titles[trend.period]}.
                {trend.period === "year"
                    ? " სვეტები თვეებს ასახავს."
                    : " სვეტები დღეებს ასახავს."}
                {" "}თანხის სანახავად დააჭირე სვეტს.
            </p>

            {trend.error && (
                <div
                    role="alert"
                    className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm"
                >
                    <p>{trend.error}</p>

                    <button
                        type="button"
                        onClick={() => void trend.reload()}
                        className="mt-2 font-semibold text-accent"
                    >
                        ხელახლა ცდა
                    </button>
                </div>
            )}

            <div className="relative mt-5">
                <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                    <div
                        aria-hidden="true"
                        className="relative mt-3 h-48"
                    >
                        {chart.ticks.map(tick => (
                            <span
                                key={tick}
                                className="absolute right-0 max-w-full -translate-y-1/2 text-right text-[10px] leading-tight tabular-nums text-text-secondary"
                                style={{
                                    top: `${chart.position(tick)}%`,
                                }}
                            >
                                {formatAxisMoney(
                                    tick,
                                    chart.step,
                                )}
                            </span>
                        ))}
                    </div>

                    <div
                        ref={viewport}
                        className="h-64 min-w-0 overflow-x-auto overscroll-x-contain pb-2"
                    >
                        <div
                            className="relative grid min-w-full gap-1 pt-3"
                            style={{
                                minWidth:
                                    trend.period === "month"
                                        ? `${chart.rows.length * 44}px`
                                        : "100%",
                                gridTemplateColumns:
                                    `repeat(${chart.rows.length}, minmax(0, 1fr))`,
                            }}
                        >
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-x-0 top-3 h-48"
                            >
                                {chart.ticks.map(tick => (
                                    <span
                                        key={tick}
                                        className={
                                            "absolute inset-x-0 border-t " +
                                            (
                                                tick === 0
                                                    ? "border-border"
                                                    : "border-dashed border-border/50"
                                            )
                                        }
                                        style={{
                                            top:
                                                `${chart.position(tick)}%`,
                                        }}
                                    />
                                ))}
                            </div>

                            {chart.rows.map(row => {
                                const top = chart.position(
                                    Math.max(row.value, 0),
                                );

                                const bottom = chart.position(
                                    Math.min(row.value, 0),
                                );

                                const active =
                                    selected?.date === row.date;

                                const color = barColor(row.cents);

                                const fullDate = formatTrendDate(
                                    row.date,
                                    trend.period,
                                );

                                return (
                                    <button
                                        key={row.date}
                                        type="button"
                                        disabled={trend.loading}
                                        aria-pressed={active}
                                        aria-label={`${fullDate}: ${labels[metric]} ${row.amount} ლარი`}
                                        title={`${fullDate} · ${row.amount} ₾`}
                                        onClick={() =>
                                            setDate(row.date)
                                        }
                                        onFocus={() =>
                                            setDate(row.date)
                                        }
                                        className={`relative min-w-0 rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent ${
                                            active
                                                ? "bg-accent/10"
                                                : "hover:bg-background"
                                        }`}
                                    >
                                        <div className="relative h-48">
                                            <span
                                                className={`absolute left-1/2 w-2 -translate-x-1/2 rounded-md transition-all duration-300 motion-reduce:transition-none sm:w-3 ${color}`}
                                                style={
                                                    row.value === 0
                                                        ? {
                                                            top:
                                                                `${chart.zero}%`,
                                                            height: "3px",
                                                            marginTop: "-1.5px",
                                                        }
                                                        : {
                                                            top: `${top}%`,
                                                            height:
                                                                `${bottom - top}%`,
                                                            minHeight: "2px",
                                                        }
                                                }
                                            />
                                        </div>

                                        <span className="mt-3 block pb-2 text-[10px] tabular-nums text-text-secondary">
                                            {formatTrendDate(
                                                row.date,
                                                trend.period,
                                                true,
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {trend.loading && (
                    <div
                        role="status"
                        className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-xl bg-surface/80 text-sm text-text-primary"
                    >
                        <Icon
                            icon="svg-spinners:180-ring"
                            className="h-5 w-5"
                        />
                        იტვირთება…
                    </div>
                )}
            </div>

            <div className="mt-1 flex min-h-5 flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-secondary">
                {chart.minimumAmount !== chart.maximumAmount ? (
                    <>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-success" />
                            {metric === "costs"
                                ? "ყველაზე დაბალი ხარჯი"
                                : "ყველაზე მაღალი თანხა"}
                        </span>

                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-warning" />
                            {metric === "costs"
                                ? "ყველაზე მაღალი ხარჯი"
                                : "ყველაზე დაბალი თანხა"}
                        </span>
                    </>
                ) : (
                    <span>
                        ყველა მონაკვეთს ერთნაირი თანხა აქვს.
                    </span>
                )}
            </div>

            {selected && (
                <div
                    aria-live="polite"
                    className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-4 py-3"
                >
                    <div>
                        <p className="text-sm text-text-primary">
                            {formatTrendDate(
                                selected.date,
                                trend.period,
                            )}
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
                {metric === "sales"
                    ? "გაყიდვის თანხა მიწოდების საფასურიანად; დაბრუნების კორექტირებების გათვალისწინებით."
                    : metric === "costs"
                        ? "გაყიდული ნივთების თვითღირებულება და ბიზნესხარჯები."
                        : "გაყიდვის თანხა მინუს გაყიდული ნივთების თვითღირებულება და ბიზნესხარჯები."}
            </p>
        </section>
    );
}