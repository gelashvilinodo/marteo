"use client";

import { useCallback, useRef, useState } from "react";
import type { TourId } from "@/lib/tours/tour-ids";

// autoStart: მომხმარებელს ეს ტური ჯერ არ უნახავს. დახურვისას ერთხელ ინახება.
export function useTour(tour: TourId, autoStart: boolean) {
    const [open, setOpen] = useState(autoStart);
    const unsaved = useRef(autoStart);
    const start = useCallback(() => setOpen(true), []);
    const close = useCallback(() => {
        setOpen(false);
        if (!unsaved.current) return;
        unsaved.current = false;
        void fetch("/api/profile/tours", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tour }),
        }).catch(() => {});
    }, [tour]);
    return { open, start, close };
}
