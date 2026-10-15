"use client";

import {
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
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

function money(value: string) {
    const [integer, decimal] = value.split(".");

    return (
        integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
        (decimal !== undefined ? `.${decimal}` : "") +
        " ₾"
    );
}

function Chart({
    data,
    metric,
}: {
    data: HomeTrend;
    metric: "sales" | "profit";
}) {
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const viewport = useRef<HTMLDivElement>(null);

    const chart = useMemo(() => {
        const rows = data.points.map(point => ({
            date: point.date,
            amount: point[metric],
            value: Number(point[metric] ?? "0"),
        }));

        return {
            rows,
            ...getChartScale(rows.map(row => row.value)),
        };
    }, [data.points, metric]);

    const unavailable = data.points.some(
        point => point[metric] === null,
    );

    useLayoutEffect(() => {
        const element = viewport.current;

        if (!element || unavailable) return;

        element.scrollLeft = Math.max(
            0,
            element.scrollWidth - element.clientWidth,
        );
    }, [data.points, unavailable]);

    const selected =
        chart.rows.find(row => row.date === selectedDate) ??
        chart.rows[chart.rows.length - 1];

    const title = metric === "sales"
        ? "გაყიდვების სტატისტიკა"
        : "სუფთა მოგება";

    const color = metric === "sales"
        ? "bg-accent"
        : "bg-success";

    return (
        <article className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <header className="flex items-center gap-2">
                <span
                    aria-hidden="true"
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
                />

                <h2 className="text-base font-semibold text-text-primary">
                    {title}
                </h2>
            </header>

            {unavailable ? (
                <div
                    role="status"
                    className="mt-4 flex min-h-72 items-center justify-center rounded-xl border border-dashed border-border p-5 text-center text-sm leading-relaxed text-text-secondary"
                >
                    მოგების გამოსათვლელად თვითღირებულების
                    მონაცემების შევსებაა საჭირო.
                </div>
            ) : (
                <>
                    <div className="mt-5 grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
                        <div
                            aria-hidden="true"
                            className="relative mt-3 h-48"
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
                                        chart.rows.length * 36,
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
                                    className="pointer-events-none absolute inset-x-0 top-3 h-48"
                                >
                                    {chart.ticks.map(tick => (
                                        <span
                                            key={tick}
                                            className={`absolute inset-x-0 border-t ${tick === 0
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
                                    const top = chart.position(
                                        Math.max(row.value, 0),
                                    );

                                    const bottom = chart.position(
                                        Math.min(row.value, 0),
                                    );

                                    const active =
                                        selected?.date === row.date;

                                    const label = dateLabel(
                                        row.date,
                                        data.bucket,
                                    );

                                    return (
                                        <button
                                            key={row.date}
                                            type="button"
                                            aria-label={`${label}: ${money(
                                                row.amount ?? "0.00",
                                            )}`}
                                            aria-pressed={active}
                                            onClick={() => {
                                                setSelectedDate(row.date);
                                            }}
                                            className="relative min-w-0 rounded-lg px-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                                        >
                                            <span className="relative block h-48">
                                                <span
                                                    className={`absolute left-1/2 w-4 -translate-x-1/2 rounded-sm ${color} ${active
                                                        ? "opacity-100"
                                                        : "opacity-65"
                                                        }`}
                                                    style={{
                                                        top: `${top}%`,
                                                        height: `${bottom - top}%`,
                                                        minHeight: row.value === 0
                                                            ? undefined
                                                            : "2px",
                                                    }}
                                                />
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

                    {selected && (
                        <div
                            role="status"
                            aria-live="polite"
                            className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background p-3"
                        >
                            <span className="text-xs text-text-secondary">
                                {dateLabel(selected.date, data.bucket)}
                            </span>

                            <span className="text-sm font-semibold text-text-primary tabular-nums">
                                {money(selected.amount ?? "0.00")}
                            </span>
                        </div>
                    )}
                </>
            )}
        </article>
    );
}

export default function HomeCharts({
    data,
}: {
    data: HomeTrend;
}) {
    return (
        <section
            aria-label="გაყიდვებისა და მოგების დიაგრამები"
            className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2"
        >
            <Chart data={data} metric="sales" />
            <Chart data={data} metric="profit" />
        </section>
    );
}