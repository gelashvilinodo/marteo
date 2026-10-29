"use client";

import { Icon } from "@iconify/react";

import { openCookieSettings } from "@/lib/consent/cookie-consent";

export default function CookieSettingsButton({ className }: { className?: string }) {
    return (
        <button type="button" onClick={openCookieSettings} className={className}>
            <Icon icon="ph:cookie-duotone" className="h-4 w-4 shrink-0" />
            ქუქის პარამეტრები
        </button>
    );
}
