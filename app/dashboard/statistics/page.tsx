import { redirect } from "next/navigation";
import { Icon } from "@iconify/react";
import { Prisma } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import {
    getStatisticsSummary,
    type StatisticsSearchParams,
} from "@/lib/statistics/get-statistics-summary";
import { getStatisticsRankings } from "@/lib/statistics/get-statistics-rankings";
import StatisticsPeriodForm from "@/components/dashboard/statistics/StatisticsPeriodForm";
import { getStatisticsCharts } from "@/lib/statistics/get-statistics-charts";
import StatisticsCharts from "@/components/dashboard/statistics/StatisticsCharts";

function date(value: string) {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.${year}`;
}

export default async function StatisticsPage({
    searchParams,
}: {
    searchParams: Promise<StatisticsSearchParams>;
}) {
    if (!(await getCurrentUser())) redirect("/login");

    const membership = await getCurrentBusiness();

    if (!membership) redirect("/business/onboarding");

    const params = await searchParams;
    const prisma = createPrismaClient();

    const { summary, rankings, charts } = await (async () => {
        try {
            return await prisma.$transaction(
                async tx => {
                    const summary = await getStatisticsSummary(
                        tx,
                        membership.businessId,
                        params,
                    );

                    const rankings = await getStatisticsRankings(
                        tx,
                        membership.businessId,
                        summary.from,
                        summary.to,
                    );

                    const charts = await getStatisticsCharts(
                        tx,
                        membership.businessId,
                        summary.from,
                        summary.to,
                    );

                    return { summary, rankings, charts };
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
            title: "დასრულებული შეკვეთები",
            value: summary.completedOrders,
            icon: "solar:box-linear",
            tone: "bg-accent/10 text-accent",
            description:
                summary.completionRate === null
                    ? "ამ პერიოდში შექმნილი შეკვეთები არ არის"
                    : `ამ პერიოდში შექმნილთა ${summary.completionRate}% დასრულდა`,
        },
        {
            title: "გაყიდული ერთეულები",
            value: summary.soldUnits,
            icon: "solar:cart-large-2-linear",
            tone: "bg-success/10 text-success",
            description: "დაბრუნებებისა და შესწორებების გათვალისწინებით",
        },
        {
            title: "ახალი მომხმარებლები",
            value: summary.newCustomers,
            icon: "solar:user-plus-linear",
            tone: "bg-violet-400/10 text-violet-400",
            description: "პირველი დასრულებული შეკვეთა ამ პერიოდში",
        },
        {
            title: "განმეორებითი მომხმარებლები",
            value: summary.returningCustomers,
            icon: "solar:refresh-linear",
            tone: "bg-warning/10 text-warning",
            description: "ამ პერიოდშიც და მანამდეც ჰქონდათ შეკვეთა",
        },
    ];

    const maxProduct = Math.max(
        1,
        ...rankings.products.map(product => product.quantity),
    );

    const maxCustomer = Math.max(
        1,
        ...rankings.customers.map(customer => customer.orders),
    );

    const panel =
        "min-w-0 rounded-2xl border border-border bg-surface p-4";

    return (
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">
            <div className="mx-auto min-w-0 max-w-7xl space-y-5">
                <div className="space-y-3">
                    <StatisticsPeriodForm
                        key={`${summary.period}-${summary.from}-${summary.to}`}
                        period={summary.period}
                        from={summary.from}
                        to={summary.to}
                    />

                    <p className="text-xs text-text-secondary">
                        {date(summary.from)} — {date(summary.to)}
                    </p>

                    {summary.periodError && (
                        <p role="alert" className="text-sm text-warning">
                            {summary.periodError}
                        </p>
                    )}
                </div>

                <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
                    {cards.map(card => (
                        <section key={card.title} className={panel}>
                            <div className="flex items-start gap-3">
                                <span
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tone}`}
                                >
                                    <Icon
                                        icon={card.icon}
                                        className="h-6 w-6"
                                    />
                                </span>

                                <div className="min-w-0">
                                    <h2 className="text-xs text-text-secondary sm:text-sm">
                                        {card.title}
                                    </h2>
                                    <p className="mt-2 text-2xl font-semibold tabular-nums text-text-primary">
                                        {card.value}
                                    </p>
                                </div>
                            </div>

                            <p className="mt-3 text-xs text-text-secondary">
                                {card.description}
                            </p>
                        </section>
                    ))}
                </div>

                <StatisticsCharts
                    key={`${summary.from}-${summary.to}`}
                    data={charts}
                    from={summary.from}
                    to={summary.to}
                />

                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                    <section className={panel}>
                        <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                            <Icon
                                icon="solar:box-linear"
                                className="h-5 w-5 shrink-0 text-accent"
                            />
                            ყველაზე გაყიდვადი პროდუქტები
                        </h2>

                        <div className="mt-4 space-y-4">
                            {rankings.products.map((product, index) => (
                                <div
                                    key={product.key}
                                    className="flex min-w-0 items-center gap-3"
                                >
                                    <span className="w-4 shrink-0 text-xs tabular-nums text-text-secondary">
                                        {index + 1}
                                    </span>

                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                                        {product.imageUrl ? (
                                            <img
                                                src={product.imageUrl}
                                                alt=""
                                                loading="lazy"
                                                decoding="async"
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <Icon
                                                icon="solar:box-linear"
                                                className="h-5 w-5 text-accent"
                                            />
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="break-words text-sm font-medium text-text-primary">
                                            {product.name}
                                        </p>

                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent/10">
                                            <div
                                                style={{
                                                    width: `${(product.quantity /
                                                        maxProduct) *
                                                        100
                                                        }%`,
                                                }}
                                                className="h-full rounded-full bg-accent"
                                            />
                                        </div>
                                    </div>

                                    <p className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-text-primary sm:text-sm">
                                        {product.quantity} ცალი
                                    </p>
                                </div>
                            ))}

                            {rankings.products.length === 0 && (
                                <p className="py-6 text-center text-sm text-text-secondary">
                                    ამ პერიოდში გაყიდული პროდუქტები არ არის.
                                </p>
                            )}
                        </div>
                    </section>

                    <section className={panel}>
                        <h2 className="flex items-center gap-2 font-semibold text-text-primary">
                            <Icon
                                icon="solar:users-group-rounded-linear"
                                className="h-5 w-5 shrink-0 text-accent"
                            />
                            ყველაზე ხშირი მომხმარებლები
                        </h2>

                        <div className="mt-4 space-y-4">
                            {rankings.customers.map((customer, index) => {
                                const name = [
                                    customer.firstName,
                                    customer.lastName,
                                ]
                                    .filter(Boolean)
                                    .join(" ");

                                const initials =
                                    [
                                        customer.firstName?.trim().slice(0, 1),
                                        customer.lastName?.trim().slice(0, 1),
                                    ]
                                        .filter(Boolean)
                                        .join("") || "მ";

                                return (
                                    <div
                                        key={customer.id}
                                        className="flex min-w-0 items-center gap-3"
                                    >
                                        <span className="w-4 shrink-0 text-xs tabular-nums text-text-secondary">
                                            {index + 1}
                                        </span>

                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                                            {initials}
                                        </span>

                                        <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-medium text-text-primary">
                                                {name || customer.phone}
                                            </p>

                                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent/10">
                                                <div
                                                    style={{
                                                        width: `${(customer.orders /
                                                            maxCustomer) *
                                                            100
                                                            }%`,
                                                    }}
                                                    className="h-full rounded-full bg-accent"
                                                />
                                            </div>
                                        </div>

                                        <p className="shrink-0 text-right text-xs font-semibold tabular-nums text-text-primary sm:text-sm">
                                            {customer.orders}
                                            <span className="ml-1 font-normal text-text-secondary">
                                                შეკვეთა
                                            </span>
                                        </p>
                                    </div>
                                );
                            })}

                            {rankings.customers.length === 0 && (
                                <p className="py-6 text-center text-sm text-text-secondary">
                                    ამ პერიოდში დასრულებული შეკვეთების მქონე
                                    მომხმარებლები არ არის.
                                </p>
                            )}
                        </div>
                    </section>
                </div>

                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    {[
                        {
                            title: "მიღებული დაბრუნებები",
                            value: `${summary.returnedUnits} ერთეული`,
                            icon: "solar:refresh-linear",
                            tone: "text-success",
                        },
                        {
                            title: "დაწყებული გადაცვლები",
                            value: `${summary.exchanges} გადაცვლა`,
                            icon: "solar:transfer-horizontal-linear",
                            tone: "text-warning",
                        },
                    ].map(card => (
                        <section
                            key={card.title}
                            className={`${panel} flex items-center gap-3`}
                        >
                            <Icon
                                icon={card.icon}
                                className={`h-8 w-8 shrink-0 ${card.tone}`}
                            />
                            <div>
                                <h2 className="text-sm text-text-secondary">
                                    {card.title}
                                </h2>
                                <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">
                                    {card.value}
                                </p>
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </main>
    );
}