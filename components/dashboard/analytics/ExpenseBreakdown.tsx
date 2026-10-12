"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import type { ExpenseBreakdownData } from "@/lib/analytics/get-expense-breakdown";

const colors: Record<string, string> = {
    COGS: "#F5B942",
    ADVERTISING: "#5A8DEE",
    RENT: "#A78BFA",
    SALARY: "#22C79A",
    TAX: "#F87171",
    UTILITIES: "#38BDF8",
    SOFTWARE: "#818CF8",
    PACKAGING: "#F472B6",
    TRANSPORT: "#FB923C",
    COMMISSION: "#A3E635",
    OTHER: "#94A3B8",
};

function cents(value: string): bigint {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value
        .replace(/^-/, "")
        .split(".");

    const amount =
        BigInt(whole) * 100n +
        BigInt(fraction.padEnd(2, "0"));

    return negative ? -amount : amount;
}

function displayDate(value: string) {
    return value.split("-").reverse().join(".");
}

export default function ExpenseBreakdown({
    data,
}: {
    data: ExpenseBreakdownData;
}) {
    const [selectedId, setSelectedId] = useState<string | null>(
        null,
    );

    const segments = data.segments.map(segment => ({
        ...segment,
        cents: cents(segment.amount),
        color: colors[segment.id] ?? colors.OTHER,
    }));

    const positiveTotal = segments.reduce(
        (sum, segment) =>
            segment.cents > 0n
                ? sum + segment.cents
                : sum,
        0n,
    );

    let offset = 0;

    const slices = segments
        .filter(segment => segment.cents > 0n)
        .map(segment => {
            const percentage =
                Number(
                    segment.cents * 1_000_000n /
                    positiveTotal,
                ) / 10_000;

            const slice = {
                ...segment,
                percentage,
                offset,
            };

            offset += percentage;
            return slice;
        });

    const selected = segments.find(
        segment => segment.id === selectedId,
    );

    const hasCorrections = segments.some(
        segment => segment.cents < 0n,
    );

    return (
        <section className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                <Icon
                    icon="solar:pie-chart-2-linear"
                    className="h-5 w-5 shrink-0 text-accent"
                />
                ხარჯების განაწილება
            </h2>

            <p className="mt-2 text-xs text-text-secondary">
                {displayDate(data.from)} —{" "}
                {displayDate(data.to)}
            </p>

            {segments.length === 0 ? (
                <div className="mt-5 flex min-h-48 flex-col items-center justify-center gap-3 text-center">
                    <Icon
                        icon="solar:pie-chart-2-linear"
                        className="h-10 w-10 text-text-secondary"
                    />
                    <p className="text-sm text-text-secondary">
                        ამ პერიოდში ხარჯები ჯერ არ არის
                        აღრიცხული.
                    </p>
                </div>
            ) : (
                <>
                    <div className="my-5 grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 sm:gap-5">
                        <div className="relative mx-auto aspect-square w-full max-w-64">
                            <svg
                                viewBox="0 0 100 100"
                                aria-hidden="true"
                                className="h-full w-full"
                            >
                                <circle
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    fill="none"
                                    stroke="var(--marteo-border)"
                                    strokeWidth="12"
                                />

                                {slices.map(slice => (
                                    <circle
                                        key={slice.id}
                                        cx="50"
                                        cy="50"
                                        r="40"
                                        pathLength="100"
                                        fill="none"
                                        stroke={slice.color}
                                        strokeWidth={
                                            selectedId === slice.id
                                                ? 15
                                                : 12
                                        }
                                        strokeDasharray={
                                            `${slice.percentage} ${100 - slice.percentage
                                            }`
                                        }
                                        strokeDashoffset={
                                            -slice.offset
                                        }
                                        transform="rotate(-90 50 50)"
                                        className="transition-[stroke-width] duration-300 motion-reduce:transition-none"
                                    />
                                ))}
                            </svg>

                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                                <p className="text-[10px] leading-tight text-text-secondary">
                                    {selected
                                        ? "არჩეული ხარჯი"
                                        : "ჯამური ხარჯი"}
                                </p>

                                <p className="mt-1 max-w-full break-words text-sm font-semibold tabular-nums text-text-primary sm:text-lg">
                                    {selected?.amount ?? data.total} ₾
                                </p>
                            </div>
                        </div>

                        <div className="max-h-64 min-w-0 space-y-1 overflow-y-auto">
                            {segments.map(segment => (
                                <button
                                    key={segment.id}
                                    type="button"
                                    aria-pressed={
                                        selectedId === segment.id
                                    }
                                    onClick={() =>
                                        setSelectedId(current =>
                                            current === segment.id
                                                ? null
                                                : segment.id,
                                        )
                                    }
                                    className={`flex w-full items-start gap-2 rounded-lg p-2 text-left transition-colors ${selectedId === segment.id
                                            ? "bg-background"
                                            : "hover:bg-background/60"
                                        }`}
                                >
                                    <span
                                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                        style={{
                                            backgroundColor:
                                                segment.color,
                                        }}
                                    />

                                    <span className="min-w-0 flex-1">
                                        <span className="block text-xs leading-relaxed text-text-secondary">
                                            {segment.label}
                                        </span>

                                        <span className="mt-0.5 block break-words text-sm font-semibold tabular-nums text-text-primary">
                                            {segment.amount} ₾
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <p className="mt-4 text-xs leading-relaxed text-text-secondary">
                        კატეგორიაზე დაჭერით მის თანხას
                        წრის ცენტრში ნახავ.
                    </p>

                    {hasCorrections && (
                        <p className="mt-2 text-xs text-text-secondary">
                            უარყოფითი კორექტირებები სიაშია
                            ნაჩვენები და ჯამს აკლდება.
                            წრის ნაწილები მხოლოდ დადებით
                            ხარჯებს ასახავს.
                        </p>
                    )}

                    {!data.complete && (
                        <p className="mt-2 text-xs text-warning">
                            გაყიდული პროდუქტების ხარჯის
                            ნაწილი ჩანაწერებში აკლია.
                        </p>
                    )}
                </>
            )}
        </section>
    );
}