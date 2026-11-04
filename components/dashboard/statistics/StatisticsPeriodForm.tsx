"use client";

import type { OrdersPeriod } from "@/lib/orders/orders-period";
import RoutePeriodFilter from "@/components/dashboard/shared/RoutePeriodFilter";
import GuidedTour from "@/components/tour/GuidedTour";
import TourHelpButton from "@/components/tour/TourHelpButton";
import { useTour } from "@/components/tour/useTour";
import { statisticsTourSteps } from "./statistics-tour";

// სტატისტიკის გვერდი სერვერზე იხატება, ამიტომ ტურს სათაურის კლიენტური ნაწილი მართავს.
export default function StatisticsPeriodForm({
    period,
    from,
    to,
    showTour = false,
}: {
    period: OrdersPeriod;
    from: string;
    to: string;
    showTour?: boolean;
}) {
    const tour = useTour("statistics", showTour);

    return (
        <>
            <GuidedTour steps={statisticsTourSteps} open={tour.open} onClose={tour.close} />
            <RoutePeriodFilter
                route="/dashboard/statistics"
                title="სტატისტიკა"
                titleAction={<TourHelpButton onClick={tour.start} />}
                period={period}
                from={from}
                to={to}
            />
        </>
    );
}
