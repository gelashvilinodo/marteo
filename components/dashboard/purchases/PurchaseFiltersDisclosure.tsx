"use client";

import {
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
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
  const [desktop, setDesktop] = useState(false);
  const contentId = useId();

  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px)");
    const update = () => setDesktop(media.matches);

    update();
    media.addEventListener("change", update);

    return () => media.removeEventListener("change", update);
  }, []);

  const expanded = desktop || open;

  return (
    <div className="mt-4 min-w-0 overflow-hidden rounded-2xl border border-border bg-surface sm:mt-6">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setOpen(previous => !previous)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent sm:hidden"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon
            icon="solar:magnifer-linear"
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
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
            "h-4 w-4 shrink-0 transition-transform duration-300 ease-in-out motion-reduce:transition-none",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      <div
        id={contentId}
        inert={!expanded}
        aria-hidden={!expanded}
        className={[
          "grid min-w-0 transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none sm:grid-rows-[1fr] sm:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="min-h-0 min-w-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}