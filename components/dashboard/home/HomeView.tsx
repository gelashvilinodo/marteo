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

export default function HomeView({
    firstName,
    businessId,
    initialData,
}: {
    firstName: string | null;
    businessId: string;
    initialData: HomeData;
}) {
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
            {summary.isNewBusiness ? (
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <HomeHeader firstName={firstName} />

                    <div className="min-w-0 [&>button]:w-full sm:[&>button]:w-auto">
                        <NewOrderButton />
                    </div>
                </div>
            ) : (
                <PeriodFilter
                    heading={<HomeHeader firstName={firstName} />}
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
                            {" — "}
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