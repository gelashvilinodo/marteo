"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";

type Props = {
    children: ReactNode;
    defaultOpen?: boolean;
    hasFilters: boolean;
};

export default function InventoryFiltersDisclosure({
    children,
    defaultOpen = false,
    hasFilters,
}: Props) {
    const [open, setOpen] = useState(defaultOpen);
    const contentId = useId();

    return (
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={contentId}
                onClick={() => setOpen((previous) => !previous)}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            >
                <span className="flex items-center gap-2">
                    <Icon
                        icon="solar:magnifer-linear"
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-accent"
                    />

                    ძებნა და ფილტრები

                    {hasFilters && (
                        <span
                            aria-label="ფილტრი აქტიურია"
                            className="h-2 w-2 shrink-0 rounded-full bg-accent"
                        />
                    )}
                </span>

                <Icon
                    icon="solar:alt-arrow-down-linear"
                    aria-hidden="true"
                    className={[
                        "h-4 w-4 shrink-0 transition-transform duration-250 ease-in-out motion-reduce:transition-none",
                        open ? "rotate-180" : "",
                    ].join(" ")}
                />
            </button>

            <div
                id={contentId}
                inert={!open}
                aria-hidden={!open}
                className={[
                    "grid transition-[grid-template-rows,opacity] duration-250 ease-in-out motion-reduce:transition-none",
                    open
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0",
                ].join(" ")}
            >
                <div className="min-h-0 overflow-hidden">
                    {children}
                </div>
            </div>
        </div>
    );
}