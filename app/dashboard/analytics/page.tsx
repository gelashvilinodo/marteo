import { redirect } from "next/navigation";
import { Icon } from "@iconify/react";

import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import {
    getAnalyticsPage,
    type AnalyticsSearchParams,
} from "@/lib/analytics/get-analytics-page";
import AnalyticsPeriodForm from "@/components/dashboard/analytics/AnalyticsPeriodForm";
import { Prisma } from "@/generated/prisma/client";
import { getFinancialMovements } from "@/lib/analytics/get-financial-movements";
import FinancialMovements from "@/components/dashboard/analytics/FinancialMovements";
import FinancialTrend from "@/components/dashboard/analytics/FinancialTrend";
import ExpenseBreakdown from "@/components/dashboard/analytics/ExpenseBreakdown";
import { getExpenseBreakdown } from "@/lib/analytics/get-expense-breakdown";
import { getCurrentBalances } from "@/lib/analytics/get-current-balances";
import { getFinancialTrend } from "@/lib/analytics/get-financial-trend";
import NewExpenseButton from "@/components/dashboard/analytics/NewExpenseButton";

function displayDate(value: string) {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
}

export default async function AnalyticsPage({
    searchParams,
}: {
    searchParams: Promise<AnalyticsSearchParams>;
}) {
    const user = await getCurrentUser();

    if (!user) redirect("/login");

    const membership = await getCurrentBusiness();

    if (!membership) redirect("/business/onboarding");

    const prisma = createPrismaClient();

    const params = await searchParams;

    const { data, movements, trend, expenseBreakdown } =
        await (async () => {
            try {
                return await prisma.$transaction(
                    async tx => {
                        const data = await getAnalyticsPage(
                            tx,
                            membership.businessId,
                            params,
                        );

                        const movements = await getFinancialMovements(
                            tx,
                            membership.businessId,
                            data.from,
                            data.to,
                            params,
                        );

                        const balances = await getCurrentBalances(
                            tx,
                            membership.businessId,
                        );

                        const trend = await getFinancialTrend(
                            tx,
                            membership.businessId,
                        );

                        const expenseBreakdown = await getExpenseBreakdown(
                            tx,
                            membership.businessId,
                            data.from,
                            data.to,
                        );

                        return {
                            data: {
                                ...data,
                                ...balances,
                            },
                            movements,
                            trend,
                            expenseBreakdown,
                        };
                    },
                    {
                        isolationLevel:
                            Prisma.TransactionIsolationLevel.RepeatableRead,
                        maxWait: 10000,
                        timeout: 15000,
                    },
                );
            } finally {
                await prisma.$disconnect();
            }
        })();

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
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_auto]">
                        <h1 className="col-span-2 row-start-1 text-2xl font-semibold text-text-primary lg:col-span-1 lg:col-start-1">
                            ანალიტიკა
                        </h1>

                        <AnalyticsPeriodForm
                            key={`${data.period}-${data.from}-${data.to}`}
                            period={data.period}
                            from={data.from}
                            to={data.to}
                        />

                        <div className="col-start-2 row-start-2 lg:col-start-3 lg:row-start-1">
                            <NewExpenseButton
                                businessId={membership.businessId}
                            />
                        </div>
                    </div>

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

                <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
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
                        key={trend[0]?.date}
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

                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                    <section className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                            <Icon
                                icon="solar:wallet-money-linear"
                                className="h-5 w-5 text-accent"
                            />
                            გადახდები
                        </h2>

                        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                            {[
                                ["მიღებული თანხა", data.received],
                                ["კლიენტებისთვის დაბრუნებული", data.refunded],
                                ["მიღებული მინუს დაბრუნებული", data.netReceived],
                            ].map(([label, value]) => (
                                <div
                                    key={label}
                                    className="min-w-0 rounded-xl border border-border bg-background p-4"
                                >
                                    <dt className="text-xs text-text-secondary">
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
                    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
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

                        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="min-w-0 rounded-xl border border-border bg-background p-4">
                                <dt className="flex items-center gap-2 text-sm text-text-secondary">
                                    <Icon
                                        icon="solar:download-minimalistic-linear"
                                        className="h-5 w-5 shrink-0 text-success"
                                    />
                                    კლიენტებისგან მისაღები
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
                                <dt className="flex items-center gap-2 text-sm text-text-secondary">
                                    <Icon
                                        icon="solar:upload-minimalistic-linear"
                                        className="h-5 w-5 shrink-0 text-warning"
                                    />
                                    კლიენტებისთვის დასაბრუნებელი
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

                <FinancialMovements data={movements} />

                <p className="text-xs text-text-secondary">
                    მოგება ეფუძნება აღრიცხულ მონაცემებს. დაუმატებელი ხარჯები
                    გამოთვლაში ვერ მოხვდება. მარაგის შესყიდვის სრული ღირებულება
                    თვითღირებულებასთან ერთად მეორედ არ გამოიქვითება.
                </p>
            </div>
        </main>
    );
}