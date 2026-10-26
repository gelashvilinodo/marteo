"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@iconify/react";
import type {
    CalendarContent,
    CalendarPageData,
} from "@/lib/content/get-calendar-page";
import {
    calendarToday,
    resolveCalendarPeriod,
    type CalendarView as View,
} from "@/lib/content/calendar-period";
import CalendarBoard from "./CalendarBoard";
import DayPlanDialog from "./DayPlanDialog";
import ContentForm from "./ContentForm";
import ContentDetailsDialog from "./ContentDetailsDialog";
import { PlatformIcon } from "./ContentIcons";
import { contentPlatforms } from "@/lib/content/content-options";
import { contentCardStyle } from "@/lib/content/content-card-style";

type PlatformOperation = {
    id: string;
    updatedAt: string;
    platform: string;
    completed: boolean;
};

function object(value: unknown): Record<string, unknown> | null {
    return value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function localDay(value: string | null) {
    if (!value) return "";

    return new Date(
        new Date(value).getTime() + 4 * 60 * 60 * 1000,
    )
        .toISOString()
        .slice(0, 10);
}

export default function CalendarView({
    initialData,
}: {
    initialData: CalendarPageData;
}) {
    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [day, setDay] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<{
        date: string;
        contentId?: string;
    } | null>(null);

    const periodCache = useRef(
        new Map<string, {
            data: CalendarPageData;
            savedAt: number;
        }>(),
    );

    const request = useRef<AbortController | null>(null);
    const running = useRef(false);
    const retry = useRef<PlatformOperation | null>(null);

    useEffect(() => {
        request.current?.abort();
        periodCache.current.clear();
        periodCache.current.set("initial", {
            data: initialData,
            savedAt: Date.now(),
        });
        setData(initialData);
        setLoading(false);
    }, [initialData]);

    useEffect(() => {
        return () => request.current?.abort();
    }, []);

    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(""), 2000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    async function load(
        view: View,
        anchor: string,
        force = false,
    ) {
        request.current?.abort();
        request.current = null;

        const range = resolveCalendarPeriod({
            view,
            date: anchor,
        });

        const params = new URLSearchParams({
            view,
            date: anchor,
        });

        const cacheKey = `${view}:${range.from}:${range.monthStart}`;

        function apply(next: CalendarPageData) {

            setData(next);
            setError("");

            window.history.replaceState(
                null,
                "",
                `/dashboard/calendar?${params.toString()}`,
            );
        }

        if (force) periodCache.current.clear();

        if (!force) {
            const now = Date.now();
            const today = calendarToday();

            for (const [key, cached] of periodCache.current) {
                if (
                    now - cached.savedAt > 5 * 60 * 1000 ||
                    cached.data.today !== today
                ) {
                    periodCache.current.delete(key);
                    continue;
                }

                const coversPeriod =
                    cached.data.from <= range.from &&
                    cached.data.to >= range.to &&
                    cached.data.monthStart === range.monthStart;

                if (!coversPeriod) continue;

                const next: CalendarPageData = {
                    ...cached.data,
                    view,
                    anchor,
                    from: range.from,
                    to: range.to,
                    days: range.days,
                    calendarItems: cached.data.calendarItems.filter(item => {
                        if (!item.scheduledAt) return false;

                        const scheduled = new Date(item.scheduledAt);
                        return scheduled >= range.start && scheduled < range.end;
                    }),
                };

                apply(next);
                setLoading(false);
                return;
            }
        }

        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        setError("");

        try {
            const response = await fetch(
                `/api/content/calendar?${params.toString()}`,
                {
                    cache: "no-store",
                    credentials: "same-origin",
                    signal: controller.signal,
                },
            );

            const body = object(await response.json());
            const value = object(body?.data);

            if (
                !response.ok ||
                body?.success !== true ||
                !value ||
                !Array.isArray(value.calendarItems) ||
                !Array.isArray(value.todayTasks) ||
                !Array.isArray(value.days) ||
                !object(value.counts)
            ) {
                throw new Error(
                    typeof body?.message === "string"
                        ? body.message
                        : "კალენდარი ვერ განახლდა.",
                );
            }

            if (controller.signal.aborted) return;

            const next = value as unknown as CalendarPageData;

            periodCache.current.delete(cacheKey);
            periodCache.current.set(cacheKey, {
                data: next,
                savedAt: Date.now(),
            });

            // ბრაუზერის ქეში მხოლოდ რამდენიმე ბოლო პერიოდს ინახავს.
            while (periodCache.current.size > 8) {
                const oldest = periodCache.current.keys().next().value;
                if (oldest === undefined) break;
                periodCache.current.delete(oldest);
            }

            apply(next);
        } catch (cause: unknown) {
            if (!controller.signal.aborted) {
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "კალენდარი ვერ განახლდა.",
                );
            }
        } finally {
            if (request.current === controller) {
                request.current = null;
                setLoading(false);
            }
        }
    }

    function changed(message: string) {
        setNotice(message);
        void load(data.view, data.anchor, true);
    }

    function openContent(content: CalendarContent) {
        setDay(null);
        setSelectedId(content.id);
    }

    function openNew(date: string) {
        setDay(null);
        setSelectedId(null);
        setForm({ date });
    }

    async function complete(operation: PlatformOperation) {
        if (running.current) return;

        running.current = true;
        retry.current = operation;
        setSaving(true);
        setError("");

        try {
            const response = await fetch(
                `/api/content/${encodeURIComponent(operation.id)}`,
                {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "platform",
                        platform: operation.platform,
                        completed: operation.completed,
                        updatedAt: operation.updatedAt,
                    }),
                },
            );

            const body = object(
                await response.json().catch(() => null),
            );

            if (response.ok && body?.success === true) {
                retry.current = null;
                setNotice(
                    operation.completed
                        ? "პლატფორმაზე შესრულება მოინიშნა."
                        : "შესრულების მონიშვნა მოიხსნა.",
                );
                await load(data.view, data.anchor, true);
                return;
            }

            if (response.status >= 400 && response.status < 500) {
                retry.current = null;
            }

            setError(
                typeof body?.message === "string"
                    ? body.message
                    : "მოქმედების შედეგი ვერ დადასტურდა.",
            );
        } catch {
            setError(
                "მოქმედების შედეგი ვერ დადასტურდა. სცადე ხელახლა იგივე მოთხოვნით.",
            );
        } finally {
            running.current = false;
            setSaving(false);
        }
    }

    const busy = loading || saving || retry.current !== null;
    const panel =
        "min-w-0 rounded-2xl border border-border bg-surface p-4";

    const cards = [
        {
            title: "ამ თვეში დაგეგმილი",
            value: data.counts.planned,
            icon: "solar:calendar-linear",
            tone: "bg-accent/10 text-accent",
        },
        {
            title: "გამოქვეყნებული",
            value: data.counts.published,
            icon: "solar:check-circle-linear",
            tone: "bg-success/10 text-success",
        },
        {
            title: "ვადაგადაცილებული",
            value: data.counts.overdue,
            icon: "solar:clock-circle-linear",
            tone: "bg-warning/10 text-warning",
        },
    ];

    return (
        <main className="min-w-0 p-4 sm:p-6 lg:p-8">
            <div className="mx-auto min-w-0 max-w-7xl space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-2xl font-semibold text-text-primary">
                        კონტენტ-კალენდარი
                    </h1>

                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => openNew(data.anchor)}
                        className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        <Icon
                            icon="solar:add-circle-linear"
                            className="h-5 w-5"
                        />
                        ახალი კონტენტი
                    </button>
                </div>

                {(loading || saving) && (
                    <p
                        role="status"
                        className="flex items-center gap-2 text-xs text-text-secondary"
                    >
                        <Icon
                            icon="solar:refresh-linear"
                            className="h-4 w-4 animate-spin"
                        />
                        {saving ? "ინახება…" : "კალენდარი იტვირთება…"}
                    </p>
                )}

                {error && (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-3"
                    >
                        <p className="text-sm text-red-400">{error}</p>

                        <button
                            type="button"
                            disabled={loading || saving}
                            onClick={() => {
                                if (retry.current) {
                                    void complete(retry.current);
                                } else {
                                    void load(data.view, data.anchor, true);
                                }
                            }}
                            className="rounded-lg border border-border px-3 py-2 text-sm text-text-primary disabled:opacity-50"
                        >
                            ხელახლა ცდა
                        </button>
                    </div>
                )}

                <div className="grid min-w-0 grid-cols-3 items-start gap-2 sm:gap-3 xl:grid-cols-5">
                    {cards.map(card => (
                        <section
                            key={card.title}
                            className="flex h-36 min-w-0 flex-col rounded-2xl border border-border bg-surface p-3 sm:h-40 sm:p-4"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span
                                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${card.tone}`}
                                >
                                    <Icon icon={card.icon} className="h-5 w-5" />
                                </span>

                                <p className="text-xl font-semibold tabular-nums text-text-primary sm:text-2xl">
                                    {card.value}
                                </p>
                            </div>

                            <h2
                                title={card.title}
                                className="mt-3 text-[11px] leading-4 text-text-secondary sm:text-sm"
                            >
                                <span className="sm:hidden">
                                    {card.title === "ამ თვეში დაგეგმილი"
                                        ? "დაგეგმილი"
                                        : card.title === "გამოქვეყნებული"
                                            ? "გამოქვეყნებული"
                                            : "დაგვიანებული"}
                                </span>
                                <span className="hidden sm:inline">{card.title}</span>
                            </h2>

                            <p className="mt-auto pt-2 text-[10px] text-text-secondary sm:text-xs">
                                {card.title === "ვადაგადაცილებული"
                                    ? ""
                                    : data.monthStart.slice(0, 7)}
                            </p>
                        </section>
                    ))}

                    <section className="col-span-3 flex h-44 min-w-0 flex-col rounded-2xl border border-border bg-surface p-3 sm:p-4 xl:col-span-2 xl:h-40">
                        <div className="flex shrink-0 items-center justify-between gap-3">
                            <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                                <Icon
                                    icon="solar:checklist-minimalistic-linear"
                                    className="h-5 w-5 shrink-0 text-accent"
                                />
                                დღევანდელი დავალებები
                            </h2>

                            <span className="text-xs tabular-nums text-text-secondary">
                                {data.todayTasks.length}
                            </span>
                        </div>

                        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
                            {data.todayTasks.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => openContent(item)}
                                    title={item.title}
                                    style={contentCardStyle(item, data.today)}
                                    className="block w-full rounded-xl border border-border bg-background px-3 py-2 text-left transition-colors hover:border-accent disabled:opacity-50"
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

                                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                        {item.channels
                                            .filter(channel => !channel.completedAt)
                                            .map(channel => (
                                                <span
                                                    key={channel.id}
                                                    className="inline-flex items-center gap-1.5"
                                                >
                                                    <PlatformIcon
                                                        platform={channel.platform}
                                                        customPlatform={channel.customPlatform}
                                                        className="h-3.5 w-3.5"
                                                    />

                                                    <span className="text-[11px] text-text-secondary">
                                                        {channel.platform === "OTHER"
                                                            ? channel.customPlatform ||
                                                            "სხვა პლატფორმა"
                                                            : contentPlatforms.find(
                                                                platform =>
                                                                    platform.value ===
                                                                    channel.platform,
                                                            )?.label ?? channel.platform}
                                                    </span>
                                                </span>
                                            ))}

                                        {item.overdue && (
                                            <span className="text-[10px] tabular-nums text-text-secondary">
                                                {localDay(item.scheduledAt)
                                                    .split("-")
                                                    .reverse()
                                                    .join(".")}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            ))}

                            {data.todayTasks.length === 0 && (
                                <p className="py-4 text-center text-sm text-text-secondary">
                                    შესასრულებელი კონტენტი არ არის.
                                </p>
                            )}
                        </div>
                    </section>
                </div>

                <CalendarBoard
                    data={data}
                    busy={busy}
                    onNavigate={(view, date) => void load(view, date)}
                    onDay={setDay}
                    onContent={openContent}
                />
            </div>

            {day && (
                <DayPlanDialog
                    day={day}
                    items={data.calendarItems.filter(
                        item => localDay(item.scheduledAt) === day,
                    )}
                    onClose={() => setDay(null)}
                    onContent={openContent}
                    onNew={openNew}
                />
            )}

            {form && (
                <ContentForm
                    contentId={form.contentId}
                    defaultDate={form.date}
                    onClose={() => setForm(null)}
                    onSaved={message => {
                        setForm(null);
                        changed(message);
                    }}
                />
            )}

            {selectedId && (
                <ContentDetailsDialog
                    contentId={selectedId}
                    onClose={() => setSelectedId(null)}
                    onEdit={id => {
                        setSelectedId(null);
                        setForm({
                            contentId: id,
                            date: data.anchor,
                        });
                    }}
                    onChanged={changed}
                />
            )}

            {notice &&
                createPortal(
                    <div
                        role="status"
                        className="fixed bottom-4 right-4 z-[1000] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-success/30 bg-surface px-4 py-3 text-text-primary shadow-xl"
                    >
                        <Icon
                            icon="solar:check-circle-linear"
                            className="h-5 w-5 shrink-0 text-success"
                        />
                        <span className="text-sm">{notice}</span>
                        <button
                            type="button"
                            aria-label="შეტყობინების დახურვა"
                            onClick={() => setNotice("")}
                        >
                            <Icon
                                icon="solar:close-circle-linear"
                                className="h-5 w-5 text-text-secondary"
                            />
                        </button>
                    </div>,
                    document.body,
                )}
        </main>
    );
}