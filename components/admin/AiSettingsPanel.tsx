"use client";

import { Icon } from "@iconify/react";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import type { BusinessAiView } from "@/lib/admin/ai-usage";
import { formatSupportDate } from "@/lib/support/support-config";

const usd = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;

// Only counts and cost: the admin never sees what the business asked.
export default function AiSettingsPanel({ businessId, initial }: { businessId: string; initial: BusinessAiView }) {
    const [ai, setAi] = useState(initial);
    const [disabled, setDisabled] = useState(initial.disabled);
    const [limit, setLimit] = useState(initial.custom ? String(initial.limit) : "");
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const savedLimit = ai.custom ? String(ai.limit) : "";
    const changed = disabled !== ai.disabled || limit.trim() !== savedLimit;
    const share = ai.limit ? Math.min(ai.used / ai.limit, 1) : 1;

    const save = async () => {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/businesses/${businessId}/ai`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ disabled, monthlyLimit: limit.trim() === "" ? null : Number(limit) }),
            });
            const data = await response.json().catch(() => ({})) as { ai?: BusinessAiView; message?: string };
            if (!response.ok || !data.ai) throw new Error(data.message || "ვერ შეინახა.");
            setAi(data.ai);
            setNotice(data.message ?? "შეინახა.");
            setConfirming(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "ვერ შეინახა.");
        } finally { setBusy(false); }
    };

    const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-accent sm:text-sm";

    return <div>
        {notice && <p role="status" className="mb-3 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            <Icon icon="solar:check-circle-bold" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}
        </p>}
        <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-background p-3">
                <p className="text-xs text-text-secondary">ამ პერიოდში</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{ai.used} / {ai.limit}</p>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-border/60"><span className={`block h-full rounded-full ${share >= 1 ? "bg-danger" : share >= 0.8 ? "bg-warning" : "bg-accent"}`} style={{ width: `${share * 100}%` }} /></span>
            </div>
            <div className="rounded-xl bg-background p-3">
                <p className="text-xs text-text-secondary">ხარჯი ამ თვეში</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{usd(ai.monthCost)}</p>
            </div>
            <div className="rounded-xl bg-background p-3">
                <p className="text-xs text-text-secondary">სულ</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{usd(ai.totalCost)}</p>
            </div>
        </div>
        <p className="mt-2 text-xs text-text-secondary">ბოლოს გამოიყენა: {ai.lastUsedAt ? formatSupportDate(ai.lastUsedAt) : "არასდროს"} · {ai.plan} პაკეტის ლიმიტი {ai.planLimit}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
                <span className="text-sm text-text-primary">AI გამორთული
                    <span className="block text-[11px] text-text-secondary">ბიზნესი AI-ს ვერ გამოიყენებს.</span></span>
                <input type="checkbox" checked={disabled} onChange={event => { setNotice(""); setDisabled(event.target.checked); }} className="h-5 w-5 accent-[var(--marteo-danger,#dc2626)]" />
            </label>
            <label className="text-xs text-text-secondary">ცალკე თვიური ლიმიტი
                <input inputMode="numeric" value={limit} onChange={event => { setNotice(""); setLimit(event.target.value.replace(/\D/g, "").slice(0, 6)); }}
                    placeholder={`პაკეტის მიხედვით (${ai.planLimit})`} className={`mt-1 ${field}`} />
            </label>
        </div>
        <div className="mt-3 flex justify-end gap-2">
            {changed && <button type="button" onClick={() => { setDisabled(ai.disabled); setLimit(savedLimit); }}
                className="h-11 rounded-xl border border-border px-4 text-sm font-medium transition hover:bg-background">დაბრუნება</button>}
            <button type="button" disabled={!changed} onClick={() => { setError(""); setConfirming(true); }}
                className="h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-40">შენახვა</button>
        </div>
        <ConfirmDialog open={confirming} title="AI-ის პარამეტრები" confirmLabel="შენახვა" danger={disabled && !ai.disabled} busy={busy} error={confirming ? error : ""}
            onConfirm={save} onClose={() => { if (!busy) setConfirming(false); }}>
            <span className="block">{disabled ? "AI გამოირთვება: ბიზნესი პანელში შეტყობინებას დაინახავს." : "AI ჩართული იქნება."}</span>
            <span className="block">თვიური ლიმიტი: <b className="font-medium text-text-primary">{limit.trim() === "" ? `პაკეტის მიხედვით (${ai.planLimit})` : limit}</b></span>
        </ConfirmDialog>
    </div>;
}
