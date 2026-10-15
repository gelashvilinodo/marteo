"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Form from "next/form";
import { Icon } from "@iconify/react";
import type { OrdersPeriod } from "@/lib/orders/orders-period";

export default function AnalyticsPeriodForm({
    period,
    from,
    to,
}: {
    period: OrdersPeriod;
    from: string;
    to: string;
}) {
    const [selection, setSelection] = useState(period);

    const router = useRouter();
    const searchParams = useSearchParams();
    const [pending, startTransition] = useTransition();

    function choosePeriod(value: OrdersPeriod) {
        setSelection(value);

        if (value === "custom") return;

        const params = new URLSearchParams(
            searchParams.toString(),
        );

        params.set("period", value);
        params.delete("from");
        params.delete("to");
        params.delete("page");

        startTransition(() => {
            router.push(
                `/dashboard/analytics?${params.toString()}`,
                { scroll: false },
            );
        });
    }

    const field =
        "h-11 w-full min-w-0 rounded-xl border border-border " +
        "bg-background px-3 text-[16px] text-text-primary " +
        "outline-none focus:border-accent";

    return (
        <Form
            action="/dashboard/analytics"
            className="contents"
        >
            <label className="relative col-start-1 row-start-2 min-w-0 lg:col-start-2 lg:row-start-1">
                <span className="sr-only">
                    პერიოდი
                </span>

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
                        choosePeriod(
                            event.target.value as OrdersPeriod,
                        )
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
                <div className="col-span-2 row-start-3 grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:col-span-3 lg:row-start-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:rounded-2xl lg:border lg:border-border lg:bg-surface lg:p-4">
                    <label className="block min-w-0">
                        <span className="mb-1.5 block text-sm text-text-secondary">
                            თარიღიდან
                        </span>

                        <input
                            type="date"
                            name="from"
                            required
                            defaultValue={from}
                            className={`${field} native-date-time-field`}
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
                            className={`${field} native-date-time-field`}
                        />
                    </label>

                    <button
                        type="submit"
                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white sm:col-span-2 lg:col-span-1 lg:w-auto"
                    >
                        ჩვენება
                    </button>
                </div>
            )}

            {pending && (
                <span
                    role="status"
                    className="col-span-2 inline-flex items-center gap-2 text-xs text-text-secondary lg:col-span-3"
                >
                    <Icon
                        icon="svg-spinners:180-ring"
                        className="h-4 w-4"
                    />
                    იტვირთება…
                </span>
            )}
        </Form>
    );
}