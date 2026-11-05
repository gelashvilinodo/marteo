"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@iconify/react";
import type {
    CalendarContent,
    CalendarPageData,
} from "@/lib/content/get-calendar-page";
import {
    calendarLocalParts,
    calendarToday,
    resolveCalendarPeriod,
    type CalendarView as View,
} from "@/lib/content/calendar-period";
import CalendarBoard from "./CalendarBoard";
import DayPlanDialog from "./DayPlanDialog";
import ContentForm from "./ContentForm";
import ContentDetailsDialog from "./ContentDetailsDialog";
import { CalendarStats, TodayTasks } from "./CalendarSummary";
import GuidedTour from "@/components/tour/GuidedTour";
import TourHelpButton from "@/components/tour/TourHelpButton";
import { useTour } from "@/components/tour/useTour";
import { calendarTourSteps } from "./calendar-tour";

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
    return value ? calendarLocalParts(value).day : "";
}

export default function CalendarView({
    initialData,
    showTour = false,
}: {
    initialData: CalendarPageData;
    showTour?: boolean;
}) {
    const tour = useTour("calendar", showTour);
    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(false);
    // ჩატვირთვისას უკვე მოთხოვნილი პერიოდი: სათაური და ნავიგაცია მისგან გრძელდება,
    // ამიტომ „შემდეგზე“ ზედიზედ დაჭერა ჩატვირთვის დასრულებას არ ელოდება.
    const [pending, setPending] = useState<{
        view: View;
        anchor: string;
    } | null>(null);
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

    const latestLoad = useRef<typeof load>(null);

    useEffect(() => {
        latestLoad.current = load;
    });

    // ბრაუზერის „უკან/წინ“ წინა პერიოდზე აბრუნებს; ისტორიაში ახალი ჩანაწერი აღარ ემატება.
    useEffect(() => {
        function restore() {
            if (window.location.pathname !== "/dashboard/calendar") return;

            const params = new URLSearchParams(window.location.search);
            const range = resolveCalendarPeriod({
                view: params.get("view") ?? "",
                date: params.get("date") ?? "",
            });

            void latestLoad.current?.(range.view, range.anchor, false, "none");
        }

        window.addEventListener("popstate", restore);
        return () => window.removeEventListener("popstate", restore);
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
        history: "push" | "replace" | "none" = "push",
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
            setPending(null);

            const url = `/dashboard/calendar?${params.toString()}`;
            const same =
                `${window.location.pathname}${window.location.search}` === url;

            if (history === "push" && !same) {
                window.history.pushState(null, "", url);
            } else if (history !== "none") {
                window.history.replaceState(null, "", url);
            }
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
        setPending({ view, anchor });
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
                setPending(null);
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
        void load(data.view, data.anchor, true, "replace");
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
                await load(data.view, data.anchor, true, "replace");
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
                "მოქმედების შედეგი ვერ დადასტურდა. სცადეთ ხელახლა იგივე მოთხოვნით.",
            );
        } finally {
            running.current = false;
            setSaving(false);
        }
    }

    // გადატანა მაშინვე ჩანს ბადეზე; შეცდომისას კალენდარი სერვერიდან თავიდან იტვირთება.
    async function move(content: CalendarContent, date: string, time: string) {
        if (running.current) return;

        running.current = true;
        setSaving(true);
        setError("");

        const scheduledAt = new Date(`${date}T${time}:00+04:00`).toISOString();

        setData(current => ({
            ...current,
            calendarItems: current.calendarItems.map(item =>
                item.id === content.id ? { ...item, scheduledAt } : item,
            ),
        }));

        let failure = "";

        try {
            const response = await fetch(
                `/api/content/${encodeURIComponent(content.id)}`,
                {
                    method: "PATCH",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "schedule",
                        scheduledDate: date,
                        scheduledTime: time,
                        updatedAt: content.updatedAt,
                    }),
                },
            );

            const body = object(
                await response.json().catch(() => null),
            );

            if (response.ok && body?.success === true) {
                setNotice(
                    `„${content.title}“ გადაიტანა: ${date.split("-").reverse().join(".")}, ${time}`,
                );
            } else {
                failure =
                    typeof body?.message === "string"
                        ? body.message
                        : "კონტენტი ვერ გადაიტანა.";
            }
        } catch {
            failure = "კონტენტი ვერ გადაიტანა. შეამოწმეთ კავშირი და სცადეთ ხელახლა.";
        } finally {
            running.current = false;
            setSaving(false);
        }

        // ჩატვირთვა შეცდომას ასუფთავებს, ამიტომ გადატანის შეცდომა მის შემდეგ ჩნდება.
        await load(data.view, data.anchor, true, "replace");
        if (failure) setError(failure);
    }

    // ჩატვირთვა არაფერს ბლოკავს: ძველი მოთხოვნა უქმდება. ბლოკავს მხოლოდ შენახვა.
    const busy = saving || retry.current !== null;

    // lg+ ეკრანზე კალენდარი ხილული არის მთელ სიმაღლეს იკავებს: 100dvh-ს აკლდება
    // sticky header (4rem), ზემოთ დაშორება (1rem), ქვედა padding (1.5rem) და AI ზოლი (2.75rem).
    // ბოლომდე ჩასქროლვისას ზედა ბარათები იმალება, კალენდარი კი სრულად ჩანს და AI ზოლს არ ხვდება.
    return (
        <main className="min-w-0 p-4 sm:p-6 lg:px-8 lg:py-6">
            <GuidedTour steps={calendarTourSteps} open={tour.open} onClose={tour.close} />
            <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4 2xl:max-w-[120rem]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <h1 className="text-2xl font-semibold text-text-primary">
                            კონტენტ-კალენდარი
                        </h1>
                        <TourHelpButton onClick={tour.start} />

                        {(loading || saving) && (
                            <p
                                role="status"
                                className="flex items-center gap-2 text-xs text-text-secondary"
                            >
                                <Icon
                                    icon="solar:refresh-linear"
                                    className="h-4 w-4 animate-spin"
                                />
                                {saving ? "ინახება…" : "იტვირთება…"}
                            </p>
                        )}
                    </div>

                    <button
                        type="button"
                        data-tour="new-content"
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
                                    void load(data.view, data.anchor, true, "replace");
                                }
                            }}
                            className="rounded-lg border border-border px-3 py-2 text-sm text-text-primary disabled:opacity-50"
                        >
                            ხელახლა ცდა
                        </button>
                    </div>
                )}

                <div className="flex min-w-0 flex-col gap-4 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-rows-[max(26rem,calc(100dvh-9.25rem))]">
                    <div className="grid min-w-0 gap-3 lg:grid-cols-[auto_minmax(0,1fr)] 2xl:order-2 2xl:flex 2xl:min-h-0 2xl:flex-col">
                        <CalendarStats counts={data.counts} />

                        <TodayTasks
                            tasks={data.todayTasks}
                            today={data.today}
                            busy={busy}
                            onOpen={openContent}
                        />
                    </div>

                    <CalendarBoard
                        data={data}
                        busy={busy}
                        loading={loading}
                        pending={pending}
                        onNavigate={(view, date) => void load(view, date)}
                        onDay={setDay}
                        onContent={openContent}
                        onNew={openNew}
                        onMove={(content, date, time) => void move(content, date, time)}
                    />
                </div>
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
                        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[1000] flex items-center gap-3 rounded-xl border border-success/30 bg-surface px-4 py-3 text-text-primary shadow-xl sm:left-auto sm:max-w-[calc(100vw-2rem)] lg:bottom-14"
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