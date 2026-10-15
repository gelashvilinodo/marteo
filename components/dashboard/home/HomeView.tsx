"use client";

import { useEffect, useState } from "react";

import type { OrdersPeriod } from "@/lib/orders/orders-period";

import HomeHeader from "./HomeHeader";
import HomeWelcome from "./HomeWelcome";
import HomeSummaryCards from "./HomeSummaryCards";
import HomeCharts from "./HomeCharts";
import HomeLists from "./HomeLists";

import HomePeriodForm, {
    HomeCustomPeriodForm,
} from "./HomePeriodForm";

import {
    useHomeData,
    type HomeData,
} from "./useHomeData";

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

    const { summary, lists, trend } = data;
    const [selection, setSelection] = useState(summary.period);

    useEffect(() => {
        setSelection(summary.period);
    }, [summary.period, summary.from, summary.to]);

    function choose(period: OrdersPeriod) {
        setSelection(period);

        if (period !== "custom") {
            changePeriod({
                period,
                from: summary.from,
                to: summary.to,
            });
        }
    }

    return (
        <main className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
            <HomeHeader
                firstName={firstName}
                periodControl={
                    summary.isNewBusiness ? undefined : (
                        <HomePeriodForm
                            value={selection}
                            onChange={choose}
                        />
                    )
                }
            />

            {!summary.isNewBusiness && selection === "custom" && (
                <HomeCustomPeriodForm
                    key={`${summary.from}-${summary.to}`}
                    from={summary.from}
                    to={summary.to}
                    pending={pending}
                    onApply={(from, to) => {
                        changePeriod({
                            period: "custom",
                            from,
                            to,
                        });
                    }}
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
                        />
                    )}

                    {lists && <HomeLists data={lists} />}
                </div>
            )}
        </main>
    );
}