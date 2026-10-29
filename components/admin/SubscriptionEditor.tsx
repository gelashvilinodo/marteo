"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { SUBSCRIPTION_STATUS_LABELS as STATUS_LABELS } from "./AdminBadges";

const PLAN_OPTIONS = ["FREE", "START", "BUSINESS", "PRO"] as const;

type Current = { plan: string | null; status: string | null; expiresAt: string | null };

const tbilisiDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" });

// Dates are whole days in Tbilisi time, as YYYY-MM-DD.
function today() {
    return tbilisiDay.format(new Date());
}

function shift(day: string, { days = 0, months = 0 }: { days?: number; months?: number }) {
    const [year, month, date] = day.split("-").map(Number);
    const result = new Date(Date.UTC(year, month - 1 + months, date + days));
    return result.toISOString().slice(0, 10);
}

function readable(day: string) {
    const months = ["იან.", "თებ.", "მარ.", "აპრ.", "მაი.", "ივნ.", "ივლ.", "აგვ.", "სექ.", "ოქტ.", "ნოე.", "დეკ."];
    const [year, month, date] = day.split("-").map(Number);
    return `${date} ${months[month - 1]} ${year}`;
}

export default function SubscriptionEditor({ businessId, current }: { businessId: string; current: Current }) {
    const router = useRouter();
    const initialDay = current.expiresAt ? tbilisiDay.format(new Date(current.expiresAt)) : "";
    const [plan, setPlan] = useState(current.plan ?? "FREE");
    const [status, setStatus] = useState(current.status ?? "ACTIVE");
    const [expires, setExpires] = useState(initialDay);
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const changed = plan !== (current.plan ?? "") || status !== (current.status ?? "") || expires !== initialDay;
    // Extensions continue from the current end date if it is still in the future.
    const base = expires && expires > today() ? expires : today();

    const quick = [
        { label: "საცდელი 14 დღე", apply: () => { setStatus("TRIALING"); setExpires(shift(today(), { days: 14 })); } },
        { label: "+1 თვე", apply: () => { setStatus("ACTIVE"); setExpires(shift(base, { months: 1 })); } },
        { label: "+1 წელი", apply: () => { setStatus("ACTIVE"); setExpires(shift(base, { months: 12 })); } },
        { label: "უვადო", apply: () => setExpires("") },
    ];

    const save = async () => {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/businesses/${businessId}/subscription`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan, status, expiresAt: expires || null }),
            });
            const data = await response.json().catch(() => ({})) as { message?: string };
            if (!response.ok) throw new Error(data.message || "პაკეტი ვერ განახლდა.");
            setNotice(data.message ?? "პაკეტი განახლდა.");
            setConfirming(false);
            router.refresh();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "პაკეტი ვერ განახლდა.");
        } finally { setBusy(false); }
    };

    const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-accent sm:text-sm";
    const describe = (p: string | null, s: string | null, day: string) => p ? `${p} · ${STATUS_LABELS[s ?? ""] ?? s} · ${day ? `${readable(day)}-მდე` : "უვადო"}` : "პაკეტის გარეშე";

    return <div>
        {notice && <p role="status" className="mb-3 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            <Icon icon="solar:check-circle-bold" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}
        </p>}
        <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-text-secondary">პაკეტი
                <select value={plan} onChange={event => { setNotice(""); setPlan(event.target.value); }} className={`mt-1 ${field}`}>
                    {PLAN_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
            </label>
            <label className="text-xs text-text-secondary">სტატუსი
                <select value={status} onChange={event => { setNotice(""); setStatus(event.target.value); }} className={`mt-1 ${field}`}>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            </label>
            <label className="text-xs text-text-secondary">ვადა (ჩათვლით)
                <input type="date" value={expires} min="2024-01-01" onChange={event => { setNotice(""); setExpires(event.target.value); }} className={`mt-1 ${field}`} />
            </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
            {quick.map(item => <button key={item.label} type="button" onClick={() => { setNotice(""); item.apply(); }}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-text-primary transition hover:border-accent/40 hover:bg-background">{item.label}</button>)}
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-secondary">{expires ? `ვადა: ${readable(expires)}` : "ვადა არ არის მითითებული (უვადო)"}</p>
            <div className="flex gap-2">
                {changed && <button type="button" onClick={() => { setPlan(current.plan ?? "FREE"); setStatus(current.status ?? "ACTIVE"); setExpires(initialDay); }}
                    className="h-11 flex-1 rounded-xl border border-border px-4 text-sm font-medium transition hover:bg-background sm:flex-none">დაბრუნება</button>}
                <button type="button" disabled={!changed} onClick={() => { setError(""); setConfirming(true); }}
                    className="h-11 flex-1 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-40 sm:flex-none">შენახვა</button>
            </div>
        </div>
        <ConfirmDialog open={confirming} title="პაკეტის შეცვლა" confirmLabel="შენახვა" busy={busy} error={error} onConfirm={save} onClose={() => { if (!busy) setConfirming(false); }}>
            <span className="block">ახლა: <b className="font-medium text-text-primary">{describe(current.plan, current.status, initialDay)}</b></span>
            <span className="block">გახდება: <b className="font-medium text-text-primary">{describe(plan, status, expires)}</b></span>
        </ConfirmDialog>
    </div>;
}
