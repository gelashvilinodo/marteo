"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";

type Props = {
  children: ReactNode;
  defaultOpen: boolean;
  hasFilters: boolean;
};

export default function PurchaseFiltersDisclosure({
  children,
  defaultOpen,
  hasFilters,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className="mt-4 rounded-2xl border border-border bg-surface sm:mt-6">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((previous) => !previous)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-text-primary sm:hidden"
      >
        <span className="flex items-center gap-2">
          <Icon
            icon="solar:magnifer-linear"
            className="h-4 w-4"
            aria-hidden="true"
          />

          ძებნა და ფილტრები

          {hasFilters && (
            <span
              aria-label="ფილტრი აქტიურია"
              className="h-2 w-2 rounded-full bg-accent"
            />
          )}
        </span>

        <Icon
          icon="solar:alt-arrow-down-linear"
          aria-hidden="true"
          className={[
            "h-4 w-4 transition-transform motion-reduce:transition-none",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      <div
        id={contentId}
        className={open ? "block" : "hidden sm:block"}
      >
        {children}
      </div>
    </div>
  );
}