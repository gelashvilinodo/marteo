"use client";

import { Icon } from "@iconify/react";
import { PlatformIcon } from "./ContentIcons";

const platforms: Record<string, { label: string; icon: string }> = {
    INSTAGRAM: {
        label: "Instagram",
        icon: "logos:instagram-icon",
    },
    FACEBOOK: {
        label: "Facebook",
        icon: "logos:facebook",
    },
    TIKTOK: {
        label: "TikTok",
        icon: "logos:tiktok-icon",
    },
    WEBSITE: {
        label: "ვებსაიტი",
        icon: "solar:global-linear",
    },
    YOUTUBE: {
        label: "YouTube",
        icon: "logos:youtube-icon",
    },
    LINKEDIN: {
        label: "LinkedIn",
        icon: "logos:linkedin-icon",
    },
};

export default function PlatformBadge({
    platform,
    customPlatform,
    completedAt,
    compact = false,
    disabled = false,
    onToggle,
}: {
    platform: string;
    customPlatform?: string | null;
    completedAt: string | null;
    compact?: boolean;
    disabled?: boolean;
    onToggle?: () => void;
}) {
    const item = platforms[platform] ?? {
        label: platform,
        icon: "solar:global-linear",
    };

    const label =
        platform === "OTHER"
            ? customPlatform || "სხვა პლატფორმა"
            : item.label;

    const completed = completedAt !== null;

    const className =
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 " +
        "text-xs transition-colors " +
        (completed
            ? "border-success/20 bg-success/5 text-success"
            : "border-border bg-background text-text-secondary");

    const children = (
        <>
            <PlatformIcon
                platform={platform}
                customPlatform={customPlatform}
                className="h-5 w-5"
            />

            {!compact && <span>{label}</span>}

            <Icon
                icon={
                    completed
                        ? "solar:check-circle-bold"
                        : "solar:stop-linear"
                }
                className="h-4 w-4 shrink-0"
            />
        </>
    );

    if (onToggle) {
        return (
            <button
                type="button"
                disabled={disabled}
                aria-pressed={completed}
                aria-label={`${label}: ${completed
                    ? "შესრულებულია; მონიშვნის მოხსნა"
                    : "შესრულების მონიშვნა"
                    }`}
                onClick={event => {
                    event.stopPropagation();
                    onToggle();
                }}
                className={`${className} min-h-10 hover:border-accent disabled:opacity-50`}
            >
                {children}
            </button>
        );
    }

    return (
        <span
            title={`${label} — ${completed ? "შესრულებულია" : "შესასრულებელია"
                }`}
            className={className}
        >
            {children}
        </span>
    );
}