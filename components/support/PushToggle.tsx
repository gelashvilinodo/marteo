"use client";

import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on" | "busy";

function keyBytes(base64Url: string) {
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}

function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function registration() {
    return await navigator.serviceWorker.getRegistration("/") ?? await navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

// iPhone allows Web Push only for the app added to the Home Screen (iOS 16.4+),
// and only after a tap; the permission prompt therefore stays behind a button.
export default function PushToggle({ publicKey, tone = "dark" }: { publicKey: string | null; tone?: "dark" | "light" }) {
    const [state, setState] = useState<State>("loading");
    const [message, setMessage] = useState("");

    useEffect(() => {
        let active = true;
        (async () => {
            const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
            if (!publicKey) return "unsupported" as const;
            if (!supported) return isIos() && !isStandalone() ? "install" as const : "unsupported" as const;
            if (Notification.permission === "denied") return "denied" as const;
            const existing = await navigator.serviceWorker.getRegistration("/");
            const subscription = await existing?.pushManager.getSubscription();
            return subscription ? "on" as const : "off" as const;
        })().then(next => { if (active) setState(next); }).catch(() => { if (active) setState("unsupported"); });
        return () => { active = false; };
    }, [publicKey]);

    const enable = async () => {
        if (!publicKey) return;
        setState("busy");
        setMessage("");
        // Each step fails for a different reason; tell the person which one.
        let step: "worker" | "subscribe" | "save" = "worker";
        try {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
            const worker = await registration();
            await navigator.serviceWorker.ready;
            step = "subscribe";
            const subscription = await worker.pushManager.getSubscription()
                ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
            step = "save";
            const response = await fetch("/api/push/subscription", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(subscription.toJSON()),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            setState("on");
        } catch (cause) {
            console.error("Push enable failed at", step, cause);
            setState("off");
            const brave = "brave" in navigator;
            setMessage(step === "subscribe"
                ? brave
                    ? "Brave შეტყობინებებს ბლოკავს. გახსენი brave://settings/privacy, ჩართე „Use Google services for push messaging“, გადატვირთე ბრაუზერი და სცადე ხელახლა."
                    : "ბრაუზერმა შეტყობინებების სერვისთან დაკავშირება ვერ შეძლო. სცადე Chrome-ით ან Safari-ით."
                : step === "save"
                    ? "ბრაუზერში ჩაირთო, მაგრამ სერვერზე შენახვა ვერ მოხერხდა. სცადე ხელახლა."
                    : "შეტყობინებების სერვისი ვერ ჩაირთო. განაახლე გვერდი და სცადე ხელახლა.");
        }
    };

    const disable = async () => {
        setState("busy");
        try {
            const subscription = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
            if (subscription) {
                await fetch("/api/push/subscription", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ endpoint: subscription.endpoint }),
                });
                await subscription.unsubscribe();
            }
        } finally { setState("off"); }
    };

    if (state === "loading") return null;
    const base = tone === "dark"
        ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
        : "border-border bg-surface text-text-primary hover:bg-background";

    if (state === "unsupported") return <p className={`rounded-xl border px-3 py-2 text-[11px] leading-5 ${base}`}>
        ეს ბრაუზერი შეტყობინებებს არ უჭერს მხარს. სცადე Chrome, Safari ან ტელეფონზე დამატებული მართეო.
    </p>;
    if (state === "install") return <p className={`rounded-xl border px-3 py-2 text-[11px] leading-5 ${base}`}>
        შეტყობინებებისთვის Safari-ში დააჭირე „გაზიარებას“ → „Add to Home Screen“ და გახსენი მართეო იქიდან.
    </p>;
    if (state === "denied") return <p className={`rounded-xl border px-3 py-2 text-[11px] leading-5 ${base}`}>
        შეტყობინებები დაბლოკილია. ჩართე მოწყობილობის პარამეტრებში.
    </p>;

    return <div>
        <button type="button" disabled={state === "busy"} onClick={state === "on" ? disable : enable}
            className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition disabled:opacity-60 ${base}`}>
            <Icon icon={state === "on" ? "solar:bell-bing-bold-duotone" : "solar:bell-off-linear"} className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">{state === "on" ? "შეტყობინებები ჩართულია" : "Push შეტყობინებების ჩართვა"}</span>
            <span className={`relative h-4 w-7 rounded-full transition ${state === "on" ? "bg-success" : "bg-slate-400/50"}`} aria-hidden="true">
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${state === "on" ? "left-3.5" : "left-0.5"}`} />
            </span>
        </button>
        {message && <p className="mt-1 text-[11px] text-danger">{message}</p>}
    </div>;
}
