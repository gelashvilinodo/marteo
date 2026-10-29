"use client";

import { useEffect, useState } from "react";

// Polls an unread counter while the tab is visible; re-checks on navigation so
// opening the chat clears the badge right away.
export function useSupportUnread(endpoint: string, pathname: string, intervalMs = 15000) {
    const [unread, setUnread] = useState(0);
    useEffect(() => {
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tick = async () => {
            if (!document.hidden) {
                try {
                    const response = await fetch(endpoint, { cache: "no-store" });
                    if (response.ok && !stopped) setUnread((await response.json() as { unread: number }).unread);
                } catch { /* Next tick retries. */ }
            }
            if (!stopped) timer = setTimeout(tick, intervalMs);
        };
        // The help page marks replies read on its first load; wait for it.
        timer = setTimeout(tick, pathname.startsWith("/dashboard/help") ? 1500 : 0);
        return () => { stopped = true; clearTimeout(timer); };
    }, [endpoint, intervalMs, pathname]);
    return unread;
}
