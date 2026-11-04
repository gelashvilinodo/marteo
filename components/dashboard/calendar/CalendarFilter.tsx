"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";
import { contentPlatforms } from "@/lib/content/content-options";
import type { ContentState } from "@/lib/content/content-card-style";
import { PlatformIcon } from "./ContentIcons";

export type CalendarFilters = {
    platforms: string[];
    states: ContentState[];
};

export const emptyCalendarFilters: CalendarFilters = {
    platforms: [],
    states: [],
};

const stateOptions: { value: ContentState; label: string }[] = [
    { value: "planned", label: "დაგეგმილი" },
    { value: "overdue", label: "დაგვიანებული" },
    { value: "done", label: "შესრულებული" },
    { value: "canceled", label: "გაუქმებული" },
];

function toggle<T>(list: T[], value: T) {
    return list.includes(value)
        ? list.filter(item => item !== value)
        : [...list, value];
}

function Chip({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${active
                ? "border-accent bg-accent/10 text-text-primary"
                : "border-border text-text-secondary hover:border-accent/50"
                }`}
        >
            {children}
        </button>
    );
}

// ფილტრი მხოლოდ ბადეზე მოქმედებს; ზედა მაჩვენებლები მთელ ბიზნესს ითვლის.
export default function CalendarFilter({
    value,
    onChange,
}: {
    value: CalendarFilters;
    onChange: (value: CalendarFilters) => void;
}) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const panelId = useId();
    const active = value.platforms.length + value.states.length;

    useEffect(() => {
        if (!open) return;

        function outside(event: PointerEvent) {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        }

        function escape(event: KeyboardEvent) {
            if (event.key === "Escape") setOpen(false);
        }

        document.addEventListener("pointerdown", outside);
        document.addEventListener("keydown", escape);
        return () => {
            document.removeEventListener("pointerdown", outside);
            document.removeEventListener("keydown", escape);
        };
    }, [open]);

    return (
        <div ref={root} className="relative">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={active ? `ფილტრი: ${active} არჩეული` : "ფილტრი"}
                onClick={() => setOpen(current => !current)}
                className={`relative flex h-10 items-center gap-1.5 rounded-xl border px-3 text-sm ${active
                    ? "border-accent text-accent"
                    : "border-border text-text-primary"
                    }`}
            >
                <Icon icon="solar:filter-linear" className="h-5 w-5" />
                <span className="hidden md:inline">ფილტრი</span>
                {active > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold tabular-nums text-white">
                        {active}
                    </span>
                )}
            </button>

            {open && (
                <div
                    id={panelId}
                    className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-4 shadow-xl sm:left-auto sm:right-0"
                >
                    <p className="text-xs font-semibold text-text-secondary">
                        პლატფორმა
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {contentPlatforms.map(platform => (
                            <Chip
                                key={platform.value}
                                active={value.platforms.includes(platform.value)}
                                onClick={() =>
                                    onChange({
                                        ...value,
                                        platforms: toggle(value.platforms, platform.value),
                                    })
                                }
                            >
                                <PlatformIcon
                                    platform={platform.value}
                                    customPlatform={null}
                                    className="h-3.5 w-3.5"
                                />
                                {platform.label}
                            </Chip>
                        ))}
                    </div>

                    <p className="mt-4 text-xs font-semibold text-text-secondary">
                        სტატუსი
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {stateOptions.map(state => (
                            <Chip
                                key={state.value}
                                active={value.states.includes(state.value)}
                                onClick={() =>
                                    onChange({
                                        ...value,
                                        states: toggle(value.states, state.value),
                                    })
                                }
                            >
                                {state.label}
                            </Chip>
                        ))}
                    </div>

                    {active > 0 && (
                        <button
                            type="button"
                            onClick={() => onChange(emptyCalendarFilters)}
                            className="mt-4 text-xs text-accent"
                        >
                            ფილტრის გასუფთავება
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
