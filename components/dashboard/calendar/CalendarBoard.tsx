"use client";

import { Icon } from "@iconify/react";
import type {
    CalendarContent,
    CalendarPageData,
} from "@/lib/content/get-calendar-page";
import {
    shiftCalendarPeriod,
    type CalendarView,
} from "@/lib/content/calendar-period";
import { PlatformIcon, ContentTypeIcon } from "./ContentIcons";
import CalendarTimeline from "./CalendarTimeline";
import { contentCardStyle } from "@/lib/content/content-card-style";
import CalendarTransition from "./CalendarTransition";

const months = [
    "იანვარი", "თებერვალი", "მარტი", "აპრილი",
    "მაისი", "ივნისი", "ივლისი", "აგვისტო",
    "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი",
];

const weekdays = ["ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ", "კვი"];

function dateLabel(value: string) {
    const [year, month, day] = value.split("-");
    return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

function localParts(value: string | null) {
    if (!value) return { day: "", time: "" };

    const local = new Date(
        new Date(value).getTime() + 4 * 60 * 60 * 1000,
    ).toISOString();

    return {
        day: local.slice(0, 10),
        time: local.slice(11, 16),
    };
}

export default function CalendarBoard({
    data,
    busy,
    onNavigate,
    onDay,
    onContent,
}: {
    data: CalendarPageData;
    busy: boolean;
    onNavigate: (view: CalendarView, date: string) => void;
    onDay: (date: string) => void;
    onContent: (content: CalendarContent) => void;
}) {
    const grouped = new Map<string, CalendarContent[]>();

    for (const item of data.calendarItems) {
        const day = localParts(item.scheduledAt).day;
        const items = grouped.get(day) ?? [];
        items.push(item);
        grouped.set(day, items);
    }

    const title =
        data.view === "month"
            ? `${months[Number(data.anchor.slice(5, 7)) - 1]} ${data.anchor.slice(0, 4)}`
            : data.view === "week"
                ? `${dateLabel(data.from)} - ${dateLabel(data.to)}`
                : dateLabel(data.anchor);

    return (
        <section
            aria-busy={busy}
            className="flex h-[min(85dvh,50rem)] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface"
        >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border p-3">
                <div className="flex min-w-0 items-center gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        aria-label="წინა პერიოდი"
                        onClick={() =>
                            onNavigate(
                                data.view,
                                shiftCalendarPeriod(
                                    data.anchor,
                                    data.view,
                                    -1,
                                ),
                            )
                        }
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-text-secondary disabled:opacity-50"
                    >
                        <Icon icon="solar:alt-arrow-left-linear" className="h-5 w-5" />
                    </button>

                    <h2 className="min-w-0 text-sm font-semibold text-text-primary">
                        {title}
                    </h2>

                    <button
                        type="button"
                        disabled={busy}
                        aria-label="შემდეგი პერიოდი"
                        onClick={() =>
                            onNavigate(
                                data.view,
                                shiftCalendarPeriod(
                                    data.anchor,
                                    data.view,
                                    1,
                                ),
                            )
                        }
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-text-secondary disabled:opacity-50"
                    >
                        <Icon icon="solar:alt-arrow-right-linear" className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => onNavigate(data.view, data.today)}
                        className="h-10 rounded-xl border border-border px-3 text-sm text-text-primary disabled:opacity-50"
                    >
                        დღეს
                    </button>

                    <div className="relative isolate grid w-44 grid-cols-3 rounded-xl border border-border bg-background p-1">
                        <span
                            aria-hidden="true"
                            style={{
                                width: "calc((100% - 8px) / 3)",
                                transform: `translateX(${["month", "week", "day"].indexOf(data.view) * 100
                                    }%)`,
                            }}
                            className="pointer-events-none absolute left-1 top-1 -z-10 h-8 rounded-lg bg-accent transition-transform duration-300 ease-in-out motion-reduce:transition-none"
                        />
                        {[
                            { value: "month", label: "თვე" },
                            { value: "week", label: "კვირა" },
                            { value: "day", label: "დღე" },
                        ].map(view => (
                            <button
                                key={view.value}
                                type="button"
                                disabled={busy}
                                aria-pressed={data.view === view.value}
                                onClick={() =>
                                    onNavigate(
                                        view.value as CalendarView,
                                        data.anchor,
                                    )
                                }
                                className={`h-8 rounded-lg px-2 text-sm transition-colors duration-300 disabled:opacity-50 ${data.view === view.value
                                        ? "text-white"
                                        : "text-text-secondary"
                                    }`}
                            >
                                {view.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <CalendarTransition
                position={`${data.anchor}:${["month", "week", "day"].indexOf(data.view)}`}
            >
                {data.view === "month" ? (
                    <>
                        <div className="grid shrink-0 grid-cols-7 border-b border-border">
                            {weekdays.map(day => (
                                <div
                                    key={day}
                                    className="py-3 text-center text-[10px] text-text-secondary sm:text-xs"
                                >
                                    {day}
                                </div>
                            ))}
                        </div>

                        <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
                            {data.days.map(day => {
                                const items = grouped.get(day) ?? [];
                                const outsideMonth =
                                    day.slice(0, 7) !== data.anchor.slice(0, 7);

                                return (
                                    <div
                                        key={day}
                                        className={`min-h-0 min-w-0 overflow-hidden border-b border-r border-border p-1 sm:p-2 ${outsideMonth ? "bg-background/40" : ""
                                            }`}
                                    >
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => onDay(day)}
                                            aria-label={`${dateLabel(day)}: ${items.length} კონტენტი`}
                                            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs disabled:opacity-50 ${day === data.today
                                                ? "bg-accent font-semibold text-white"
                                                : outsideMonth
                                                    ? "text-text-secondary/50"
                                                    : "text-text-primary hover:bg-accent/10"
                                                }`}
                                        >
                                            {Number(day.slice(8, 10))}
                                        </button>

                                        {items.length > 0 && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => onDay(day)}
                                                className="mt-2 w-full rounded-lg bg-accent/10 py-1 text-center text-[10px] text-accent sm:hidden"
                                            >
                                                {items.length}
                                            </button>
                                        )}

                                        <div className="mt-2 hidden space-y-1.5 sm:block">
                                            {items.slice(0, 1).map(item => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => onContent(item)}
                                                    style={contentCardStyle(item, data.today)}
                                                    className={`w-full rounded-lg border border-border bg-background p-1.5 text-left hover:border-accent ${item.status === "CANCELED"
                                                        ? "opacity-50"
                                                        : ""
                                                        }`}
                                                >
                                                    <p className="flex min-w-0 items-center gap-1.5 text-xs text-text-primary">
                                                        <ContentTypeIcon type={item.type} />
                                                        <span className="truncate">{item.title}</span>
                                                    </p>
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {item.channels.map(channel => (
                                                            <PlatformIcon
                                                                key={channel.id}
                                                                platform={channel.platform}
                                                                customPlatform={channel.customPlatform}
                                                            />
                                                        ))}
                                                    </div>
                                                </button>
                                            ))}

                                            {items.length > 1 && (
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => onDay(day)}
                                                    className="text-xs text-accent"
                                                >
                                                    კიდევ {items.length - 1}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <CalendarTimeline
                        days={data.days}
                        items={data.calendarItems}
                        today={data.today}
                        busy={busy}
                        onDay={onDay}
                        onContent={onContent}
                    />
                )}
            </CalendarTransition>
        </section>
    );
}