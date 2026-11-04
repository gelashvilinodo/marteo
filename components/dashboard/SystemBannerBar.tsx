"use client";

import { Icon } from "@iconify/react";
import { useState, useSyncExternalStore } from "react";
import type { ActiveBanner } from "@/lib/system/active-banner";

const storageKey = (id: string) => `marteo-banner-closed:${id}`;

// Closing hides this banner on this device only; a new banner shows again.
export default function SystemBannerBar({ banner }: { banner: ActiveBanner }) {
    const [dismissed, setDismissed] = useState(false);
    // Hidden on the server and until storage is read, so a closed banner never flashes.
    const stored = useSyncExternalStore(() => () => undefined, () => {
        try { return localStorage.getItem(storageKey(banner.id)) === "1"; } catch { return false; }
    }, () => true);
    const closed = dismissed || stored;

    if (closed) return null;
    const warning = banner.tone === "WARNING";

    return <div role="status" className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${warning ? "border-warning/30 bg-warning/10 text-text-primary" : "border-accent/30 bg-accent/10 text-text-primary"}`}>
        <Icon icon={warning ? "solar:danger-triangle-bold-duotone" : "solar:info-circle-bold-duotone"} className={`mt-0.5 h-5 w-5 shrink-0 ${warning ? "text-warning" : "text-accent"}`} aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words leading-6">{banner.message}</p>
        <button type="button" aria-label="დახურვა" onClick={() => {
            setDismissed(true);
            try { localStorage.setItem(storageKey(banner.id), "1"); } catch { /* Closed for this visit only. */ }
        }} className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-black/5 hover:text-text-primary">
            <Icon icon="solar:close-circle-linear" className="h-5 w-5" aria-hidden="true" />
        </button>
    </div>;
}
