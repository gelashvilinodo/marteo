"use client";

import type { FormEvent } from "react";
import type { OrdersPeriod } from "@/lib/orders/orders-period";

export default function HomePeriodForm({
    value,
    onChange,
}: {
    value: OrdersPeriod;
    onChange: (period: OrdersPeriod) => void;
}) {
    return (
        <label className="relative block w-full min-w-0 sm:w-52">
            <span className="sr-only">
                მთავარი გვერდის პერიოდი
            </span>

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
                value={value}
                onChange={event => {
                    onChange(event.target.value as OrdersPeriod);
                }}
                className="h-11 w-full min-w-0 rounded-xl border border-border bg-background pl-10 pr-3 text-[16px] text-text-primary outline-none focus:border-accent"
            >
                <option value="day">ერთი დღე</option>
                <option value="three-days">სამი დღე</option>
                <option value="week">ერთი კვირა</option>
                <option value="two-weeks">ორი კვირა</option>
                <option value="month">ერთი თვე</option>
                <option value="custom">სხვა პერიოდი</option>
            </select>
        </label>
    );
}

export function HomeCustomPeriodForm({
    from,
    to,
    pending,
    onApply,
}: {
    from: string;
    to: string;
    pending: boolean;
    onApply: (from: string, to: string) => void;
}) {
    const field =
        "native-date-time-field h-11 w-full min-w-0 rounded-xl " +
        "border border-border bg-background px-3 text-[16px] " +
        "text-text-primary outline-none focus:border-accent";

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const form = event.currentTarget;
        const values = new FormData(form);
        const fromValue = String(values.get("from") ?? "");
        const toValue = String(values.get("to") ?? "");
        const toInput = form.elements.namedItem("to") as HTMLInputElement;

        if (fromValue > toValue) {
            toInput.setCustomValidity(
                "ბოლო თარიღი საწყისზე ადრე არ უნდა იყოს.",
            );
            toInput.reportValidity();
            return;
        }

        toInput.setCustomValidity("");
        onApply(fromValue, toValue);
    }

    return (
        <form
            onSubmit={submit}
            onInput={event => {
                const input = event.currentTarget.elements.namedItem(
                    "to",
                ) as HTMLInputElement;

                input.setCustomValidity("");
            }}
            className="grid min-w-0 grid-cols-1 items-end gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
            <label className="block min-w-0">
                <span className="mb-1.5 block text-sm text-text-secondary">
                    თარიღიდან
                </span>

                <input
                    type="date"
                    name="from"
                    required
                    defaultValue={from}
                    className={field}
                />
            </label>

            <label className="block min-w-0">
                <span className="mb-1.5 block text-sm text-text-secondary">
                    თარიღამდე
                </span>

                <input
                    type="date"
                    name="to"
                    required
                    defaultValue={to}
                    className={field}
                />
            </label>

            <button
                type="submit"
                disabled={pending}
                className="h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
                ჩვენება
            </button>
        </form>
    );
}