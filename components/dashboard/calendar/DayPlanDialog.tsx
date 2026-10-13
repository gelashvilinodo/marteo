"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "@iconify/react";
import type { CalendarContent } from "@/lib/content/get-calendar-page";
import PlatformBadge from "./PlatformBadge";

export default function DayPlanDialog({
    day,
    items,
    onClose,
    onContent,
    onNew,
}: {
    day: string;
    items: CalendarContent[];
    onClose: () => void;
    onContent: (content: CalendarContent) => void;
    onNew: (day: string) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [year, month, date] = day.split("-");

    useEffect(() => {
        dialog.current?.showModal();
        return () => dialog.current?.close();
    }, []);

    function time(value: string | null) {
        if (!value) return "";

        return new Date(
            new Date(value).getTime() + 4 * 60 * 60 * 1000,
        )
            .toISOString()
            .slice(11, 16);
    }

    return (
        <dialog
            ref={dialog}
            aria-labelledby={titleId}
            onCancel={event => {
                event.preventDefault();
                onClose();
            }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-left text-text-primary backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        >
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                <div>
                    <h2 id={titleId} className="font-semibold">
                        დღის გეგმა
                    </h2>
                    <p className="mt-1 text-xs tabular-nums text-text-secondary">
                        {date}.{month}.{year} · {items.length} კონტენტი
                    </p>
                </div>

                <button
                    type="button"
                    aria-label="დახურვა"
                    onClick={onClose}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-text-secondary"
                >
                    <Icon
                        icon="solar:close-circle-linear"
                        className="h-5 w-5"
                    />
                </button>
            </div>

            <div className="space-y-3 p-4">
                {items.map(item => (
                    <div
                        key={item.id}
                        className={`rounded-xl border border-border bg-background p-3 ${
                            item.status === "CANCELED" ? "opacity-50" : ""
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => onContent(item)}
                            className="flex w-full items-start justify-between gap-3 text-left"
                        >
                            <span className="min-w-0 break-words text-sm font-semibold">
                                {item.title}
                            </span>

                            <span className="shrink-0 text-xs tabular-nums text-text-secondary">
                                {time(item.scheduledAt)}
                            </span>
                        </button>

                        <div className="mt-3 flex flex-wrap gap-2">
                            {item.channels.map(channel => (
                                <PlatformBadge
                                    key={channel.id}
                                    platform={channel.platform}
                                    customPlatform={channel.customPlatform}
                                    completedAt={channel.completedAt}
                                />
                            ))}
                        </div>

                        {item.status === "PUBLISHED" && (
                            <p className="mt-2 text-xs text-success">
                                ყველა პლატფორმაზე შესრულებულია
                            </p>
                        )}

                        {item.status === "CANCELED" && (
                            <p className="mt-2 text-xs text-text-secondary">
                                გაუქმებულია
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={() => onContent(item)}
                            className="mt-3 text-xs text-accent"
                        >
                            დეტალების ნახვა
                        </button>
                    </div>
                ))}

                {items.length === 0 && (
                    <div className="py-8 text-center">
                        <Icon
                            icon="solar:calendar-linear"
                            className="mx-auto h-8 w-8 text-accent"
                        />
                        <p className="mt-3 text-sm text-text-secondary">
                            ამ დღეს კონტენტი დაგეგმილი არ არის.
                        </p>
                    </div>
                )}
            </div>

            <div className="border-t border-border p-4">
                <button
                    type="button"
                    onClick={() => onNew(day)}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white"
                >
                    <Icon
                        icon="solar:add-circle-linear"
                        className="h-5 w-5"
                    />
                    ამ დღეზე კონტენტის დამატება
                </button>
            </div>
        </dialog>
    );
}