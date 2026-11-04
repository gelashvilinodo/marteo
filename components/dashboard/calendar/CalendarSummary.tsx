"use client";

import { Icon } from "@iconify/react";
import type {
    CalendarContent,
    CalendarPageData,
} from "@/lib/content/get-calendar-page";
import { calendarLocalParts } from "@/lib/content/calendar-period";
import { contentPlatforms } from "@/lib/content/content-options";
import { contentCardStyle } from "@/lib/content/content-card-style";
import { PlatformIcon } from "./ContentIcons";

function platformLabel(platform: string, customPlatform: string | null) {
    if (platform === "OTHER") return customPlatform || "სხვა პლატფორმა";

    return contentPlatforms.find(item => item.value === platform)?.label ?? platform;
}

// ვიწრო ბარათზე (ტელეფონი, lg+ ზედა ზოლი, 2xl გვერდითა სვეტი) სიდიდე და მოკლე
// სათაური ერთმანეთის ქვეშაა, sm–lg ტაბლეტზე კი იკონის გვერდით, სრული სათაურით.
export function CalendarStats({
    counts,
}: {
    counts: CalendarPageData["counts"];
}) {
    const cards = [
        {
            title: "ამ თვეში დაგეგმილი",
            short: "დაგეგმილი",
            value: counts.planned,
            icon: "solar:calendar-linear",
            tone: "bg-accent/10 text-accent",
        },
        {
            title: "გამოქვეყნებული",
            short: "გამოქვეყნდა",
            value: counts.published,
            icon: "solar:check-circle-linear",
            tone: "bg-success/10 text-success",
        },
        {
            title: "ვადაგადაცილებული",
            short: "დაგვიანებული",
            value: counts.overdue,
            icon: "solar:clock-circle-linear",
            tone: "bg-warning/10 text-warning",
        },
    ];

    return (
        <div data-tour="calendar-stats" className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-[repeat(3,8rem)] xl:grid-cols-[repeat(3,9rem)] 2xl:grid-cols-1 2xl:gap-2">
            {cards.map(card => (
                <section
                    key={card.title}
                    title={card.title}
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] content-between items-center gap-x-2 gap-y-2 rounded-2xl border border-border bg-surface p-2.5 sm:content-center sm:gap-x-3 sm:p-3 lg:content-between 2xl:grid-cols-[auto_minmax(0,1fr)_auto] 2xl:content-center"
                >
                    <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:row-span-2 sm:h-10 sm:w-10 lg:row-span-1 lg:h-8 lg:w-8 ${card.tone}`}
                    >
                        <Icon icon={card.icon} className="h-5 w-5" />
                    </span>

                    <p className="justify-self-end text-xl font-semibold leading-none tabular-nums text-text-primary sm:justify-self-start sm:text-2xl lg:justify-self-end lg:text-xl 2xl:col-start-3 2xl:row-start-1">
                        {card.value}
                    </p>

                    <h2 className="col-span-2 truncate text-[11px] leading-4 text-text-secondary sm:col-span-1 sm:col-start-2 sm:text-sm lg:col-span-2 lg:col-start-1 lg:text-[11px] xl:text-xs 2xl:col-span-1 2xl:col-start-2 2xl:row-start-1 2xl:text-sm">
                        <span className="sm:hidden lg:inline 2xl:hidden">{card.short}</span>
                        <span className="hidden sm:inline lg:hidden 2xl:inline">{card.title}</span>
                    </h2>
                </section>
            ))}
        </div>
    );
}

// 2xl-მდე დავალებები ჰორიზონტალურ ზოლად ჩანს, რომ კალენდარს სიმაღლე არ წაართვას;
// 2xl-ზე გვერდით სვეტში ვერტიკალური სიაა.
export function TodayTasks({
    tasks,
    today,
    busy,
    onOpen,
}: {
    tasks: CalendarPageData["todayTasks"];
    today: string;
    busy: boolean;
    onOpen: (content: CalendarContent) => void;
}) {
    return (
        <section data-tour="calendar-today" className="flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-3 2xl:min-h-0 2xl:flex-1">
            <div className="flex shrink-0 items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                    <Icon
                        icon="solar:checklist-minimalistic-linear"
                        className="h-5 w-5 shrink-0 text-accent"
                    />
                    დღევანდელი დავალებები
                </h2>

                <span className="text-xs tabular-nums text-text-secondary">
                    {tasks.length}
                </span>
            </div>

            {tasks.length === 0 ? (
                <p className="mt-2 text-sm text-text-secondary 2xl:py-4 2xl:text-center">
                    შესასრულებელი კონტენტი არ არის.
                </p>
            ) : (
                <div className="-mx-3 mt-2 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-3 pb-1 2xl:min-h-0 2xl:flex-1 2xl:snap-none 2xl:flex-col 2xl:overflow-y-auto 2xl:overflow-x-hidden 2xl:overscroll-contain">
                    {tasks.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            disabled={busy}
                            onClick={() => onOpen(item)}
                            title={item.title}
                            style={contentCardStyle(item, today)}
                            className="block w-60 shrink-0 snap-start rounded-xl border border-border bg-background px-3 py-2 text-left transition-colors hover:border-accent disabled:opacity-50 2xl:w-full"
                        >
                            <span className="flex min-w-0 items-center justify-between gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                                    {item.title}
                                </span>

                                {item.overdue && (
                                    <span className="shrink-0 text-[10px] text-warning">
                                        დაგვიანებულია
                                    </span>
                                )}
                            </span>

                            <span className="mt-1.5 flex min-w-0 items-center gap-x-3 overflow-hidden">
                                {item.channels
                                    .filter(channel => !channel.completedAt)
                                    .map(channel => (
                                        <span
                                            key={channel.id}
                                            className="inline-flex shrink-0 items-center gap-1.5"
                                        >
                                            <PlatformIcon
                                                platform={channel.platform}
                                                customPlatform={channel.customPlatform}
                                                className="h-3.5 w-3.5"
                                            />

                                            <span className="text-[11px] text-text-secondary">
                                                {platformLabel(
                                                    channel.platform,
                                                    channel.customPlatform,
                                                )}
                                            </span>
                                        </span>
                                    ))}

                                {item.overdue && item.scheduledAt && (
                                    <span className="shrink-0 text-[10px] tabular-nums text-text-secondary">
                                        {calendarLocalParts(item.scheduledAt)
                                            .day.split("-")
                                            .reverse()
                                            .join(".")}
                                    </span>
                                )}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
