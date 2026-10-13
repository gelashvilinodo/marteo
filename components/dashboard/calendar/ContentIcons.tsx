"use client";

import { useId } from "react";
import { Icon } from "@iconify/react";

export function PlatformIcon({
    platform,
    customPlatform,
    className = "h-4 w-4",
}: {
    platform: string;
    customPlatform?: string | null;
    className?: string;
}) {
    const gradientId = useId();

    if (platform === "INSTAGRAM") {
        return (
            <svg
                viewBox="0 0 24 24"
                aria-label="Instagram"
                role="img"
                className={`${className} shrink-0`}
            >
                <defs>
                    <linearGradient
                        id={gradientId}
                        x1="0"
                        y1="1"
                        x2="1"
                        y2="0"
                    >
                        <stop offset="0%" stopColor="#feda75" />
                        <stop offset="35%" stopColor="#fa7e1e" />
                        <stop offset="60%" stopColor="#d62976" />
                        <stop offset="80%" stopColor="#962fbf" />
                        <stop offset="100%" stopColor="#4f5bd5" />
                    </linearGradient>
                </defs>
                <rect
                    width="24"
                    height="24"
                    rx="6"
                    fill={`url(#${gradientId})`}
                />
                <rect
                    x="5"
                    y="5"
                    width="14"
                    height="14"
                    rx="4"
                    fill="none"
                    stroke="white"
                    strokeWidth="1.7"
                />
                <circle
                    cx="12"
                    cy="12"
                    r="3.3"
                    fill="none"
                    stroke="white"
                    strokeWidth="1.7"
                />
                <circle cx="16.6" cy="7.5" r="1" fill="white" />
            </svg>
        );
    }

    const icons: Record<string, string> = {
        FACEBOOK: "logos:facebook",
        TIKTOK: "logos:tiktok-icon",
        WEBSITE: "solar:global-linear",
        OTHER: "solar:layers-minimalistic-linear",
        YOUTUBE: "logos:youtube-icon",
        LINKEDIN: "logos:linkedin-icon",
    };

    return (
        <span
            title={
                platform === "OTHER"
                    ? customPlatform || "სხვა პლატფორმა"
                    : platform === "WEBSITE"
                        ? "ვებსაიტი"
                        : platform
            }
            className={`inline-flex shrink-0 items-center justify-center ${className} ${platform === "TIKTOK"
                ? "rounded bg-white p-0.5"
                : platform === "WEBSITE"
                    ? "text-success"
                    : "text-accent"
                }`}
        >
            <Icon
                icon={icons[platform] ?? "solar:global-linear"}
                className="h-full w-full"
            />
        </span>
    );
}

export function ContentTypeIcon({ type }: { type: string }) {
    const icons: Record<string, string> = {
        POST: "solar:gallery-linear",
        REEL: "solar:clapperboard-play-linear",
        STORY: "solar:smartphone-linear",
        VIDEO: "solar:videocamera-record-linear",
        ARTICLE: "solar:document-text-linear",
        OTHER: "solar:widget-linear",
    };

    return (
        <Icon
            icon={icons[type] ?? icons.OTHER}
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-accent"
        />
    );
}