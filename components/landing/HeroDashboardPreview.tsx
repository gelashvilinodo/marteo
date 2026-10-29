"use client";

import Image from "next/image";
import { useState } from "react";
import { Icon } from "@iconify/react";

// საჩვენებელი მონაცემები. ზომები em-შია, რომ პანელი სიგანესთან ერთად
// პროპორციულად იზრდებოდეს და პატარავდებოდეს (იხ. .landing-preview).
const days = [
    { date: "18.10", sales: 520, profit: 190 },
    { date: "19.10", sales: 640, profit: 240 },
    { date: "20.10", sales: 480, profit: 170 },
    { date: "21.10", sales: 760, profit: 290 },
    { date: "22.10", sales: 690, profit: 260 },
    { date: "23.10", sales: 830, profit: 320 },
    { date: "24.10", sales: 580, profit: 210 },
    { date: "25.10", sales: 910, profit: 360 },
    { date: "26.10", sales: 740, profit: 280 },
    { date: "27.10", sales: 970, profit: 385 },
];

const totalSales = days.reduce((sum, day) => sum + day.sales, 0);
const totalProfit = days.reduce((sum, day) => sum + day.profit, 0);

const expenses = [
    { label: "პროდუქტების თვითღირებულება", value: 3260, color: "var(--marteo-warning)" },
    { label: "მიწოდება", value: 620, color: "var(--marteo-accent)" },
    { label: "რეკლამა", value: 385, color: "var(--marteo-success)" },
    { label: "სხვა ხარჯები", value: 150, color: "#94a3b8" },
];

const totalExpenses = expenses.reduce((sum, item) => sum + item.value, 0);

const ticks = [1000, 750, 500, 250, 0];

const navigation = [
    { label: "მთავარი", icon: "solar:home-2-bold-duotone", active: true },
    { label: "შეკვეთები", icon: "solar:clipboard-list-bold-duotone" },
    { label: "შესყიდვები", icon: "solar:cart-large-2-bold-duotone" },
    { label: "წარმოება", icon: "solar:structure-bold-duotone" },
    { label: "მომხმარებლები", icon: "solar:users-group-rounded-bold-duotone" },
    { label: "მარაგები", icon: "solar:box-bold-duotone", group: true },
    { label: "ანალიტიკა", icon: "solar:chart-2-bold-duotone" },
    { label: "სტატისტიკა", icon: "solar:graph-up-bold-duotone" },
    { label: "კონტენტ-კალენდარი", icon: "solar:calendar-bold-duotone" },
];

const orders = [
    { number: 148, customer: "ნინო ბერიძე", total: 86, status: "processing" },
    { number: 147, customer: "გიორგი კაპანაძე", total: 142, status: "shipped" },
    { number: 146, customer: "მარიამ ლომიძე", total: 58, status: "completed" },
    { number: 145, customer: "ლუკა ჯავახიშვილი", total: 215, status: "completed" },
    { number: 144, customer: "ანა წერეთელი", total: 74, status: "completed" },
] as const;

const orderStatuses = {
    processing: { label: "მუშავდება", className: "bg-warning/10 text-warning" },
    shipped: { label: "გაგზავნილი", className: "bg-accent/10 text-accent" },
    completed: { label: "დასრულებული", className: "bg-success/10 text-success" },
};

const products = [
    { name: "ხელნაკეთი სანთელი", quantity: 64, revenue: 1920, icon: "solar:fire-bold-duotone" },
    { name: "კერამიკული ფინჯანი", quantity: 38, revenue: 1330, icon: "solar:cup-hot-bold-duotone" },
    { name: "ტყავის საფულე", quantity: 17, revenue: 1105, icon: "solar:wallet-bold-duotone" },
    { name: "ბამბის ჩანთა", quantity: 29, revenue: 870, icon: "solar:bag-4-bold-duotone" },
    { name: "სუნამო 50 მლ", quantity: 9, revenue: 765, icon: "solar:bottle-bold-duotone" },
];

function money(value: number, decimals = false) {
    const [integer, decimal] = value.toFixed(decimals ? 2 : 0).split(".");

    return (
        integer.replace(/\B(?=(\d{3})+(?!\d))/g, " ") +
        (decimal !== undefined ? `.${decimal}` : "") +
        " ₾"
    );
}

export default function HeroDashboardPreview() {
    return (
        <div className="landing-preview-frame @container mx-auto w-[92%] max-w-[26rem] max-lg:flex max-lg:h-full max-lg:items-start sm:max-w-xl lg:w-[calc(100%+max(1rem,(100vw-80rem)/2+1rem))] lg:max-w-none">
            <div
                aria-hidden="true"
                className="landing-preview relative flex w-full overflow-hidden rounded-[1.25em] border border-white/15 bg-background shadow-[0_2em_5em_-1em_rgb(2_8_23/0.7)] ring-[0.4em] ring-white/5 select-none"
            >
                <PreviewSidebar />

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <PreviewHeader />

                    {/* დესკტოპზე პანელს ფიქსირებული სიმაღლე აქვს და შიგთავსი შიგნით სქროლდება, როგორც რეალურ დეშბორდში. */}
                    <div className="relative min-h-0 flex-1">
                        <div className="landing-preview-scroll h-full min-w-0 overflow-hidden lg:overflow-y-auto">
                            <div className="landing-preview-content flex min-w-0 flex-col gap-[1em] p-[1em] pb-[2.5em] @xl:gap-[1.15em] @xl:p-[1.4em]">
                                <PreviewPageHeader />
                                <PreviewSummaryCards />

                                <div className="grid min-w-0 grid-cols-1 gap-[1em] @xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] @xl:gap-[1.15em]">
                                    <PreviewSalesChart />
                                    <PreviewExpenseChart />
                                </div>

                                <PreviewLists />
                            </div>
                        </div>

                        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3em] bg-gradient-to-t from-background to-transparent" />
                    </div>
                </div>
            </div>
        </div>
    );
}

function PreviewSidebar() {
    return (
        <aside className="hidden w-[13.5em] shrink-0 flex-col bg-[#081F46] py-[1.5em] @xl:flex">
            <div className="px-[1.4em]">
                <Image
                    src="/images/logo.svg"
                    alt=""
                    width={200}
                    height={60}
                    className="h-[3.2em] w-auto"
                />
            </div>

            <nav className="mt-[1.6em] flex flex-col gap-[0.3em] pl-[0.75em]">
                {navigation.map(item => (
                    <span
                        key={item.label}
                        className={`flex h-[2.85em] items-center gap-[0.75em] rounded-l-[0.9em] px-[0.85em] text-[0.82em] font-medium whitespace-nowrap ${
                            item.active
                                ? "bg-background text-accent"
                                : "text-slate-300"
                        }`}
                    >
                        <Icon icon={item.icon} className="h-[1.35em] w-[1.35em] shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {item.group && (
                            <Icon
                                icon="solar:alt-arrow-down-linear"
                                className="mr-[0.5em] ml-auto h-[1em] w-[1em] shrink-0"
                            />
                        )}
                    </span>
                ))}
            </nav>
        </aside>
    );
}

function PreviewHeader() {
    return (
        <div className="flex h-[4em] shrink-0 items-center justify-between gap-[1em] border-b border-white/10 bg-gradient-to-r from-[#0B2A55] via-[#0A244B] to-[#081F46] px-[1em] @xl:justify-end @xl:px-[1.4em]">
            <Image
                src="/images/logo.svg"
                alt=""
                width={200}
                height={60}
                className="h-[2.6em] w-auto @xl:hidden"
            />

            <div className="flex items-center gap-[0.9em]">
                <span className="relative text-slate-300">
                    <Icon icon="solar:bell-bing-bold-duotone" className="h-[1.4em] w-[1.4em]" />
                    <span className="absolute -top-[0.1em] right-0 h-[0.45em] w-[0.45em] rounded-full bg-danger ring-[0.15em] ring-[#0A244B]" />
                </span>

                <span className="flex items-center gap-[0.6em] rounded-[0.9em] border border-white/10 bg-white/5 py-[0.35em] pr-[0.7em] pl-[0.35em]">
                    <span className="flex h-[2.2em] w-[2.2em] items-center justify-center rounded-[0.65em] bg-gradient-to-br from-accent to-[#2f5fbf] text-white">
                        <Icon icon="solar:shop-2-bold-duotone" className="h-[1.25em] w-[1.25em]" />
                    </span>

                    <span className="leading-tight">
                        <span className="block text-[0.8em] font-semibold text-white">
                            ჩემი ბიზნესი
                        </span>
                        <span className="block text-[0.68em] text-slate-400">
                            მფლობელი
                        </span>
                    </span>

                    <Icon icon="solar:alt-arrow-down-linear" className="h-[0.9em] w-[0.9em] text-slate-400" />
                </span>
            </div>
        </div>
    );
}

function PreviewPageHeader() {
    return (
        <div className="flex min-w-0 flex-wrap items-end justify-between gap-[1em]">
            <div className="min-w-0">
                <p className="text-[1.35em] font-semibold text-text-primary">
                    მთავარი
                </p>

                <div className="mt-[0.6em] flex items-center gap-[0.6em]">
                    <span className="flex h-[2.3em] w-[2.3em] items-center justify-center rounded-[0.8em] bg-accent/10 text-accent">
                        <Icon icon="solar:sun-2-bold-duotone" className="h-[1.3em] w-[1.3em]" />
                    </span>
                    <p className="text-[0.8em] text-text-secondary">
                        დღე მშვიდობისა,{" "}
                        <span className="font-semibold text-text-primary">გიორგი</span>!
                    </p>
                </div>
            </div>

            <div className="flex shrink-0 items-center gap-[0.7em]">
                <span className="flex h-[2.6em] items-center gap-[0.5em] rounded-[0.8em] border border-border bg-surface px-[0.8em] text-[0.78em] text-text-primary">
                    <Icon icon="solar:calendar-linear" className="h-[1.2em] w-[1.2em] text-text-secondary" />
                    ბოლო 10 დღე
                    <Icon icon="solar:alt-arrow-down-linear" className="ml-[0.4em] h-[1em] w-[1em] text-text-secondary" />
                </span>

                <span className="flex h-[2.6em] items-center gap-[0.45em] rounded-[0.8em] bg-success px-[1em] text-[0.78em] font-semibold text-white">
                    <Icon icon="solar:add-circle-linear" className="h-[1.25em] w-[1.25em]" />
                    ახალი შეკვეთა
                </span>
            </div>
        </div>
    );
}

function PreviewSummaryCards() {
    const cards = [
        {
            title: "სულ გაყიდვები",
            value: money(totalSales),
            icon: "solar:cart-large-2-bold-duotone",
            iconClass: "bg-accent/10 text-accent",
            trend: "+12%",
        },
        {
            title: "სუფთა მოგება",
            value: money(totalProfit),
            icon: "solar:chart-2-bold-duotone",
            iconClass: "bg-success/10 text-success",
            trend: "+8%",
        },
        {
            title: "სულ შეკვეთები",
            value: "148",
            icon: "solar:clipboard-list-bold-duotone",
            iconClass: "bg-accent/10 text-accent",
            trend: "+15%",
        },
        {
            title: "ამჟამად მარაგში",
            value: "612",
            icon: "solar:box-bold-duotone",
            iconClass: "bg-warning/10 text-warning",
        },
    ];

    return (
        <div className="grid min-w-0 grid-cols-2 gap-[0.75em] @xl:grid-cols-4 @xl:gap-[1em]">
            {cards.map(card => (
                <div
                    key={card.title}
                    className="min-w-0 rounded-[1em] border border-border bg-surface p-[0.9em] @xl:p-[1em]"
                >
                    <div className="flex items-center justify-between gap-[0.5em]">
                        <span
                            className={`flex h-[2.3em] w-[2.3em] shrink-0 items-center justify-center rounded-[0.7em] ${card.iconClass}`}
                        >
                            <Icon icon={card.icon} className="h-[1.3em] w-[1.3em]" />
                        </span>

                        {card.trend && (
                            <span className="rounded-full bg-success/10 px-[0.55em] py-[0.15em] text-[0.68em] font-semibold text-success tabular-nums">
                                {card.trend}
                            </span>
                        )}
                    </div>

                    <p className="mt-[0.85em] truncate text-[0.74em] font-medium text-text-secondary">
                        {card.title}
                    </p>

                    <p className="mt-[0.2em] truncate text-[1.25em] font-semibold text-text-primary tabular-nums">
                        {card.value}
                    </p>
                </div>
            ))}
        </div>
    );
}

function PreviewSalesChart() {
    const [selectedIndex, setSelectedIndex] = useState(days.length - 1);
    const selected = days[selectedIndex];

    return (
        <div className="flex min-w-0 flex-col rounded-[1em] border border-border bg-surface p-[1em] @xl:p-[1.15em]">
            <div className="flex flex-wrap items-center justify-between gap-[0.6em]">
                <p className="text-[0.88em] font-semibold text-text-primary">
                    გაყიდვები და მოგება
                </p>

                <div className="flex items-center gap-[0.9em] text-[0.68em] text-text-secondary">
                    <span className="inline-flex items-center gap-[0.45em]">
                        <span className="h-[0.7em] w-[0.7em] rounded-full bg-accent" />
                        გაყიდვები
                    </span>
                    <span className="inline-flex items-center gap-[0.45em]">
                        <span className="h-[0.7em] w-[0.7em] rounded-full bg-success" />
                        მოგება
                    </span>
                </div>
            </div>

            <div className="mt-[1.1em] grid min-w-0 grid-cols-[2.6em_minmax(0,1fr)] gap-[0.4em]">
                <div className="relative h-[11em]">
                    {ticks.map(tick => (
                        <span
                            key={tick}
                            className="absolute right-0 -translate-y-1/2 text-[0.6em] text-text-secondary tabular-nums"
                            style={{ top: `${100 - tick / 10}%` }}
                        >
                            {tick} ₾
                        </span>
                    ))}
                </div>

                <div className="relative min-w-0">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-[11em]">
                        {ticks.map(tick => (
                            <span
                                key={tick}
                                className={`absolute inset-x-0 border-t ${
                                    tick === 0
                                        ? "border-border"
                                        : "border-dashed border-border/60"
                                }`}
                                style={{ top: `${100 - tick / 10}%` }}
                            />
                        ))}
                    </div>

                    <div className="relative grid grid-cols-10">
                        {days.map((day, index) => {
                            const active = index === selectedIndex;

                            return (
                                <span
                                    key={day.date}
                                    onPointerEnter={() => setSelectedIndex(index)}
                                    className="flex min-w-0 cursor-default flex-col items-center"
                                >
                                    <span className="flex h-[11em] items-end gap-[0.15em]">
                                        <span
                                            className={`landing-preview-bar w-[0.6em] rounded-t-[0.2em] bg-accent transition-opacity duration-200 ${
                                                active ? "opacity-100" : "opacity-60"
                                            }`}
                                            style={{
                                                height: `${day.sales / 10}%`,
                                                animationDelay: `${600 + index * 50}ms`,
                                            }}
                                        />
                                        <span
                                            className={`landing-preview-bar w-[0.6em] rounded-t-[0.2em] bg-success transition-opacity duration-200 ${
                                                active ? "opacity-100" : "opacity-60"
                                            }`}
                                            style={{
                                                height: `${day.profit / 10}%`,
                                                animationDelay: `${650 + index * 50}ms`,
                                            }}
                                        />
                                    </span>

                                    <span
                                        className={`mt-[0.7em] text-[0.55em] tabular-nums ${
                                            active
                                                ? "font-semibold text-text-primary"
                                                : "text-text-secondary"
                                        }`}
                                    >
                                        {day.date}
                                    </span>
                                </span>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="mt-[0.9em] grid grid-cols-2 gap-[0.75em] rounded-[0.8em] border border-border bg-background p-[0.75em]">
                <p className="col-span-2 text-[0.65em] text-text-secondary tabular-nums">
                    {selected.date}
                </p>

                <div className="min-w-0">
                    <p className="flex items-center gap-[0.45em] text-[0.65em] text-text-secondary">
                        <span className="h-[0.6em] w-[0.6em] rounded-full bg-accent" />
                        გაყიდვები
                    </p>
                    <p className="mt-[0.2em] text-[0.82em] font-semibold text-text-primary tabular-nums">
                        {money(selected.sales, true)}
                    </p>
                </div>

                <div className="min-w-0">
                    <p className="flex items-center gap-[0.45em] text-[0.65em] text-text-secondary">
                        <span className="h-[0.6em] w-[0.6em] rounded-full bg-success" />
                        სუფთა მოგება
                    </p>
                    <p className="mt-[0.2em] text-[0.82em] font-semibold text-text-primary tabular-nums">
                        {money(selected.profit, true)}
                    </p>
                </div>
            </div>
        </div>
    );
}

function PreviewExpenseChart() {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const gap = 1.2;

    const segments = expenses.map((item, index) => {
        const start = expenses
            .slice(0, index)
            .reduce((sum, previous) => sum + previous.value, 0);
        const length = (item.value / totalExpenses) * circumference;

        return {
            ...item,
            dash: `${Math.max(length - gap, 0)} ${circumference}`,
            offset: -(start / totalExpenses) * circumference,
        };
    });

    return (
        <div className="flex min-w-0 flex-col rounded-[1em] border border-border bg-surface p-[1em] @xl:p-[1.15em]">
            <div className="flex items-center gap-[0.5em]">
                <Icon icon="solar:pie-chart-2-bold-duotone" className="h-[1.2em] w-[1.2em] text-accent" />
                <p className="text-[0.88em] font-semibold text-text-primary">
                    ხარჯების განაწილება
                </p>
            </div>
            <p className="mt-[0.3em] text-[0.62em] text-text-secondary tabular-nums">
                18.10.2026 - 27.10.2026
            </p>

            <div className="mt-[1em] flex flex-1 flex-row items-center gap-[1em] @xl:flex-col @xl:justify-center @2xl:flex-row">
                <div className="relative w-[8.5em] shrink-0 @xl:w-[9em]">
                    <svg viewBox="0 0 100 100" className="block w-full -rotate-90">
                        <circle
                            cx="50"
                            cy="50"
                            r={radius}
                            fill="none"
                            stroke="var(--marteo-border)"
                            strokeOpacity="0.35"
                            strokeWidth="11"
                        />
                        {segments.map(segment => (
                            <circle
                                key={segment.label}
                                cx="50"
                                cy="50"
                                r={radius}
                                fill="none"
                                stroke={segment.color}
                                strokeWidth="11"
                                strokeDasharray={segment.dash}
                                strokeDashoffset={segment.offset}
                                className="landing-preview-donut"
                            />
                        ))}
                    </svg>

                    <span className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="text-[0.55em] text-text-secondary">
                            ჯამური ხარჯი
                        </span>
                        <span className="text-[0.9em] font-semibold text-text-primary tabular-nums">
                            {money(totalExpenses)}
                        </span>
                    </span>
                </div>

                <ul className="flex min-w-0 flex-1 flex-col gap-[0.6em] @xl:w-full @2xl:w-auto">
                    {expenses.map(item => (
                        <li key={item.label} className="min-w-0">
                            <p className="flex items-center gap-[0.45em] text-[0.62em] text-text-secondary">
                                <span
                                    className="h-[0.75em] w-[0.75em] shrink-0 rounded-full"
                                    style={{ backgroundColor: item.color }}
                                />
                                <span className="truncate">{item.label}</span>
                            </p>
                            <p className="mt-[0.1em] pl-[1.2em] text-[0.78em] font-semibold text-text-primary tabular-nums">
                                {money(item.value, true)}
                            </p>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function PreviewLists() {
    return (
        <div className="grid min-w-0 grid-cols-1 gap-[1em] @xl:grid-cols-2 @xl:gap-[1.15em]">
            <div className="min-w-0 overflow-hidden rounded-[1em] border border-border bg-surface">
                <div className="flex items-center justify-between gap-[0.6em] border-b border-border px-[1.15em] py-[0.95em]">
                    <p className="text-[0.88em] font-semibold text-text-primary">
                        ბოლო შეკვეთები
                    </p>
                    <span className="text-[0.62em] font-medium text-accent">
                        ყველა შეკვეთა →
                    </span>
                </div>

                <ul className="divide-y divide-border">
                    {orders.map(order => {
                        const status = orderStatuses[order.status];

                        return (
                            <li
                                key={order.number}
                                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-[0.75em] px-[1.15em] py-[0.8em]"
                            >
                                <span className="text-[0.72em] font-semibold text-text-primary tabular-nums">
                                    #{String(order.number).padStart(4, "0")}
                                </span>
                                <span className="truncate text-[0.72em] text-text-primary">
                                    {order.customer}
                                </span>
                                <span
                                    className={`rounded-[0.5em] px-[0.6em] py-[0.25em] text-[0.6em] font-medium whitespace-nowrap ${status.className}`}
                                >
                                    {status.label}
                                </span>
                                <span className="text-[0.72em] font-semibold text-text-primary tabular-nums">
                                    {money(order.total)}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="min-w-0 overflow-hidden rounded-[1em] border border-border bg-surface">
                <div className="flex items-center justify-between gap-[0.6em] border-b border-border px-[1.15em] py-[0.95em]">
                    <p className="truncate text-[0.88em] font-semibold text-text-primary">
                        ყველაზე გაყიდვადი პროდუქტები
                    </p>
                    <span className="shrink-0 text-[0.62em] font-medium text-accent">
                        მარაგების ნახვა →
                    </span>
                </div>

                <ol className="divide-y divide-border">
                    {products.map((product, index) => (
                        <li
                            key={product.name}
                            className="flex min-w-0 items-center gap-[0.7em] px-[1.15em] py-[0.55em]"
                        >
                            <span className="w-[1em] shrink-0 text-[0.62em] text-text-secondary tabular-nums">
                                {index + 1}
                            </span>
                            <span className="flex h-[2.4em] w-[2.4em] shrink-0 items-center justify-center rounded-[0.7em] border border-border bg-background text-accent">
                                <Icon icon={product.icon} className="h-[1.25em] w-[1.25em]" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[0.72em] font-medium text-text-primary">
                                    {product.name}
                                </span>
                                <span className="block text-[0.6em] text-text-secondary tabular-nums">
                                    {product.quantity} ერთეული
                                </span>
                            </span>
                            <span className="text-[0.72em] font-semibold text-text-primary tabular-nums">
                                {money(product.revenue)}
                            </span>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}
