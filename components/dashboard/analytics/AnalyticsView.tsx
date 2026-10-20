"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import type { AnalyticsSnapshot } from "@/lib/analytics/get-analytics-snapshot";
import type { FinancialTrendPeriod } from "@/lib/analytics/get-financial-trend";
import { ANALYTICS_CHANGED } from "@/lib/analytics/refresh-analytics-client";
import AnalyticsPeriodForm from "./AnalyticsPeriodForm";
import FinancialMovements from "./FinancialMovements";
import FinancialTrend from "./FinancialTrend";
import ExpenseBreakdown from "./ExpenseBreakdown";
import NewExpenseButton from "./NewExpenseButton";

function displayDate(value: string) { return value.split("-").reverse().join("."); }

export default function AnalyticsView({ initialSnapshot, businessId }: { initialSnapshot: AnalyticsSnapshot; businessId: string }) {
    const [snapshot, setSnapshot] = useState(initialSnapshot);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const trendPeriod = useRef<FinancialTrendPeriod>("week");
    const [previousSnapshot, setPreviousSnapshot] = useState(initialSnapshot);
    if (previousSnapshot !== initialSnapshot) {
        setPreviousSnapshot(initialSnapshot);
        setSnapshot(initialSnapshot);
        setRefreshing(false);
        setError("");
    }
    useEffect(() => {
        let active = true;
        let request: AbortController | null = null;
        let queued: ReturnType<typeof setTimeout> | null = null;
        function changed(event: Event) {
            event.preventDefault();
            request?.abort();
            if (queued) clearTimeout(queued);
            setRefreshing(true);
            queued = setTimeout(() => {
                queued = null;
                const controller = new AbortController(); request = controller;
                const search = window.location.search;
                const period = trendPeriod.current;
                const params = new URLSearchParams(search); params.set("trendPeriod", period);
                void (async () => {
                    try {
                        const response = await fetch(`/api/analytics/snapshot?${params}`, {
                            cache: "no-store", credentials: "same-origin", signal: controller.signal,
                        });
                        const body = await response.json() as { success?: boolean; data?: AnalyticsSnapshot; message?: string };
                        if (!response.ok || !body.success || !body.data?.data || !Array.isArray(body.data.movements?.rows) || !Array.isArray(body.data.trend) || !body.data.expenseBreakdown || body.data.trendPeriod !== period) {
                            throw new Error(body.message || "ანალიტიკის მონაცემები ვერ განახლდა.");
                        }
                        if (!active || controller.signal.aborted || window.location.search !== search) return;
                        if (trendPeriod.current !== period) {
                            window.dispatchEvent(new Event(ANALYTICS_CHANGED, { cancelable: true }));
                            return;
                        }
                        setSnapshot(body.data);
                        setError("");
                        const next = new URLSearchParams(search);
                        next.set("page", String(body.data.movements.page));
                        next.set("movement", body.data.movements.source);
                        window.history.replaceState(window.history.state, "", `/dashboard/analytics?${next}${window.location.hash}`);
                    } catch (cause) {
                        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "ანალიტიკა ვერ განახლდა.");
                    } finally {
                        if (active && request === controller && !controller.signal.aborted) setRefreshing(false);
                    }
                })();
            }, 0);
        }
        window.addEventListener(ANALYTICS_CHANGED, changed);
        return () => { active = false; request?.abort(); if (queued) clearTimeout(queued); window.removeEventListener(ANALYTICS_CHANGED, changed); };
    }, [initialSnapshot]);
    const { data, movements, trend, expenseBreakdown } = snapshot;

    const cards = [
        {
            title: "გაყიდვები",
            value: data.sales,
            icon: "solar:cart-large-2-linear",
            tone: "bg-accent/10 text-accent",
            description: "აღრიცხული გაყიდვები და მიწოდების საფასური, შესწორებების გათვალისწინებით",
        },
        {
            title: "თვითღირებულება",
            value: data.costOfGoods,
            icon: "solar:box-linear",
            tone: "bg-warning/10 text-warning",
            description: data.incompleteEntries > 0
                ? "ჯამი არასრულია — ზოგი თვითღირებულება დასაზუსტებელია"
                : "გაყიდულ ნივთებზე აღრიცხული თვითღირებულება",
        },
        {
            title: "სხვა ხარჯები",
            value: data.recordedExpenses,
            icon: "solar:bill-list-linear",
            tone: "bg-danger/10 text-danger",
            description: "ცალკე აღრიცხული ხარჯები",
        },
        {
            title: "მოგება",
            value: data.profit,
            icon: "solar:chart-2-linear",
            tone: "bg-success/10 text-success",
            description: data.profitReady
                ? "აღრიცხული გაყიდვები − თვითღირებულება − სხვა ხარჯები"
                : "მონაცემების დაზუსტებამდე არ გამოითვლება",
        },
    ];

    return (
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">
            <div className="mx-auto min-w-0 max-w-7xl space-y-5">
                <div className="space-y-3">
                    <AnalyticsPeriodForm
                        key={`${data.period}-${data.from}-${data.to}`}
                        period={data.period}
                        from={data.from}
                        to={data.to}
                        action={
                            <NewExpenseButton businessId={businessId} />
                        }
                    />

                    <p className="text-xs text-text-secondary">
                        პერიოდი: {displayDate(data.from)} —{" "}
                        {displayDate(data.to)}
                    </p>

                    {data.periodError && (
                        <p role="alert" className="text-sm text-warning">
                            {data.periodError}
                        </p>
                    )}
                </div>

                {refreshing && <p role="status" className="text-sm text-text-secondary">ანალიტიკა ახლდება…</p>}
                {error && <p role="alert" className="text-sm text-danger">{error} <button type="button" className="underline" onClick={() => window.dispatchEvent(new Event(ANALYTICS_CHANGED, { cancelable: true }))}>ხელახლა განახლება</button></p>}
                <div aria-busy={refreshing} className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
                    {cards.map(card => (
                        <section
                            key={card.title}
                            className="min-w-0 rounded-2xl border border-border bg-surface p-3 sm:p-4"
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.tone}`}
                                >
                                    <Icon
                                        icon={card.icon}
                                        className="h-5 w-5"
                                    />
                                </span>

                                <h2 className="text-xs font-medium text-text-secondary sm:text-sm">
                                    {card.title}
                                </h2>
                            </div>

                            <p className="mt-3 break-words text-xl font-semibold tabular-nums text-text-primary sm:text-2xl">
                                {card.value === null ? "დასაზუსტებელია" : `${card.value} ₾`}
                            </p>

                            <p className="mt-2 text-xs text-text-secondary">
                                {card.description}
                            </p>
                        </section>
                    ))}
                </div>

                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                    <FinancialTrend
                        initialPeriod={snapshot.trendPeriod}
                        onPeriodChange={period => { trendPeriod.current = period; }}
                        points={trend}
                        profitReady={trend.every(
                            point => point.profit !== null,
                        )}
                    />

                    <ExpenseBreakdown
                        key={`${data.from}-${data.to}`}
                        data={expenseBreakdown}
                    />
                </div>

                {data.pendingCostOrders > 0 && (
                    <section className="space-y-2 rounded-2xl border border-warning/30 bg-warning/5 p-4">
                        <h2 className="text-sm font-semibold">
                            შეკვეთები თვითღირებულების მოლოდინში
                        </h2>
                        <p className="text-sm text-text-secondary">
                            ბიზნესში {data.pendingCostOrders} იმპორტირებული
                            შეკვეთა დროებით გამორიცხულია ანალიტიკიდან,
                            რადგან პროდუქტების სრული თვითღირებულება
                            მითითებული არ არის.
                        </p>
                        <p className="text-sm text-text-secondary">
                            შეკვეთები შენარჩუნებულია. თვითღირებულების
                            შევსების შემდეგ მათ ანგარიშში ჩართვას შევძლებთ.
                            ეს რაოდენობა მთელ ბიზნესს ეხება და მხოლოდ
                            არჩეული პერიოდით არ შემოიფარგლება.
                        </p>
                    </section>
                )}

                {!data.profitReady && (
                    <section className="rounded-2xl border border-warning/30 bg-warning/5 p-4">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-warning">
                            <Icon
                                icon="solar:info-circle-linear"
                                className="h-5 w-5"
                            />
                            ფინანსური მონაცემები დასაზუსტებელია
                        </h2>

                        {data.incompleteEntries > 0 && (
                            <p className="mt-2 text-sm text-text-secondary">
                                არჩეულ პერიოდში {data.incompleteEntries} ფინანსურ
                                ჩანაწერზე თვითღირებულება სრულად დადასტურებული არ არის.
                            </p>
                        )}

                        {data.unrecordedCompleted > 0 && (
                            <p className="mt-2 text-sm text-text-secondary">
                                ბიზნესში {data.unrecordedCompleted} დასრულებულ
                                შეკვეთას გაყიდვის ფინანსური ჩანაწერი ჯერ არ აქვს.
                                ეს რაოდენობა ყველა პერიოდს მოიცავს.
                            </p>
                        )}

                        <p className="mt-2 text-xs text-text-secondary">
                            ქარდებში აღრიცხული მონაცემებია ნაჩვენები.
                            არასრული შედეგის ზუსტ მოგებად წარმოდგენას
                            მონაცემების დაზუსტებამდე არ ვაკეთებთ.
                        </p>
                    </section>
                )}

                <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
                    <section className="@container min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                            <Icon
                                icon="solar:wallet-money-linear"
                                className="h-5 w-5 text-accent"
                            />
                            გადახდები
                        </h2>

                        <dl className="mt-4 grid min-w-0 gap-3 @[30rem]:grid-cols-3">
                            {[
                                ["მიღებული თანხა", data.received],
                                ["დაბრუნებული თანხა", data.refunded],
                                ["მიღებული − დაბრუნებული", data.netReceived],
                            ].map(([label, value]) => (
                                <div
                                    key={label}
                                    className="min-w-0 rounded-xl border border-border bg-background p-4"
                                >
                                    <dt className="min-w-0 [overflow-wrap:anywhere] text-xs leading-relaxed text-text-secondary">
                                        {label}
                                    </dt>
                                    <dd className="mt-3 break-words text-xl font-semibold tabular-nums text-text-primary sm:text-2xl">
                                        {value} ₾
                                    </dd>
                                </div>
                            ))}
                        </dl>

                        <p className="mt-3 text-xs text-text-secondary">
                            გადახდები მათი აღრიცხვის თარიღით ითვლება.
                            მიღებული თანხა და გაყიდვის მოგება სხვადასხვა მაჩვენებელია.
                        </p>
                    </section>
                    <section className="@container min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                            <Icon
                                icon="solar:bill-list-linear"
                                className="h-5 w-5 text-accent"
                            />
                            მიმდინარე ნაშთები
                        </h2>

                        {/* <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                            ყველა პერიოდის მიმდინარე მდგომარეობა.
                            ზემოთ არჩეული თარიღები ამ თანხებს არ ცვლის.
                        </p> */}

                        <dl className="mt-4 grid min-w-0 gap-3 @[26rem]:grid-cols-2">
                            <div className="min-w-0 rounded-xl border border-border bg-background p-4">
                                <dt className="flex min-w-0 flex-col items-start gap-2 [overflow-wrap:anywhere] text-sm leading-relaxed text-text-secondary">
                                    <Icon
                                        icon="solar:download-minimalistic-linear"
                                        className="h-5 w-5 shrink-0 text-success"
                                    />
                                    მომხმარებლებისგან მისაღები
                                </dt>

                                <dd className="mt-2 break-words text-xl font-semibold tabular-nums text-text-primary sm:text-2xl">
                                    {data.receivable} ₾
                                </dd>

                                <p className="mt-2 text-xs text-text-secondary">
                                    {data.receivableOrders} შეკვეთაზე დარჩენილი
                                    გადასახდელი თანხა
                                </p>
                            </div>

                            <div className="min-w-0 rounded-xl border border-border bg-background p-4">
                                <dt className="flex min-w-0 flex-col items-start gap-2 [overflow-wrap:anywhere] text-sm leading-relaxed text-text-secondary">
                                    <Icon
                                        icon="solar:upload-minimalistic-linear"
                                        className="h-5 w-5 shrink-0 text-warning"
                                    />
                                    მომხმარებლებისთვის დასაბრუნებელი
                                </dt>

                                <dd className="mt-2 break-words text-xl font-semibold tabular-nums text-text-primary sm:text-2xl">
                                    {data.refundable} ₾
                                </dd>

                                <p className="mt-2 text-xs text-text-secondary">
                                    {data.refundableOrders} შეკვეთაზე ზედმეტად
                                    მიღებული თანხა
                                </p>
                            </div>
                        </dl>

                        {/* <p className="mt-3 text-xs leading-relaxed text-text-secondary">
                            დასაბრუნებელი ნაშთი მცირდება თანხის რეალური
                            დაბრუნების დადასტურებით. შეკვეთის წაშლით
                            დამალვა ფინანსურ ნაშთს არ აუქმებს.
                        </p> */}
                    </section>
                </div>

                <FinancialMovements data={movements} externalRefreshing={refreshing} />

                <p className="text-xs text-text-secondary">
                    მოგება ეფუძნება აღრიცხულ მონაცემებს. დაუმატებელი ხარჯები
                    გამოთვლაში ვერ მოხვდება. მარაგის შესყიდვის სრული ღირებულება
                    თვითღირებულებასთან ერთად მეორედ არ გამოიქვითება.
                </p>
            </div>
        </main>
    );
}