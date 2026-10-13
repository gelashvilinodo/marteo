"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Form from "next/form";
import { Icon } from "@iconify/react";
import type { OrdersPeriod } from "@/lib/orders/orders-period";

function ShowButton({ disabled }: { disabled: boolean }) {
    const { pending } = useFormStatus();

    return (
        <button
            type="submit"
            disabled={disabled || pending}
            aria-busy={pending}
            className="col-span-2 inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white disabled:opacity-60 lg:col-span-1"
        >
            {pending && (
                <Icon
                    icon="solar:refresh-linear"
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                />
            )}

            <span role="status">
                {pending ? "იტვირთება…" : "ჩვენება"}
            </span>
        </button>
    );
}

export default function StatisticsPeriodForm({
    period,
    from,
    to,
}: {
    period: OrdersPeriod;
    from: string;
    to: string;
}) {
    const router = useRouter();
    const [selection, setSelection] = useState(period);
    const [pending, startTransition] = useTransition();

    function choose(value: OrdersPeriod) {
        setSelection(value);

        if (value === "custom") return;

        const params = new URLSearchParams();
        params.set("period", value);

        startTransition(() => {
            router.push(
                `/dashboard/statistics?${params.toString()}`,
                { scroll: false },
            );
        });
    }

    const field =
        "h-11 w-full min-w-0 rounded-xl border border-border " +
        "bg-background px-3 text-[16px] text-text-primary " +
        "outline-none focus:border-accent";

    return (
        <Form action="/dashboard/statistics" className="contents">
            <label className="relative col-start-2 row-start-1 min-w-0">
                <span className="sr-only">პერიოდი</span>

                <Icon
                    icon="solar:calendar-linear"
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary"
                />

                <select
                    name="period"
                    value={selection}
                    disabled={pending}
                    onChange={event =>
                        choose(event.target.value as OrdersPeriod)
                    }
                    className={`${field} pl-10`}
                >
                    <option value="day">ერთი დღე</option>
                    <option value="three-days">სამი დღე</option>
                    <option value="week">ერთი კვირა</option>
                    <option value="two-weeks">ორი კვირა</option>
                    <option value="month">ერთი თვე</option>
                    <option value="custom">სხვა პერიოდი</option>
                </select>
            </label>

            {selection === "custom" && (
                <div className="col-span-2 grid min-w-0 grid-cols-2 items-end gap-3 rounded-2xl border border-border bg-surface p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
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

                    <ShowButton disabled={pending} />
                </div>
            )}

            {pending && (
                <span
                    role="status"
                    className="col-span-2 flex items-center gap-2 text-xs text-text-secondary"
                >
                    <Icon
                        icon="solar:refresh-linear"
                        className="h-4 w-4 animate-spin"
                    />
                    სტატისტიკა იტვირთება…
                </span>
            )}
        </Form>
    );
}