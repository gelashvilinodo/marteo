"use client";

import { useEffect, useRef, useSyncExternalStore, type DragEvent } from "react";
import type { CalendarContent } from "@/lib/content/get-calendar-page";
import {
    calendarLocalParts as localParts,
    calendarWeekdayIndex,
    calendarWeekdays,
} from "@/lib/content/calendar-period";
import { PlatformIcon, ContentTypeIcon } from "./ContentIcons";
import { contentCardStyle } from "@/lib/content/content-card-style";
import { minutesLabel, type CalendarDrag } from "./calendar-drag";

const HOUR_HEIGHT = 64;
const HOURS = Array.from({ length: 24 }, (_, index) => index);
const TIME_COLUMN = 48;

// კვირის სვეტი 72px-ზე ვიწრო აღარ ხდება: ლეპტოპზე (lg) კვირა სრულად ეტევა,
// უფრო ვიწრო ეკრანზე კი ჰორიზონტალურად სქროლავს.
const MIN_DAY_COLUMN = 72;
const CARD_HEIGHT = 56;
const SNAP_MINUTES = 15;

// „ახლა“ ხაზი ნახევარ წუთში ერთხელ ახლდება; წუთების რიცხვი იგივე რჩება, სანამ წუთი არ შეიცვლება.
function subscribeClock(onChange: () => void) {
    const timer = window.setInterval(onChange, 30_000);
    return () => window.clearInterval(timer);
}

function currentMinutes() {
    return localParts(new Date().toISOString()).minutes;
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
    drag,
    onDay,
    onContent,
}: {
    days: string[];
    items: CalendarContent[];
    today: string;
    busy: boolean;
    drag: CalendarDrag;
    onDay: (day: string) => void;
    onContent: (item: CalendarContent) => void;
}) {
    const viewport = useRef<HTMLDivElement>(null);
    const now = useSyncExternalStore(subscribeClock, currentMinutes, () => null);

    const grouped = new Map<string, CalendarContent[]>();
    let firstMinutes = Infinity;

    for (const item of items) {
        if (!item.scheduledAt) continue;

        const parts = localParts(item.scheduledAt);
        if (!days.includes(parts.day)) continue;

        const current = grouped.get(parts.day) ?? [];
        current.push(item);
        grouped.set(parts.day, current);
        firstMinutes = Math.min(firstMinutes, parts.minutes);
    }

    // გახსნისას: დღევანდელ პერიოდში ორი საათით ადრე „ახლაზე“, სხვაგან პირველ ჩანაწერზე, ან 08:00.
    const scrollMinutes =
        now !== null && days.includes(today)
            ? now - 120
            : firstMinutes !== Infinity
                ? firstMinutes - 60
                : 8 * 60;

    const scrollTarget = useRef(scrollMinutes);
    const period = `${days[0]}:${days.length}`;

    useEffect(() => {
        scrollTarget.current = scrollMinutes;
    });

    // მხოლოდ პერიოდის შეცვლისას: შენახვის შემდეგ განახლებამ სქროლი არ უნდა გადაწიოს.
    useEffect(() => {
        if (viewport.current) {
            viewport.current.scrollTop =
                Math.max(0, scrollTarget.current / 60) * HOUR_HEIGHT;
        }
    }, [period]);

    // ბარათის ზედა კიდე 15 წუთზე ეწყობა; 23:45-ზე გვიან ვერ ჩავარდება.
    function slot(day: string, event: DragEvent<HTMLElement>) {
        const top = event.clientY - event.currentTarget.getBoundingClientRect().top - drag.offset;
        const minutes = Math.round((top / HOUR_HEIGHT) * 60 / SNAP_MINUTES) * SNAP_MINUTES;
        return { day, minutes: Math.min(24 * 60 - SNAP_MINUTES, Math.max(0, minutes)) };
    }

    const columns = `${TIME_COLUMN}px repeat(${days.length}, minmax(0, 1fr))`;
    const height = HOUR_HEIGHT * 24 + 64;

    return (
        <div
            ref={viewport}
            className="min-h-0 flex-1 overflow-auto overscroll-contain"
        >
            <div
                style={{
                    minWidth:
                        days.length > 1
                            ? TIME_COLUMN + days.length * MIN_DAY_COLUMN
                            : "100%",
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
                            aria-label={`${day.split("-").reverse().join(".")}: ${(grouped.get(day) ?? []).length} კონტენტი`}
                            className="flex min-w-0 flex-col items-center gap-1 border-l border-border px-1 py-2 text-center disabled:opacity-50"
                        >
                            <span className="flex items-center gap-1.5">
                                <span
                                    className={`text-[11px] ${day === today
                                            ? "font-semibold text-accent"
                                            : "text-text-secondary"
                                        }`}
                                >
                                    {calendarWeekdays[calendarWeekdayIndex(day)]}
                                </span>

                                <span
                                    className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm tabular-nums ${day === today
                                            ? "bg-accent font-semibold text-white"
                                            : "text-text-primary"
                                        }`}
                                >
                                    {Number(day.slice(8, 10))}
                                </span>
                            </span>

                            <span className="max-w-full truncate text-[10px] text-text-secondary">
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
                            onDragOver={event => drag.over(slot(day, event), event)}
                            onDrop={event => drag.drop(slot(day, event), event)}
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

                            {day === today && now !== null && (
                                <div
                                    aria-hidden="true"
                                    style={{ top: (now / 60) * HOUR_HEIGHT }}
                                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger"
                                >
                                    <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-danger" />
                                </div>
                            )}

                            {drag.item && drag.target?.day === day && drag.target.minutes !== null && (
                                <div
                                    aria-hidden="true"
                                    style={{
                                        top: (drag.target.minutes / 60) * HOUR_HEIGHT,
                                        height: CARD_HEIGHT,
                                    }}
                                    className="pointer-events-none absolute inset-x-0 z-20 rounded-lg border-2 border-dashed border-accent bg-accent/10 px-1.5 py-1"
                                >
                                    <span className="text-[10px] font-semibold tabular-nums text-accent">
                                        {minutesLabel(drag.target.minutes)}
                                    </span>
                                </div>
                            )}

                            {arrange(grouped.get(day) ?? []).map(entry => (
                                <button
                                    key={entry.item.id}
                                    type="button"
                                    disabled={busy}
                                    draggable={drag.canMove(entry.item)}
                                    onDragStart={event => drag.start(entry.item, event)}
                                    onDragEnd={drag.end}
                                    onClick={() => onContent(entry.item)}
                                    title={`${entry.time} · ${entry.item.title}`}
                                    style={{
                                        ...contentCardStyle(entry.item, today),
                                        top: (entry.minutes / 60) * HOUR_HEIGHT,
                                        left: `${(entry.lane / entry.lanes) * 100}%`,
                                        width: `${100 / entry.lanes}%`,
                                        height: CARD_HEIGHT,
                                    }}
                                    className={`absolute overflow-hidden rounded-lg border border-accent/25 bg-background px-1.5 py-1 text-left hover:border-accent disabled:opacity-50 ${entry.item.status === "CANCELED" || drag.item?.id === entry.item.id
                                            ? "opacity-50"
                                            : ""
                                        } ${drag.canMove(entry.item) ? "cursor-grab active:cursor-grabbing" : ""}`}
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