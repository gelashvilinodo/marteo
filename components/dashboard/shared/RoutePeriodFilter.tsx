"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { OrdersPeriod } from "@/lib/orders/orders-period";

import PeriodFilter, {
    standardPeriodOptions,
} from "./PeriodFilter";

export default function RoutePeriodFilter({
    route,
    title,
    period,
    from,
    to,
    action,
}: {
    route: "/dashboard/analytics" | "/dashboard/statistics";
    title: string;
    period: OrdersPeriod;
    from: string;
    to: string;
    action?: ReactNode;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [pending, startTransition] = useTransition();

    return (
        <PeriodFilter
            heading={
                <h1 className="text-2xl font-semibold text-text-primary">
                    {title}
                </h1>
            }
            action={action}
            value={period}
            from={from}
            to={to}
            options={standardPeriodOptions}
            pending={pending}
            onChange={values => {
                const params = new URLSearchParams(
                    searchParams.toString(),
                );

                params.set("period", values.period);
                params.delete("page");
                params.delete("from");
                params.delete("to");

                if (values.period === "custom") {
                    params.set("from", values.from);
                    params.set("to", values.to);
                }

                startTransition(() => {
                    router.push(`${route}?${params}`, {
                        scroll: false,
                    });
                });
            }}
        />
    );
}