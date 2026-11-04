import type { DragEvent } from "react";
import type { CalendarContent } from "@/lib/content/get-calendar-page";

// minutes: null — თვის უჯრაზე გადატანისას დრო იგივე რჩება, იცვლება მხოლოდ დღე.
export type CalendarDropTarget = { day: string; minutes: number | null };

export type CalendarDrag = {
    item: CalendarContent | null;
    // მაჩვენებლის დაშორება ბარათის ზედა კიდიდან, რომ ბარათი იქ დაეცეს, სადაც ჩანს.
    offset: number;
    target: CalendarDropTarget | null;
    canMove: (item: CalendarContent) => boolean;
    start: (item: CalendarContent, event: DragEvent<HTMLElement>) => void;
    over: (target: CalendarDropTarget, event: DragEvent<HTMLElement>) => void;
    drop: (target: CalendarDropTarget, event: DragEvent<HTMLElement>) => void;
    end: () => void;
};

export function minutesLabel(minutes: number) {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
