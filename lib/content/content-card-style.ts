import type { CSSProperties } from "react";

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

export function contentCardStyle(
    item: StyledContent,
    today: string,
): CSSProperties {
    const finished =
        item.channels.length > 0 &&
        item.channels.every(channel => channel.completedAt !== null);

    const scheduledDay = item.scheduledAt
        ? new Date(
            new Date(item.scheduledAt).getTime() +
            4 * 60 * 60 * 1000,
        )
            .toISOString()
            .slice(0, 10)
        : null;

    const overdue =
        item.status !== "CANCELED" &&
        !finished &&
        scheduledDay !== null &&
        scheduledDay < today;

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
            item.status === "CANCELED"
                ? undefined
                : finished
                    ? "var(--color-success)"
                    : overdue
                        ? "var(--color-danger)"
                        : undefined,
    };
}