"use client";

import {
    useEffect,
    useId,
    useState,
    type FormEvent,
    type ReactNode,
} from "react";

import type { OrdersPeriod } from "@/lib/orders/orders-period";
import DateTimeField from "./DateTimeField";

export type PeriodOption<T extends string> = {
    value: T;
    label: string;
};

export type PeriodValues<T extends string> = {
    period: T;
    from: string;
    to: string;
};

export const standardPeriodOptions: readonly PeriodOption<OrdersPeriod>[] = [
    { value: "day", label: "ერთი დღე" },
    { value: "three-days", label: "სამი დღე" },
    { value: "week", label: "ერთი კვირა" },
    { value: "two-weeks", label: "ორი კვირა" },
    { value: "month", label: "ერთი თვე" },
    { value: "custom", label: "სხვა პერიოდი" },
];

export default function PeriodFilter<T extends string>({
    value,
    from,
    to,
    options,
    pending = false,
    action,
    heading,
    onChange,
}: {
    value: T;
    from: string;
    to: string;
    options: readonly PeriodOption<T>[];
    pending?: boolean;
    action?: ReactNode;
    heading?: ReactNode;
    onChange: (values: PeriodValues<T>) => void;
}) {
    const selectId = useId();

    const [selection, setSelection] = useState(value);
    const [start, setStart] = useState(from);
    const [end, setEnd] = useState(to);
    const [error, setError] = useState("");

    useEffect(() => {
        setSelection(value);
        setStart(from);
        setEnd(to);
        setError("");
    }, [value, from, to]);

    function choose(next: string) {
        const option = options.find(item => item.value === next);
        if (!option) return;

        setSelection(option.value);
        setError("");

        if (option.value !== "custom") {
            onChange({
                period: option.value,
                from: "",
                to: "",
            });
        }
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!start || !end || start > end) {
            setError(
                "დაწყების თარიღი დასრულების თარიღზე გვიანი არ უნდა იყოს.",
            );
            return;
        }

        setError("");

        onChange({
            period: selection,
            from: start,
            to: end,
        });
    }

    return (
        <div className="@container w-full min-w-0 max-w-full">
            <div className="flex min-w-0 flex-col gap-3 @min-[32rem]:flex-row @min-[32rem]:flex-wrap @min-[32rem]:items-start @min-[32rem]:justify-end">
                {heading && (
                    <div className="order-0 w-full min-w-0 @min-[48rem]:w-auto @min-[48rem]:flex-1">
                        {heading}
                    </div>
                )}
                {action && (
                    <div className="order-1 w-full min-w-0 @min-[32rem]:order-2 @min-[32rem]:w-auto [&_button]:w-full">
                        {action}
                    </div>
                )}

                <div className="relative order-2 w-full min-w-0 @min-[32rem]:order-1 @min-[32rem]:w-56 @min-[32rem]:shrink-0">
                    <label htmlFor={selectId} className="sr-only">
                        პერიოდის არჩევა
                    </label>

                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-3.5 text-text-secondary"
                    >
                        <rect x="3" y="5" width="18" height="16" rx="2" />
                        <path d="M16 3v4M8 3v4M3 11h18" />
                    </svg>

                    <select
                        id={selectId}
                        value={selection}
                        disabled={pending}
                        onChange={event => choose(event.target.value)}
                        className="block h-11 w-full min-w-0 max-w-full appearance-none rounded-xl border border-border bg-background pl-10 pr-10 text-[16px] text-text-primary outline-none focus:border-accent disabled:opacity-60"
                    >
                        {options.map(option => (
                            <option
                                key={option.value}
                                value={option.value}
                            >
                                {option.label}
                            </option>
                        ))}
                    </select>

                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        className="pointer-events-none absolute right-3 top-3.5 text-text-secondary"
                    >
                        <path d="m6 9 6 6 6-6" />
                    </svg>
                </div>
            </div>

            <div
                inert={selection !== "custom"}
                aria-hidden={selection !== "custom"}
                className={`grid min-w-0 transition-[grid-template-rows,opacity,margin-top] duration-300 ease-in-out motion-reduce:transition-none ${selection === "custom"
                        ? "mt-3 grid-rows-[1fr] opacity-100"
                        : "mt-0 grid-rows-[0fr] opacity-0"
                    }`}
            >
                <div className="min-h-0 min-w-0 overflow-hidden">
                    <form
                        onSubmit={submit}
                        className="grid min-w-0 max-w-full grid-cols-1 gap-3 rounded-2xl border border-border bg-surface p-3 @min-[32rem]:grid-cols-2 @min-[48rem]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] @min-[48rem]:items-end"
                    >
                        <label className="block min-w-0">
                            <span className="mb-1.5 block text-sm text-text-secondary">
                                თარიღიდან
                            </span>

                            <DateTimeField
                                type="date"
                                name="from"
                                required
                                value={start}
                                disabled={pending}
                                onChange={event => {
                                    setStart(event.target.value);
                                    setError("");
                                }}
                            />
                        </label>

                        <label className="block min-w-0">
                            <span className="mb-1.5 block text-sm text-text-secondary">
                                თარიღამდე
                            </span>

                            <DateTimeField
                                type="date"
                                name="to"
                                required
                                value={end}
                                disabled={pending}
                                onChange={event => {
                                    setEnd(event.target.value);
                                    setError("");
                                }}
                            />
                        </label>

                        <button
                            type="submit"
                            disabled={pending}
                            className="inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60 @min-[32rem]:col-span-2 @min-[48rem]:col-span-1"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className="shrink-0"
                            >
                                <circle cx="12" cy="12" r="9" />
                                <path d="m8 12 3 3 5-6" />
                            </svg>

                            {pending ? "იტვირთება…" : "პერიოდის არჩევა"}
                        </button>

                        {error && (
                            <p
                                role="alert"
                                className="text-xs leading-relaxed text-danger @min-[32rem]:col-span-2 @min-[48rem]:col-span-3"
                            >
                                {error}
                            </p>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}