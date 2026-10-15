"use client";

import {
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";

import {
    formatAxisMoney,
    getChartScale,
} from "@/lib/analytics/chart-scale";

import type { HomeTrend } from "@/lib/dashboard/get-home-trend";

function dateLabel(
    date: string,
    bucket: HomeTrend["bucket"],
) {
    const [year, month, day] = date.split("-");

    if (bucket === "year") return year;
    if (bucket === "month") return `${month}.${year}`;

    return `${day}.${month}`;
}

function money(value: string | null) {
    if (value === null) return "—";

    const [integer, decimal] = value.split(".");

    return (
        integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
        (decimal !== undefined ? `.${decimal}` : "") +
        " ₾"
    );
}

export default function HomeCharts({
    data,
    expenseChart,
}: {
    data: HomeTrend;
    expenseChart?: ReactNode;
}) {
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const viewport = useRef<HTMLDivElement>(null);

    const chart = useMemo(() => {
        const rows = data.points.map(point => ({
            ...point,
            salesValue: Number(point.sales),
            profitValue: point.profit === null
                ? null
                : Number(point.profit),
        }));

        const values = rows.flatMap(row => (
            row.profitValue === null
                ? [row.salesValue]
                : [row.salesValue, row.profitValue]
        ));

        return {
            rows,
            ...getChartScale(values),
        };
    }, [data.points]);

    useLayoutEffect(() => {
        const element = viewport.current;

        if (element) {
            element.scrollLeft = Math.max(
                0,
                element.scrollWidth - element.clientWidth,
            );
        }
    }, [data.points]);

    const selected =
        chart.rows.find(row => row.date === selectedDate) ??
        chart.rows[chart.rows.length - 1];

    const missingProfit = chart.rows.some(
        row => row.profit === null,
    );

    function barPosition(value: number) {
        const top = chart.position(Math.max(value, 0));
        const bottom = chart.position(Math.min(value, 0));

        return {
            top: `${top}%`,
            height: `${bottom - top}%`,
            minHeight: value === 0 ? undefined : "2px",
        };
    }

    return (
        <section
            aria-label="ბიზნესის დიაგრამები"
            className={
                expenseChart
                    ? "grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-2"
                    : "min-w-0"
            }
        >
            <article className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-4 sm:p-5">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-text-primary">
                        გაყიდვები და სუფთა მოგება
                    </h2>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-secondary">
                        <span className="inline-flex items-center gap-2">
                            <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 rounded-full bg-accent"
                            />
                            გაყიდვები
                        </span>

                        <span className="inline-flex items-center gap-2">
                            <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 rounded-full bg-success"
                            />
                            სუფთა მოგება
                        </span>
                    </div>
                </header>

                <div className="mt-5 grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                    <div
                        aria-hidden="true"
                        className="relative mt-3 h-56"
                    >
                        {chart.ticks.map(tick => (
                            <span
                                key={tick}
                                className="absolute right-0 max-w-full -translate-y-1/2 text-right text-[10px] leading-tight text-text-secondary tabular-nums"
                                style={{
                                    top: `${chart.position(tick)}%`,
                                }}
                            >
                                {formatAxisMoney(tick, chart.step)}
                            </span>
                        ))}
                    </div>

                    <div
                        ref={viewport}
                        className="min-w-0 overflow-x-auto overscroll-x-contain pb-2"
                    >
                        <div
                            className="relative grid min-w-full gap-1 pt-3"
                            style={{
                                minWidth: `${Math.max(
                                    chart.rows.length * 44,
                                    180,
                                )}px`,
                                gridTemplateColumns: `repeat(${Math.max(
                                    chart.rows.length,
                                    1,
                                )}, minmax(0, 1fr))`,
                            }}
                        >
                            <div
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-x-0 top-3 h-56"
                            >
                                {chart.ticks.map(tick => (
                                    <span
                                        key={tick}
                                        className={`absolute inset-x-0 border-t ${
                                            tick === 0
                                                ? "border-border"
                                                : "border-dashed border-border/50"
                                        }`}
                                        style={{
                                            top: `${chart.position(tick)}%`,
                                        }}
                                    />
                                ))}
                            </div>

                            {chart.rows.map(row => {
                                const active = selected?.date === row.date;
                                const label = dateLabel(row.date, data.bucket);

                                return (
                                    <button
                                        key={row.date}
                                        type="button"
                                        aria-label={`${label}: გაყიდვები ${money(
                                            row.sales,
                                        )}, სუფთა მოგება ${money(row.profit)}`}
                                        aria-pressed={active}
                                        onClick={() => setSelectedDate(row.date)}
                                        className="relative min-w-0 rounded-lg px-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                                    >
                                        <span className="relative block h-56">
                                            <span
                                                className={`absolute w-[14px] rounded-sm bg-accent ${
                                                    active
                                                        ? "opacity-100"
                                                        : "opacity-70"
                                                }`}
                                                style={{
                                                    ...barPosition(row.salesValue),
                                                    left: "calc(50% - 13px)",
                                                }}
                                            />

                                            {row.profitValue !== null && (
                                                <span
                                                    className={`absolute z-10 w-[14px] rounded-sm bg-success ${
                                                        active
                                                            ? "opacity-95"
                                                            : "opacity-75"
                                                    }`}
                                                    style={{
                                                        ...barPosition(row.profitValue),
                                                        left: "calc(50% - 1px)",
                                                    }}
                                                />
                                            )}
                                        </span>

                                        <span className="mt-3 block whitespace-nowrap text-[10px] text-text-secondary tabular-nums">
                                            {label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {missingProfit && (
                    <p role="status" className="mt-3 text-xs text-warning">
                        სუფთა მოგების გამოსათვლელად თვითღირებულების
                        მონაცემების შევსებაა საჭირო.
                    </p>
                )}

                {selected && (
                    <div
                        role="status"
                        aria-live="polite"
                        className="mt-4 rounded-xl border border-border bg-background p-3"
                    >
                        <p className="mb-3 text-xs text-text-secondary">
                            {dateLabel(selected.date, data.bucket)}
                        </p>

                        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="min-w-0">
                                <p className="flex items-center gap-2 text-xs text-text-secondary">
                                    <span
                                        aria-hidden="true"
                                        className="h-2 w-2 rounded-full bg-accent"
                                    />
                                    გაყიდვები
                                </p>

                                <p className="mt-1 break-words text-sm font-semibold text-text-primary tabular-nums">
                                    {money(selected.sales)}
                                </p>
                            </div>

                            <div className="min-w-0">
                                <p className="flex items-center gap-2 text-xs text-text-secondary">
                                    <span
                                        aria-hidden="true"
                                        className="h-2 w-2 rounded-full bg-success"
                                    />
                                    სუფთა მოგება
                                </p>

                                <p className="mt-1 break-words text-sm font-semibold text-text-primary tabular-nums">
                                    {money(selected.profit)}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </article>

            {expenseChart}
        </section>
    );
}