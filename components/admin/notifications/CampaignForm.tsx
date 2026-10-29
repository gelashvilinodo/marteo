"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BUSINESS_MODES, type BusinessMode } from "@/lib/business/business-mode";
import { PLAN_AUDIENCES, type PlanAudience } from "@/lib/notifications/audience-options";

export type CampaignFormValues = {
    title: string; body: string; actionLabel: string; actionUrl: string;
    modes: BusinessMode[]; plan: PlanAudience; registeredWithinDays: string;
    /** "" = send now; otherwise datetime-local value in Tbilisi time. */
    deliverAt: string;
};

const REGISTERED_OPTIONS = [["", "ყველა მომხმარებელი"], ["1", "ბოლო 1 დღეში"], ["7", "ბოლო 7 დღეში"], ["14", "ბოლო 14 დღეში"], ["30", "ბოლო 30 დღეში"], ["90", "ბოლო 90 დღეში"]] as const;
const inputClass = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text-primary outline-none focus:border-accent";

async function send(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
        method, credentials: "same-origin",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({})) as { error?: string; recipients?: number };
    if (!response.ok) throw new Error(data.error || "მოქმედება ვერ შესრულდა.");
    return data;
}

export function CancelCampaignButton({ id }: { id: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    return <button type="button" disabled={busy} className="text-sm text-danger hover:underline disabled:opacity-50" onClick={async () => {
        if (!window.confirm("გავაუქმო დაგეგმილი შეტყობინება?")) return;
        setBusy(true);
        try { await send(`/api/admin/notifications/${id}`, "DELETE"); router.refresh(); }
        catch (error) { window.alert(error instanceof Error ? error.message : "გაუქმება ვერ მოხერხდა."); }
        finally { setBusy(false); }
    }}>გაუქმება</button>;
}

export default function CampaignForm({ id, initial }: { id?: string; initial: CampaignFormValues }) {
    const router = useRouter();
    const [values, setValues] = useState(initial);
    const [scheduled, setScheduled] = useState(Boolean(initial.deliverAt));
    const [recipients, setRecipients] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const set = <K extends keyof CampaignFormValues>(key: K, value: CampaignFormValues[K]) => setValues(current => ({ ...current, [key]: value }));
    const audience = { modes: values.modes, plan: values.plan, registeredWithinDays: values.registeredWithinDays || null };
    const deliverAt = scheduled ? values.deliverAt : "";
    const previewKey = JSON.stringify({ audience, deliverAt });

    useEffect(() => {
        let active = true;
        const timer = setTimeout(() => {
            send("/api/admin/notifications/preview", "POST", JSON.parse(previewKey))
                .then(data => { if (active) setRecipients(data.recipients ?? null); })
                .catch(() => { if (active) setRecipients(null); });
        }, 300);
        return () => { active = false; clearTimeout(timer); };
    }, [previewKey]);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (scheduled && !values.deliverAt) { setError("მიუთითე გაგზავნის დრო."); return; }
        if (!scheduled && !window.confirm(`შეტყობინება ახლავე გაეგზავნება ${recipients ?? "?"} მომხმარებელს. გავაგრძელო?`)) return;
        setBusy(true);
        setError("");
        const payload = { title: values.title, body: values.body, actionLabel: values.actionLabel, actionUrl: values.actionUrl, audience, deliverAt };
        try {
            await send(id ? `/api/admin/notifications/${id}` : "/api/admin/notifications", id ? "PATCH" : "POST", payload);
            router.push("/admin/notifications");
            router.refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : "შენახვა ვერ მოხერხდა.");
            setBusy(false);
        }
    }

    return <form onSubmit={submit} className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-base font-semibold text-text-primary">შინაარსი</h2>
            <label className="block text-sm text-text-secondary">სათაური
                <input required maxLength={120} value={values.title} onChange={e => set("title", e.target.value)} className={inputClass} />
            </label>
            <label className="block text-sm text-text-secondary">ტექსტი
                <textarea required maxLength={2000} rows={6} value={values.body} onChange={e => set("body", e.target.value)} className={inputClass} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-text-secondary">ღილაკის ტექსტი (არასავალდებულო)
                    <input maxLength={40} value={values.actionLabel} onChange={e => set("actionLabel", e.target.value)} placeholder="მაგ. ნახვა" className={inputClass} />
                </label>
                <label className="block text-sm text-text-secondary">ბმული (არასავალდებულო)
                    <input maxLength={300} value={values.actionUrl} onChange={e => set("actionUrl", e.target.value)} placeholder="/dashboard/inventory" className={inputClass} />
                </label>
            </div>
        </section>

        <aside className="space-y-4">
            <section className="space-y-4 rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-base font-semibold text-text-primary">ვის გაეგზავნოს</h2>
                <fieldset>
                    <legend className="text-sm text-text-secondary">ბიზნესის ტიპი</legend>
                    <div className="mt-2 space-y-2">
                        {BUSINESS_MODES.map(mode => <label key={mode.value} className="flex items-center gap-2 text-sm text-text-primary">
                            <input type="checkbox" checked={values.modes.includes(mode.value)} onChange={e => set("modes", e.target.checked ? [...values.modes, mode.value] : values.modes.filter(m => m !== mode.value))} />
                            {mode.value === "HYBRID" ? "ორივე (იმპორტი + წარმოება)" : mode.label}
                        </label>)}
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">თუ არცერთს მონიშნავ, ყველა ტიპს გაეგზავნება.</p>
                </fieldset>
                <fieldset>
                    <legend className="text-sm text-text-secondary">პაკეტი</legend>
                    <div className="mt-2 space-y-2">
                        {PLAN_AUDIENCES.map(plan => <label key={plan.value} className="flex items-center gap-2 text-sm text-text-primary">
                            <input type="radio" name="plan" checked={values.plan === plan.value} onChange={() => set("plan", plan.value)} />{plan.label}
                        </label>)}
                    </div>
                </fieldset>
                <label className="block text-sm text-text-secondary">რეგისტრაცია
                    <select value={values.registeredWithinDays} onChange={e => set("registeredWithinDays", e.target.value)} className={inputClass}>
                        {REGISTERED_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <span className="mt-1 block text-xs">ითვლება გაგზავნის მომენტიდან.</span>
                </label>
            </section>

            <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
                <h2 className="text-base font-semibold text-text-primary">როდის</h2>
                <label className="flex items-center gap-2 text-sm text-text-primary"><input type="radio" name="when" checked={!scheduled} onChange={() => setScheduled(false)} />ახლავე</label>
                <label className="flex items-center gap-2 text-sm text-text-primary"><input type="radio" name="when" checked={scheduled} onChange={() => setScheduled(true)} />დაგეგმვა</label>
                {scheduled && <label className="block text-sm text-text-secondary">თარიღი და დრო (თბილისის დროით)
                    <input type="datetime-local" value={values.deliverAt} onChange={e => set("deliverAt", e.target.value)} className={inputClass} />
                </label>}
            </section>

            <section className="rounded-2xl border border-border bg-surface p-5">
                <p className="text-sm text-text-secondary">მიიღებს დაახლოებით</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">{recipients === null ? "…" : recipients.toLocaleString("ka-GE")} <span className="text-sm font-normal text-text-secondary">მომხმარებელი</span></p>
                {scheduled && <p className="mt-1 text-xs text-text-secondary">დღევანდელი მონაცემებით; გაგზავნამდე დარეგისტრირებულებიც მიიღებენ.</p>}
                {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
                <button type="submit" disabled={busy} className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                    {busy ? "ინახება…" : id ? "ცვლილებების შენახვა" : scheduled ? "დაგეგმვა" : "გაგზავნა"}
                </button>
            </section>
        </aside>
    </form>;
}

export function WelcomeTemplateForm({ initial }: { initial: { title: string; body: string; actionLabel: string; actionUrl: string } }) {
    const [values, setValues] = useState(initial);
    const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const set = (key: keyof typeof initial, value: string) => setValues(current => ({ ...current, [key]: value }));
    return <form className="mt-6 max-w-2xl space-y-4 rounded-2xl border border-border bg-surface p-5" onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        try { await send("/api/admin/notifications/welcome", "PUT", values); setStatus({ ok: true, message: "შენახულია." }); }
        catch (e) { setStatus({ ok: false, message: e instanceof Error ? e.message : "შენახვა ვერ მოხერხდა." }); }
        finally { setBusy(false); }
    }}>
        <label className="block text-sm text-text-secondary">სათაური
            <input required maxLength={120} value={values.title} onChange={e => set("title", e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm text-text-secondary">ტექსტი
            <textarea required maxLength={2000} rows={7} value={values.body} onChange={e => set("body", e.target.value)} className={inputClass} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-text-secondary">ღილაკის ტექსტი
                <input maxLength={40} value={values.actionLabel} onChange={e => set("actionLabel", e.target.value)} className={inputClass} />
            </label>
            <label className="block text-sm text-text-secondary">ბმული
                <input maxLength={300} value={values.actionUrl} onChange={e => set("actionUrl", e.target.value)} placeholder="/dashboard" className={inputClass} />
            </label>
        </div>
        {status && <p role="status" className={`text-sm ${status.ok ? "text-success" : "text-danger"}`}>{status.message}</p>}
        <button type="submit" disabled={busy} className="rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">{busy ? "ინახება…" : "შენახვა"}</button>
    </form>;
}
