"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@iconify/react";
import type {
    CalendarContent,
    CalendarPageData,
} from "@/lib/content/get-calendar-page";
import {
    calendarLocalParts,
    calendarMonths as months,
    calendarMonthsShort,
    resolveCalendarPeriod,
    shiftCalendarPeriod,
    type CalendarView,
} from "@/lib/content/calendar-period";
import CalendarTimeline from "./CalendarTimeline";
import CalendarTransition from "./CalendarTransition";
import CalendarMonth, { type CalendarBodySize } from "./CalendarMonth";
import CalendarAgenda from "./CalendarAgenda";
import CalendarFilter, {
    emptyCalendarFilters,
    type CalendarFilters,
} from "./CalendarFilter";
import { contentState } from "@/lib/content/content-card-style";
import {
    minutesLabel,
    type CalendarDrag,
    type CalendarDropTarget,
} from "./calendar-drag";

function dateLabel(value: string) {
    const [year, month, day] = value.split("-");
    return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
}

// ტელეფონის სათაური: „2–8 ნოე 2026“ ან „30 ნოე – 6 დეკ 2026“.
function shortRange(from: string, to: string) {
    const label = (value: string) =>
        `${Number(value.slice(8, 10))} ${calendarMonthsShort[Number(value.slice(5, 7)) - 1]}`;

    if (from.slice(0, 7) === to.slice(0, 7)) {
        return `${Number(from.slice(8, 10))}–${label(to)} ${to.slice(0, 4)}`;
    }

    return from.slice(0, 4) === to.slice(0, 4)
        ? `${label(from)} – ${label(to)} ${to.slice(0, 4)}`
        : `${label(from)} ${from.slice(0, 4)} – ${label(to)} ${to.slice(0, 4)}`;
}

// იგივე ზღვარი, რაც Tailwind-ის max-sm: კლასებს აქვს.
const PHONE_QUERY = "(max-width: 639px)";

function subscribePhone(onChange: () => void) {
    const query = window.matchMedia(PHONE_QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

export default function CalendarBoard({
    data,
    busy,
    loading,
    pending,
    onNavigate,
    onDay,
    onContent,
    onNew,
    onMove,
}: {
    data: CalendarPageData;
    busy: boolean;
    loading: boolean;
    pending: { view: CalendarView; anchor: string } | null;
    onNavigate: (view: CalendarView, date: string) => void;
    onDay: (date: string) => void;
    onContent: (content: CalendarContent) => void;
    onNew: (date: string) => void;
    onMove: (content: CalendarContent, date: string, time: string) => void;
}) {
    const compact = useSyncExternalStore(
        subscribePhone,
        () => window.matchMedia(PHONE_QUERY).matches,
        () => false,
    );

    const [picked, setPicked] = useState<string | null>(null);
    const selected =
        picked && picked.slice(0, 7) === data.anchor.slice(0, 7)
            ? picked
            : data.anchor;

    function pickDay(day: string) {
        setPicked(day);

        // მეზობელი თვის დღეზე დაჭერა იმ თვეზე გადადის.
        if (day.slice(0, 7) !== data.anchor.slice(0, 7)) {
            onNavigate("month", day);
        }
    }

    const body = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState<CalendarBodySize | null>(null);

    // თვის უჯრაში რამდენი ჩანაწერი ეტევა, ეს დაფის რეალურ ზომაზეა დამოკიდებული.
    useEffect(() => {
        const element = body.current;
        if (!element) return;

        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setSize(current =>
                current?.width === width && current.height === height
                    ? current
                    : { width, height },
            );
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const [filters, setFilters] = useState<CalendarFilters>(emptyCalendarFilters);

    const items = data.calendarItems.filter(
        item =>
            (filters.platforms.length === 0 ||
                item.channels.some(channel =>
                    filters.platforms.includes(channel.platform),
                )) &&
            (filters.states.length === 0 ||
                filters.states.includes(contentState(item, data.today))),
    );

    const [dragging, setDragging] = useState<{
        item: CalendarContent;
        offset: number;
    } | null>(null);
    const [target, setTarget] = useState<CalendarDropTarget | null>(null);

    function stopDrag() {
        setDragging(null);
        setTarget(null);
    }

    // გადატანა მხოლოდ მაუსით და მხოლოდ შეუსრულებელ კონტენტზე; ტელეფონზე სია და ფორმა რჩება.
    function canMove(item: CalendarContent) {
        const state = contentState(item, data.today);
        return !compact && !busy && item.scheduledAt !== null &&
            (state === "planned" || state === "overdue");
    }

    const drag: CalendarDrag = {
        item: dragging?.item ?? null,
        offset: dragging?.offset ?? 0,
        target,
        canMove,
        start(item, event) {
            if (!canMove(item)) {
                event.preventDefault();
                return;
            }

            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", item.id);
            setDragging({
                item,
                offset: event.clientY - event.currentTarget.getBoundingClientRect().top,
            });
        },
        over(next, event) {
            if (!dragging) return;

            event.preventDefault();
            event.dataTransfer.dropEffect = "move";

            if (target?.day !== next.day || target.minutes !== next.minutes) {
                setTarget(next);
            }
        },
        drop(next, event) {
            if (!dragging) return;

            event.preventDefault();
            stopDrag();

            const current = calendarLocalParts(dragging.item.scheduledAt!);
            const minutes = next.minutes ?? current.minutes;

            if (next.day !== current.day || minutes !== current.minutes) {
                onMove(dragging.item, next.day, minutesLabel(minutes));
            }
        },
        end: stopDrag,
    };

    const grouped = new Map<string, CalendarContent[]>();

    for (const item of items) {
        if (!item.scheduledAt) continue;

        const day = calendarLocalParts(item.scheduledAt).day;
        const items = grouped.get(day) ?? [];
        items.push(item);
        grouped.set(day, items);
    }

    // toolbar მოთხოვნილ პერიოდს აჩვენებს, ბადე კი ჩატვირთვამდე წინა მონაცემს.
    const nav = pending ?? { view: data.view, anchor: data.anchor };
    const navRange = resolveCalendarPeriod({ view: nav.view, date: nav.anchor });

    const title =
        nav.view === "month"
            ? `${months[Number(nav.anchor.slice(5, 7)) - 1]} ${nav.anchor.slice(0, 4)}`
            : nav.view === "week"
                ? `${dateLabel(navRange.from)} - ${dateLabel(navRange.to)}`
                : dateLabel(nav.anchor);

    const shortTitle =
        nav.view === "week" ? shortRange(navRange.from, navRange.to) : title;

    return (
        <section
            data-tour="calendar-board"
            aria-busy={loading || busy}
            onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setTarget(null);
                }
            }}
            className={`flex h-[min(85dvh,50rem)] min-w-0 flex-col ${data.view === "day" ? "" : "max-sm:h-auto"}  overflow-hidden rounded-2xl border border-border bg-surface lg:h-[calc(100dvh-9.25rem)] lg:min-h-[26rem] 2xl:order-1 2xl:h-auto`}
        >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border p-3">
                <div className="flex min-w-0 items-center gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        aria-label="წინა პერიოდი"
                        onClick={() =>
                            onNavigate(
                                nav.view,
                                shiftCalendarPeriod(
                                    nav.anchor,
                                    nav.view,
                                    -1,
                                ),
                            )
                        }
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-text-secondary disabled:opacity-50"
                    >
                        <Icon icon="solar:alt-arrow-left-linear" className="h-5 w-5" />
                    </button>

                    <h2
                        aria-label={title}
                        className="min-w-0 text-sm font-semibold text-text-primary"
                    >
                        <span aria-hidden="true" className="sm:hidden">{shortTitle}</span>
                        <span aria-hidden="true" className="hidden sm:inline">{title}</span>
                    </h2>

                    <button
                        type="button"
                        disabled={busy}
                        aria-label="შემდეგი პერიოდი"
                        onClick={() =>
                            onNavigate(
                                nav.view,
                                shiftCalendarPeriod(
                                    nav.anchor,
                                    nav.view,
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
                    <CalendarFilter value={filters} onChange={setFilters} />

                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => onNavigate(nav.view, data.today)}
                        className="h-10 rounded-xl border border-border px-3 text-sm text-text-primary disabled:opacity-50"
                    >
                        დღეს
                    </button>

                    <div className="relative isolate grid w-44 grid-cols-3 rounded-xl border border-border bg-background p-1">
                        <span
                            aria-hidden="true"
                            style={{
                                width: "calc((100% - 8px) / 3)",
                                transform: `translateX(${["month", "week", "day"].indexOf(nav.view) * 100
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
                                aria-pressed={nav.view === view.value}
                                onClick={() =>
                                    onNavigate(
                                        view.value as CalendarView,
                                        // ტელეფონზე თვის ხედში არჩეული დღიდან გადადის კვირასა და დღეზე.
                                        compact && nav.view === "month" && !pending
                                            ? selected
                                            : nav.anchor,
                                    )
                                }
                                className={`h-8 rounded-lg px-2 text-sm transition-colors duration-300 disabled:opacity-50 ${nav.view === view.value
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
                bodyRef={body}
                dimmed={loading}
                position={`${data.anchor}:${["month", "week", "day"].indexOf(data.view)}`}
            >
                {data.view === "month" ? (
                    <>
                        <CalendarMonth
                            data={data}
                            grouped={grouped}
                            size={size}
                            compact={compact}
                            selected={selected}
                            busy={busy}
                            drag={drag}
                            onDay={compact ? pickDay : onDay}
                            onContent={onContent}
                        />

                        {compact && (
                            <CalendarAgenda
                                days={[selected]}
                                grouped={grouped}
                                today={data.today}
                                busy={busy}
                                onContent={onContent}
                                onNew={onNew}
                            />
                        )}
                    </>
                ) : data.view === "week" && compact ? (
                    // ტელეფონზე კვირის სია მთელ გვერდთან ერთად ისქროლება, ცალკე კონტეინერში არა.
                    <CalendarAgenda
                        days={data.days}
                        grouped={grouped}
                        today={data.today}
                        busy={busy}
                        onContent={onContent}
                        onNew={onNew}
                    />
                ) : (
                    <CalendarTimeline
                        days={data.days}
                        items={items}
                        today={data.today}
                        busy={busy}
                        drag={drag}
                        onDay={onDay}
                        onContent={onContent}
                    />
                )}
            </CalendarTransition>
        </section>
    );
}