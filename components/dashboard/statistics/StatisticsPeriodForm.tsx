"use client";

import type { OrdersPeriod } from "@/lib/orders/orders-period";
import RoutePeriodFilter from "@/components/dashboard/shared/RoutePeriodFilter";

export default function StatisticsPeriodForm({
    period,
    from,
    to,
}: {
    period: OrdersPeriod;
    from: string;
    to: string;
}) {
    return (
        <RoutePeriodFilter
            route="/dashboard/statistics"
            title="სტატისტიკა"
            period={period}
            from={from}
            to={to}
        />
    );
}