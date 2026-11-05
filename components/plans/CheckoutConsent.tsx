"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useState } from "react";

// გადახდის ღილაკი: პირობებზე თანხმობის გარეშე არ ირთვება. დაჭერისას ბანკის გადახდის გვერდზე გადადის.
export default function CheckoutConsent({ amount, plan }: { amount: string; plan: string }) {
    const [agreed, setAgreed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function pay() {
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/billing/checkout", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }),
            });
            const body = await response.json().catch(() => null) as { redirectUrl?: string; message?: string; error?: string } | null;
            if (response.ok && body?.redirectUrl) {
                window.location.assign(body.redirectUrl);
                return;
            }
            setError(body?.message ?? body?.error ?? "გადახდა ვერ დაიწყო. სცადეთ ხელახლა.");
        } catch {
            setError("ინტერნეტთან კავშირი ვერ მოხერხდა. სცადეთ ხელახლა.");
        }
        setBusy(false);
    }
    return <div className="space-y-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-text-secondary">
            <input type="checkbox" checked={agreed} onChange={event => { setAgreed(event.target.checked); setError(""); }}
                className="mt-1 h-4 w-4 shrink-0 accent-[var(--marteo-accent)]" />
            <span>ვეთანხმები <Link href="/terms" target="_blank" className="font-medium text-accent hover:underline">მომსახურების პირობებს</Link> და ყოველთვიურ ავტომატურ გადახდას. გაუქმება ნებისმიერ დროს შემიძლია.</span>
        </label>
        <button type="button" disabled={!agreed || busy} onClick={pay}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-semibold text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50">
            <Icon icon={busy ? "solar:refresh-linear" : "solar:lock-keyhole-minimalistic-bold"} className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
            {busy ? "ბანკის გვერდზე გადასვლა…" : `გადახდა · ${amount} ₾`}
        </button>
        <p className="text-center text-xs text-text-secondary">გადახდა საქართველოს ბანკის დაცულ გვერდზე მოხდება. ბარათის მონაცემები MARTEO-ს არ ხვდება.</p>
        {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm leading-6 text-text-primary">
            <Icon icon="solar:danger-circle-bold-duotone" className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            {error}
        </p>}
    </div>;
}
