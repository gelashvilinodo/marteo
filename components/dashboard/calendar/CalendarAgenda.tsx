"use client";

import { Icon } from "@iconify/react";
import type { CalendarContent } from "@/lib/content/get-calendar-page";
import {
    calendarLocalParts,
    calendarMonths,
    calendarWeekdayIndex,
} from "@/lib/content/calendar-period";
import { contentCardStyle, contentState } from "@/lib/content/content-card-style";
import { PlatformIcon, ContentTypeIcon } from "./ContentIcons";

const weekdayNames = [
    "ორშაბათი", "სამშაბათი", "ოთხშაბათი", "ხუთშაბათი",
    "პარასკევი", "შაბათი", "კვირა",
];

function dayTitle(day: string) {
    return `${Number(day.slice(8, 10))} ${calendarMonths[Number(day.slice(5, 7)) - 1]}, ${weekdayNames[calendarWeekdayIndex(day)]}`;
}

const statusLabels = {
    canceled: { text: "გაუქმებულია", tone: "text-text-secondary" },
    done: { text: "შესრულებულია", tone: "text-success" },
    overdue: { text: "დაგვიანებულია", tone: "text-warning" },
} as const;

function status(item: CalendarContent, today: string) {
    const state = contentState(item, today);
    return state === "planned" ? null : statusLabels[state];
}

// ტელეფონზე ბადის ნაცვლად (ან მის ქვეშ) დღეების სია: სათაური, დრო და პლატფორმები სრულად ჩანს.
export default function CalendarAgenda({
    days,
    grouped,
    today,
    busy,
    onContent,
    onNew,
}: {
    days: string[];
    grouped: Map<string, CalendarContent[]>;
    today: string;
    busy: boolean;
    onContent: (content: CalendarContent) => void;
    onNew: (day: string) => void;
}) {
    return (
        <div className="divide-y divide-border">
            {days.map(day => {
                const items = [...(grouped.get(day) ?? [])].sort((a, b) =>
                    (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""),
                );

                return (
                    <section key={day} aria-label={dayTitle(day)} className="p-3">
                        <div className="flex items-center justify-between gap-3">
                            <h3
                                className={`text-sm font-semibold ${day === today ? "text-accent" : "text-text-primary"
                                    }`}
                            >
                                {dayTitle(day)}
                                {day === today && (
                                    <span className="ml-2 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium">
                                        დღეს
                                    </span>
                                )}
                            </h3>

                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => onNew(day)}
                                aria-label={`${dayTitle(day)}: კონტენტის დამატება`}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-success disabled:opacity-50"
                            >
                                <Icon icon="solar:add-circle-linear" className="h-5 w-5" />
                            </button>
                        </div>

                        {items.length === 0 ? (
                            <p className="mt-1 text-sm text-text-secondary">
                                კონტენტი დაგეგმილი არ არის.
                            </p>
                        ) : (
                            <div className="mt-2 space-y-2">
                                {items.map(item => {
                                    const state = status(item, today);

                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            disabled={busy}
                                            onClick={() => onContent(item)}
                                            style={contentCardStyle(item, today)}
                                            className={`flex min-h-14 w-full items-start gap-3 rounded-xl border border-border px-3 py-2.5 text-left disabled:opacity-50 ${item.status === "CANCELED" ? "opacity-50" : ""
                                                }`}
                                        >
                                            <span className="w-11 shrink-0 pt-0.5 text-xs font-medium tabular-nums text-text-secondary">
                                                {item.scheduledAt
                                                    ? calendarLocalParts(item.scheduledAt).time
                                                    : ""}
                                            </span>

                                            <span className="min-w-0 flex-1">
                                                <span className="flex min-w-0 items-start gap-1.5 text-sm font-medium text-text-primary">
                                                    <ContentTypeIcon type={item.type} />
                                                    <span className="min-w-0 break-words">
                                                        {item.title}
                                                    </span>
                                                </span>

                                                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    {item.channels.map(channel => (
                                                        <PlatformIcon
                                                            key={channel.id}
                                                            platform={channel.platform}
                                                            customPlatform={channel.customPlatform}
                                                            className={`h-4 w-4 ${channel.completedAt ? "opacity-40" : ""}`}
                                                        />
                                                    ))}

                                                    {state && (
                                                        <span className={`text-[11px] ${state.tone}`}>
                                                            {state.text}
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                );
            })}
        </div>
    );
}
