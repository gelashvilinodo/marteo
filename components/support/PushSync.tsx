"use client";

import { useEffect } from "react";

function keyBytes(base64Url: string) {
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

function sameKey(subscription: PushSubscription, key: Uint8Array) {
    const current = subscription.options?.applicationServerKey;
    if (!current) return true;
    const bytes = new Uint8Array(current);
    return bytes.length === key.length && bytes.every((byte, index) => byte === key[index]);
}

// Each time MARTEO opens, a device that already allowed notifications re-registers
// with the server: the push service may have renewed or dropped the subscription,
// or another account was signed in here. Nothing is asked and nothing is shown.
export default function PushSync({ publicKey }: { publicKey: string | null }) {
    useEffect(() => {
        if (!publicKey || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
        if (Notification.permission !== "granted") return;
        (async () => {
            const key = keyBytes(publicKey);
            const worker = await navigator.serviceWorker.getRegistration("/") ?? await navigator.serviceWorker.register("/sw.js", { scope: "/" });
            await navigator.serviceWorker.ready;
            let subscription = await worker.pushManager.getSubscription();
            if (subscription && !sameKey(subscription, key)) {
                await subscription.unsubscribe().catch(() => false);
                subscription = null;
            }
            subscription ??= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
            await fetch("/api/push/subscription", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(subscription.toJSON()),
            });
        })().catch(() => undefined);
    }, [publicKey]);
    return null;
}
