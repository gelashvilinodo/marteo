"use client";

import type { ReactNode } from "react";
import type { OrdersPeriod } from "@/lib/orders/orders-period";
import RoutePeriodFilter from "@/components/dashboard/shared/RoutePeriodFilter";

export default function AnalyticsPeriodForm({
    period,
    from,
    to,
    action,
    titleAction,
}: {
    period: OrdersPeriod;
    from: string;
    to: string;
    action?: ReactNode;
    titleAction?: ReactNode;
}) {
    return (
        <RoutePeriodFilter
            route="/dashboard/analytics"
            title="ანალიტიკა"
            period={period}
            from={from}
            to={to}
            action={action}
            titleAction={titleAction}
        />
    );
}