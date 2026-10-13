"use client";

import { useEffect, useRef } from "react";
import type { CalendarContent } from "@/lib/content/get-calendar-page";
import { PlatformIcon, ContentTypeIcon } from "./ContentIcons";
import { contentCardStyle } from "@/lib/content/content-card-style";

const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: 24 }, (_, index) => index);

function localParts(value: string) {
    const local = new Date(
        new Date(value).getTime() + 4 * 60 * 60 * 1000,
    ).toISOString();

    const time = local.slice(11, 16);
    const [hour, minute] = time.split(":").map(Number);

    return {
        day: local.slice(0, 10),
        time,
        minutes: hour * 60 + minute,
    };
}

function arrange(items: CalendarContent[]) {
    const sorted = items
        .filter(item => item.scheduledAt !== null)
        .map(item => ({
            item,
            ...localParts(item.scheduledAt!),
            lane: 0,
            lanes: 1,
        }))
        .sort(
            (a, b) =>
                a.minutes - b.minutes ||
                a.item.id.localeCompare(b.item.id),
        );

    let group: typeof sorted = [];
    let laneEnds: number[] = [];
    let groupEnd = -1;

    function finishGroup() {
        for (const entry of group) {
            entry.lanes = Math.max(1, laneEnds.length);
        }

        group = [];
        laneEnds = [];
        groupEnd = -1;
    }

    for (const entry of sorted) {
        if (entry.minutes >= groupEnd && group.length) {
            finishGroup();
        }

        let lane = laneEnds.findIndex(end => end <= entry.minutes);

        if (lane === -1) lane = laneEnds.length;

        // ეს მხოლოდ ჩანაწერის საჩვენებელი სივრცეა,
        // კონტენტის რეალურ ხანგრძლივობას არ განსაზღვრავს.
        laneEnds[lane] = entry.minutes + 60;
        groupEnd = Math.max(groupEnd, entry.minutes + 60);
        entry.lane = lane;
        group.push(entry);
    }

    finishGroup();
    return sorted;
}

export default function CalendarTimeline({
    days,
    items,
    today,
    busy,
    onDay,
    onContent,
}: {
    days: string[];
    items: CalendarContent[];
    today: string;
    busy: boolean;
    onDay: (day: string) => void;
    onContent: (item: CalendarContent) => void;
}) {
    const viewport = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (viewport.current) {
            viewport.current.scrollTop = 8 * HOUR_HEIGHT;
        }
    }, [days[0], days.length]);

    const grouped = new Map<string, CalendarContent[]>();

    for (const item of items) {
        if (!item.scheduledAt) continue;

        const day = localParts(item.scheduledAt).day;
        const current = grouped.get(day) ?? [];
        current.push(item);
        grouped.set(day, current);
    }

    const columns = `48px repeat(${days.length}, minmax(0, 1fr))`;
    const height = HOUR_HEIGHT * 24 + 64;

    return (
        <div
            ref={viewport}
            className="min-h-0 flex-1 overflow-auto overscroll-contain"
        >
            <div
                style={{
                    minWidth: days.length > 1 ? "888px" : "100%",
                }}
            >
                <div
                    style={{ gridTemplateColumns: columns }}
                    className="sticky top-0 z-30 grid border-b border-border bg-surface"
                >
                    <div className="sticky left-0 z-40 bg-surface" />

                    {days.map(day => (
                        <button
                            key={day}
                            type="button"
                            disabled={busy}
                            onClick={() => onDay(day)}
                            className={`border-l border-border px-2 py-3 text-center text-xs ${day === today
                                    ? "font-semibold text-accent"
                                    : "text-text-primary"
                                }`}
                        >
                            {day.slice(8, 10)}.{day.slice(5, 7)}
                            <span className="mt-1 block text-[10px] text-text-secondary">
                                {(grouped.get(day) ?? []).length} კონტენტი
                            </span>
                        </button>
                    ))}
                </div>

                <div
                    style={{ gridTemplateColumns: columns }}
                    className="grid"
                >
                    <div
                        style={{ height }}
                        className="sticky left-0 z-20 bg-surface"
                    >
                        {HOURS.map(hour => (
                            <span
                                key={hour}
                                style={{ top: hour * HOUR_HEIGHT }}
                                className="absolute right-2 text-[10px] tabular-nums text-text-secondary"
                            >
                                {String(hour).padStart(2, "0")}:00
                            </span>
                        ))}
                    </div>

                    {days.map(day => (
                        <div
                            key={day}
                            style={{ height }}
                            className={`relative border-l border-border ${day === today ? "bg-accent/[0.025]" : ""
                                }`}
                        >
                            {HOURS.map(hour => (
                                <div
                                    key={hour}
                                    style={{ top: hour * HOUR_HEIGHT }}
                                    className="pointer-events-none absolute inset-x-0 border-t border-border"
                                />
                            ))}

                            {arrange(grouped.get(day) ?? []).map(entry => (
                                <button
                                    key={entry.item.id}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => onContent(entry.item)}
                                    title={`${entry.time} · ${entry.item.title}`}
                                    style={{
                                        ...contentCardStyle(entry.item, today),
                                        top: (entry.minutes / 60) * HOUR_HEIGHT,
                                        left: `${(entry.lane / entry.lanes) * 100}%`,
                                        width: `${100 / entry.lanes}%`,
                                        height: 56,
                                    }}
                                    className={`absolute overflow-hidden rounded-lg border border-accent/25 bg-background px-1.5 py-1 text-left hover:border-accent disabled:opacity-50 ${entry.item.status === "CANCELED"
                                            ? "opacity-50"
                                            : ""
                                        }`}
                                >
                                    <div className="flex min-w-0 items-center gap-1">
                                        <ContentTypeIcon type={entry.item.type} />
                                        <span className="truncate text-xs font-medium text-text-primary">
                                            {entry.item.title}
                                        </span>
                                    </div>

                                    <div className="mt-1 flex items-center gap-1 overflow-hidden">
                                        <span className="shrink-0 text-[10px] tabular-nums text-text-secondary">
                                            {entry.time}
                                        </span>

                                        {entry.item.channels.map(channel => (
                                            <PlatformIcon
                                                key={channel.id}
                                                platform={channel.platform}
                                                customPlatform={channel.customPlatform}
                                                className="h-3 w-3"
                                            />
                                        ))}
                                    </div>
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}