import type { CSSProperties } from "react";
import { calendarLocalParts } from "./calendar-period";

type StyledContent = {
    status: string;
    scheduledAt: string | null;
    channels: Array<{
        platform: string;
        completedAt: string | null;
    }>;
};

const colors: Record<string, string[]> = {
    INSTAGRAM: ["253, 183, 75", "214, 41, 118", "150, 47, 191"],
    FACEBOOK: ["24, 119, 242"],
    TIKTOK: ["37, 244, 238", "254, 44, 85"],
    YOUTUBE: ["255, 0, 0"],
    WEBSITE: ["22, 196, 91"],
    OTHER: ["89, 139, 237"],
    LINKEDIN: ["10, 102, 194"],
};

// პლატფორმის ერთი წარმომადგენლობითი ფერი (მრავალფეროვანი ლოგოსთვის შუა ფერი).
export function contentPlatformColor(platform: string | undefined) {
    const palette = colors[platform ?? "OTHER"] ?? colors.OTHER;
    return `rgb(${palette[Math.floor(palette.length / 2)]})`;
}

export type ContentState = "planned" | "overdue" | "done" | "canceled";

// ერთი წესი ბარათის ფერისთვის, სტატუსის წარწერისა და ფილტრისთვის.
export function contentState(item: StyledContent, today: string): ContentState {
    if (item.status === "CANCELED") return "canceled";

    const finished =
        item.channels.length > 0 &&
        item.channels.every(channel => channel.completedAt !== null);

    if (finished) return "done";

    return item.scheduledAt &&
        calendarLocalParts(item.scheduledAt).day < today
        ? "overdue"
        : "planned";
}

export function contentCardStyle(
    item: StyledContent,
    today: string,
): CSSProperties {
    const state = contentState(item, today);

    const palette = [
        ...new Set(
            item.channels.flatMap(
                channel => colors[channel.platform] ?? colors.OTHER,
            ),
        ),
    ];

    const stops = palette.map(
        color => `rgba(${color}, var(--content-tint-opacity, 0.09))`,
    );

    return {
        backgroundColor: "var(--color-background)",
        backgroundImage:
            stops.length > 0
                ? `linear-gradient(120deg, ${stops.length === 1
                    ? `${stops[0]}, ${stops[0]}`
                    : stops.join(", ")
                })`
                : undefined,
        borderColor:
            state === "done"
                ? "var(--color-success)"
                : state === "overdue"
                    ? "var(--color-danger)"
                    : undefined,
    };
}