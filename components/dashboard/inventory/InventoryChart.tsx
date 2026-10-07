"use client";

import { useId, useState } from "react";
import { Icon } from "@iconify/react";

import type { InventoryChartData } from "@/lib/inventory/get-inventory-page";

type Mode = "categories" | "status" | "value";

type Segment = {
    id: string;
    label: string;
    value: bigint;
    color: string;
};

const ZERO = BigInt(0);

const categoryColors = [
    "var(--marteo-success)",
    "var(--marteo-accent)",
    "var(--marteo-warning)",
    "var(--marteo-danger)",
];

function formatQuantity(value: bigint) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatMoney(cents: bigint) {
    const integer = formatQuantity(cents / BigInt(100));
    const decimal = (cents % BigInt(100))
        .toString()
        .padStart(2, "0");

    return `${integer}.${decimal} ₾`;
}

function getStatusSegments(data: InventoryChartData): Segment[] {
    const segments: Segment[] = [
        {
            id: "good",
            label: "საკმარისი მარაგი",
            value: ZERO,
            color: "var(--marteo-success)",
        },
        {
            id: "low",
            label: "დაბალი მარაგი",
            value: ZERO,
            color: "var(--marteo-warning)",
        },
        {
            id: "exhausted",
            label: "ამოწურული",
            value: ZERO,
            color: "var(--marteo-danger)",
        },
        {
            id: "defective",
            label: "მხოლოდ წუნდებული",
            value: ZERO,
            color: "var(--marteo-accent)",
        },
    ];

    const counts = [data.statuses.good, data.statuses.low, data.statuses.exhausted, data.statuses.defective];
    segments.forEach((segment, index) => { segment.value = BigInt(counts[index]); });

    return segments;
}

function getCategorySegments(
    data: InventoryChartData,
    mode: "categories" | "value",
): Segment[] {
    const categories = new Map<
        string,
        { label: string; value: bigint }
    >();

    for (const category of data.categories) {
        const value = BigInt(mode === "value" ? category.valueCents : category.quantity);
        if (value <= ZERO) continue;
        categories.set(category.key, { label: category.label, value });
    }

    const sorted = [...categories.entries()].sort(
        ([firstKey, first], [secondKey, second]) => {
            if (first.value !== second.value) {
                return first.value > second.value ? -1 : 1;
            }

            return firstKey < secondKey
                ? -1
                : firstKey > secondKey
                    ? 1
                    : 0;
        },
    );

    const segments: Segment[] = sorted
        .slice(0, 4)
        .map(([key, category], index) => ({
            id: `category-${key}`,
            label: category.label,
            value: category.value,
            color: categoryColors[index],
        }));

    if (sorted.length > 4) {
        segments.push({
            id: "other-categories",
            label: "სხვა კატეგორიები",
            value: sorted
                .slice(4)
                .reduce((total, [, category]) => total + category.value, ZERO),
            color: "var(--marteo-text-secondary)",
        });
    }

    return segments;
}

export default function InventoryChart({
    data,
}: {
    data: InventoryChartData;
}) {
    const [mode, setMode] = useState<Mode>("categories");
    const selectId = useId();

    const segments =
        mode === "status"
            ? getStatusSegments(data)
            : getCategorySegments(data, mode);

    const total = segments.reduce(
        (sum, segment) => sum + segment.value,
        ZERO,
    );

    const slices = segments.map((segment, index) => {
        const percentage =
            total > ZERO
                ? (Number(segment.value) / Number(total)) * 100
                : 0;

        const slice = {
            ...segment,
            percentage,
            offset: total > ZERO
                ? Number(segments.slice(0, index).reduce((sum, previous) => sum + previous.value, ZERO)) / Number(total) * 100
                : 0,
        };

        return slice;
    });

    const unit =
        mode === "status"
            ? "სახეობა"
            : mode === "value"
                ? "თვითღირებულებით"
                : "პროდუქტი";

    const explanation =
        mode === "status"
            ? "სახეობების მიხედვით. შერეული ნაშთი რეალიზებადი რაოდენობით ფასდება."
            : mode === "value"
                ? "დარჩენილი რეალიზებადი პროდუქციის თვითღირებულებით."
                : "დარჩენილი რეალიზებადი პროდუქციის რაოდენობით.";

    const emptyMessage =
        mode === "status"
            ? "მარაგში სახეობები ჯერ არ არის."
            : mode === "value"
                ? "რეალიზებადი მარაგის ღირებულება ნულია."
                : "რეალიზებადი მარაგი ჯერ არ არის.";

    return (
        <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex items-center gap-2">
                <Icon
                    icon="solar:pie-chart-2-linear"
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 text-accent"
                />

                <h2 className="text-lg font-semibold text-text-primary">
                    მარაგის განაწილება
                </h2>
            </div>

            <label
                htmlFor={selectId}
                className="sr-only"
            >
                დიაგრამის რეჟიმი
            </label>

            <select
                id={selectId}
                value={mode}
                onChange={(event) =>
                    setMode(event.target.value as Mode)
                }
                className="mt-4 block h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary outline-none focus:border-accent lg:text-sm"
            >
                <option value="categories">
                    კატეგორიების მიხედვით
                </option>
                <option value="status">
                    მარაგის მდგომარეობა
                </option>
                <option value="value">
                    მარაგის ღირებულება
                </option>
            </select>

            <div
                key={mode}
                className="inventory-chart-enter"
                aria-live="polite"
                aria-atomic="true"
            >
                <div className="relative mx-auto mt-5 aspect-square w-full max-w-[220px]">
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

                        {slices
                            .filter((slice) => slice.value > ZERO)
                            .map((slice) => (
                                <circle
                                    key={slice.id}
                                    cx="50"
                                    cy="50"
                                    r="40"
                                    fill="none"
                                    stroke={slice.color}
                                    strokeWidth="12"
                                    pathLength="100"
                                    strokeDasharray={`${slice.percentage} ${100 - slice.percentage}`}
                                    strokeDashoffset={-slice.offset}
                                    transform="rotate(-90 50 50)"
                                />
                            ))}
                    </svg>

                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="w-[62%] text-center">
                            <p
                                className={[
                                    "break-words font-semibold tabular-nums text-text-primary",
                                    mode === "value"
                                        ? "text-base"
                                        : "text-2xl",
                                ].join(" ")}
                            >
                                {mode === "value"
                                    ? formatMoney(total)
                                    : formatQuantity(total)}
                            </p>

                            <p className="mt-1 text-xs text-text-secondary">
                                {unit}
                            </p>
                        </div>
                    </div>
                </div>

                {total === ZERO ? (
                    <p className="mt-4 text-center text-sm text-text-secondary">
                        {emptyMessage}
                    </p>
                ) : (
                    <ul className="mt-5 space-y-3">
                        {slices.map((slice) => (
                            <li
                                key={slice.id}
                                className="flex min-w-0 items-start gap-2"
                            >
                                <span
                                    aria-hidden="true"
                                    style={{ backgroundColor: slice.color }}
                                    className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                                />

                                <span className="min-w-0 flex-1 break-words text-sm text-text-secondary">
                                    {slice.label}
                                </span>

                                <div className="shrink-0 text-right tabular-nums">
                                    <p className="text-xs font-semibold text-text-primary">
                                        {mode === "value"
                                            ? formatMoney(slice.value)
                                            : formatQuantity(slice.value)}
                                    </p>

                                    <p className="mt-0.5 text-xs text-text-secondary">
                                        {slice.percentage.toFixed(1)}%
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-text-secondary">
                    {explanation}
                </p>
            </div>
        </section>
    );
}