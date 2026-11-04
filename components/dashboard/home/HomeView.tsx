"use client";

import HomeHeader from "./HomeHeader";
import HomeWelcome from "./HomeWelcome";
import HomeSummaryCards from "./HomeSummaryCards";
import HomeCharts from "./HomeCharts";
import HomeLists from "./HomeLists";
import PeriodFilter, {
    standardPeriodOptions,
} from "@/components/dashboard/shared/PeriodFilter";

import NewOrderButton from "@/components/dashboard/orders/NewOrderButton";

import {
    useHomeData,
    type HomeData,
} from "./useHomeData";

import ExpenseBreakdown from "@/components/dashboard/analytics/ExpenseBreakdown";
import { useMemo } from "react";
import GuidedTour from "@/components/tour/GuidedTour";
import TourHelpButton from "@/components/tour/TourHelpButton";
import { useTour } from "@/components/tour/useTour";
import { useBusinessAccess } from "@/components/dashboard/business/BusinessAccessContext";
import { useBusinessMode } from "@/components/dashboard/business/BusinessModeContext";
import { homeTourSteps } from "./home-tour";

export default function HomeView({
    firstName,
    businessId,
    initialData,
    showTour = false,
}: {
    firstName: string | null;
    businessId: string;
    initialData: HomeData;
    showTour?: boolean;
}) {
    const tour = useTour("home", showTour);
    const mode = useBusinessMode();
    const { access, canOpen } = useBusinessAccess();
    const tourSteps = useMemo(() => homeTourSteps(mode, canOpen, access.role === "OWNER"), [mode, canOpen, access.role]);
    const heading = (
        <HomeHeader
            firstName={firstName}
            action={<TourHelpButton onClick={tour.start} />}
        />
    );
    const {
        data,
        pending,
        error,
        changePeriod,
        retry,
    } = useHomeData(initialData);

    const { summary, lists, trend, expenses } = data;

    return (
        <main className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
            <GuidedTour steps={tourSteps} open={tour.open} onClose={tour.close} />
            {summary.isNewBusiness ? (
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    {heading}

                    <div className="min-w-0 [&>button]:w-full sm:[&>button]:w-auto">
                        <NewOrderButton />
                    </div>
                </div>
            ) : (
                <PeriodFilter
                    heading={heading}
                    action={<NewOrderButton />}
                    value={summary.period}
                    from={summary.from}
                    to={summary.to}
                    options={standardPeriodOptions}
                    pending={pending}
                    onChange={changePeriod}
                />
            )}

            {error && (
                <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger"
                >
                    <p>{error}</p>

                    <button
                        type="button"
                        disabled={pending}
                        onClick={retry}
                        className="font-semibold underline disabled:opacity-50"
                    >
                        ხელახლა ცდა
                    </button>
                </div>
            )}

            {summary.periodError && (
                <p role="alert" className="text-sm text-danger">
                    {summary.periodError}
                </p>
            )}

            {summary.isNewBusiness ? (
                <HomeWelcome businessId={businessId} />
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-text-secondary">
                            პერიოდი:{" "}
                            {summary.from.split("-").reverse().join(".")}
                            {" - "}
                            {summary.to.split("-").reverse().join(".")}
                        </p>

                        <span
                            role="status"
                            aria-live="polite"
                            className="text-xs text-text-secondary"
                        >
                            {pending ? "განახლება…" : ""}
                        </span>
                    </div>

                    <HomeSummaryCards data={summary} />

                    {trend && (
                        <HomeCharts
                            key={`${summary.from}-${summary.to}`}
                            data={trend}
                            expenseChart={
                                expenses ? (
                                    <ExpenseBreakdown
                                        key={`${expenses.from}-${expenses.to}`}
                                        data={expenses}
                                    />
                                ) : undefined
                            }
                        />
                    )}

                    {lists && <HomeLists data={lists} />}
                </div>
            )}
        </main>
    );
}