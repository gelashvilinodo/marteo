"use client";

import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";

const DISMISSED_KEY = "marteo-push-banner-dismissed";

// A one-time nudge where a missed reply matters most. Hidden once push is on,
// unsupported, blocked, or dismissed; the notifications page keeps the switch.
export default function PushBanner({ publicKey, text }: { publicKey: string | null; text: string }) {
    const [visible, setVisible] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
            try { if (localStorage.getItem(DISMISSED_KEY)) return false; } catch { /* Show it anyway. */ }
            if (Notification.permission === "denied") return false;
            const subscription = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
            return !subscription;
        })().then(show => { if (active) setVisible(show); }).catch(() => undefined);
        return () => { active = false; };
    }, [publicKey]);

    const dismiss = () => {
        try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* Hidden for this visit only. */ }
        setVisible(false);
    };

    const enable = async () => {
        if (!publicKey) return;
        setBusy(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") { dismiss(); return; }
            const worker = await navigator.serviceWorker.getRegistration("/") ?? await navigator.serviceWorker.register("/sw.js", { scope: "/" });
            await navigator.serviceWorker.ready;
            const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(publicKey.length / 4) * 4, "=")), char => char.charCodeAt(0));
            const subscription = await worker.pushManager.getSubscription()
                ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
            const response = await fetch("/api/push/subscription", {
                method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()),
            });
            if (response.ok) setVisible(false);
        } catch {
            // Failure details live on the notifications page; keep the nudge quiet.
            dismiss();
        } finally { setBusy(false); }
    };

    if (!visible) return null;
    return <div className="flex items-center gap-2 border-b border-border bg-accent/10 px-3 py-2 text-xs text-text-primary sm:px-4">
        <Icon icon="solar:bell-bing-bold-duotone" className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-5">{text}</span>
        <button type="button" onClick={enable} disabled={busy} className="shrink-0 rounded-lg bg-accent px-2.5 py-1 font-medium text-white transition hover:bg-accent-hover disabled:opacity-60">
            {busy ? "…" : "ჩართვა"}
        </button>
        <button type="button" onClick={dismiss} aria-label="დახურვა" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-background">
            <Icon icon="solar:close-circle-linear" className="h-4 w-4" aria-hidden="true" />
        </button>
    </div>;
}
