"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import type { CustomersPeriod } from "@/lib/customers/customers-period";

type Props = {
    period: CustomersPeriod;
    from: string;
    to: string;
    pending: boolean;
    onChange: (values: {
        period: CustomersPeriod;
        from: string;
        to: string;
    }) => void;
};

const fieldClass =
    "h-11 w-full min-w-0 rounded-xl border border-border " +
    "bg-background px-3 text-[16px] text-text-primary " +
    "outline-none focus:border-accent lg:text-sm";

export default function CustomersPeriodSelect({
    period,
    from,
    to,
    pending,
    onChange,
}: Props) {
    const [selection, setSelection] = useState(period);
    const [error, setError] = useState("");

    return (
        <div className="w-full min-w-0 sm:w-auto">
            <div className="relative sm:min-w-56">
                <Icon
                    icon="solar:calendar-linear"
                    className={
                        "pointer-events-none absolute left-3 top-3 " +
                        "h-5 w-5 text-text-secondary"
                    }
                />

                <select
                    aria-label="სტატისტიკის პერიოდი"
                    value={selection}
                    disabled={pending}
                    className={`${fieldClass} pl-10 disabled:opacity-60`}
                    onChange={(event) => {
                        const value = event.target.value as CustomersPeriod;

                        setSelection(value);
                        setError("");

                        if (value !== "custom") {
                            onChange({
                                period: value,
                                from: "",
                                to: "",
                            });
                        }
                    }}
                >
                    <option value="week">ერთი კვირა</option>
                    <option value="month">ერთი თვე</option>
                    <option value="three-months">სამი თვე</option>
                    <option value="all">სულ</option>
                    <option value="custom">სხვა პერიოდი</option>
                </select>
            </div>

            {selection === "custom" && (
                <form
                    className="mt-3 space-y-2"
                    onSubmit={(event) => {
                        event.preventDefault();

                        const form = new FormData(event.currentTarget);
                        const start = String(form.get("from") ?? "");
                        const end = String(form.get("to") ?? "");

                        if (!start || !end || start > end) {
                            setError(
                                "დაწყების თარიღი დასრულების თარიღზე გვიანი არ უნდა იყოს.",
                            );
                            return;
                        }

                        setError("");

                        onChange({
                            period: "custom",
                            from: start,
                            to: end,
                        });
                    }}
                >
                    <div className="grid grid-cols-2 gap-2">
                        <label className="min-w-0 space-y-1">
                            <span className="text-xs text-text-secondary">
                                დაწყება
                            </span>

                            <input
                                type="date"
                                name="from"
                                required
                                defaultValue={from}
                                disabled={pending}
                                className={fieldClass}
                            />
                        </label>

                        <label className="min-w-0 space-y-1">
                            <span className="text-xs text-text-secondary">
                                დასრულება
                            </span>

                            <input
                                type="date"
                                name="to"
                                required
                                defaultValue={to}
                                disabled={pending}
                                className={fieldClass}
                            />
                        </label>
                    </div>

                    {error && (
                        <p role="alert" className="text-xs text-warning">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={pending}
                        className={
                            "flex h-11 w-full items-center justify-center " +
                            "gap-2 rounded-xl bg-success px-4 " +
                            "text-sm font-semibold text-white " +
                            "disabled:opacity-60"
                        }
                    >
                        <Icon
                            icon={
                                pending
                                    ? "solar:refresh-linear"
                                    : "solar:check-circle-linear"
                            }
                            className={`h-5 w-5 ${pending ? "animate-spin" : ""
                                }`}
                        />

                        პერიოდის არჩევა
                    </button>
                </form>
            )}
        </div>
    );
}