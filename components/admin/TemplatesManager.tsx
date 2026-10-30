"use client";

import { Icon } from "@iconify/react";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

type Template = { id: string; title: string; body: string };
type Draft = { id: string | null; title: string; body: string };

export default function TemplatesManager({ initial }: { initial: Template[] }) {
    const [templates, setTemplates] = useState(initial);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [removing, setRemoving] = useState<Template | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const request = async (url: string, init: RequestInit) => {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(url, init);
            const data = await response.json().catch(() => ({})) as { templates?: Template[]; message?: string };
            if (!response.ok || !data.templates) throw new Error(data.message || "მოქმედება ვერ შესრულდა.");
            setTemplates(data.templates);
            return true;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "მოქმედება ვერ შესრულდა.");
            return false;
        } finally { setBusy(false); }
    };

    const save = async () => {
        if (!draft) return;
        const body = JSON.stringify({ title: draft.title, body: draft.body });
        const ok = draft.id
            ? await request(`/api/admin/support/templates/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
            : await request("/api/admin/support/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body });
        if (ok) setDraft(null);
    };

    const remove = async () => {
        if (!removing) return;
        if (await request(`/api/admin/support/templates/${removing.id}`, { method: "DELETE" })) setRemoving(null);
    };

    const field = "w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-accent sm:text-sm";

    return <div className="mt-6">
        {error && !removing && <p role="alert" className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        {draft
            ? <section className="mb-4 rounded-2xl border border-accent/40 bg-surface p-4">
                <h2 className="text-sm font-semibold text-text-primary">{draft.id ? "შაბლონის რედაქტირება" : "ახალი შაბლონი"}</h2>
                <label className="mt-3 block text-xs text-text-secondary">სათაური (მხოლოდ შენ ხედავ)
                    <input value={draft.title} maxLength={60} onChange={event => setDraft({ ...draft, title: event.target.value })} className={`mt-1 h-11 ${field}`} />
                </label>
                <label className="mt-3 block text-xs text-text-secondary">ტექსტი
                    <textarea value={draft.body} maxLength={2000} rows={4} onChange={event => setDraft({ ...draft, body: event.target.value })} className={`mt-1 resize-y py-2.5 ${field}`} />
                </label>
                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={() => { setDraft(null); setError(""); }} disabled={busy} className="h-11 rounded-xl border border-border px-4 text-sm font-medium transition hover:bg-background">გაუქმება</button>
                    <button type="button" onClick={save} disabled={busy || !draft.title.trim() || !draft.body.trim()} className="h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-40">{busy ? "ინახება…" : "შენახვა"}</button>
                </div>
            </section>
            : <button type="button" onClick={() => setDraft({ id: null, title: "", body: "" })}
                className="mb-4 flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover">
                <Icon icon="solar:add-circle-linear" className="h-5 w-5" aria-hidden="true" /> ახალი შაბლონი
            </button>}

        <ul className="flex flex-col gap-2">
            {templates.map(item => <li key={item.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text-primary">{item.title}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-secondary">{item.body}</p>
                    </div>
                    <button type="button" onClick={() => { setError(""); setDraft({ id: item.id, title: item.title, body: item.body }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                        aria-label={`${item.title}: რედაქტირება`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-background hover:text-accent">
                        <Icon icon="solar:pen-linear" className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => { setError(""); setRemoving(item); }}
                        aria-label={`${item.title}: წაშლა`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-danger/10 hover:text-danger">
                        <Icon icon="solar:trash-bin-trash-linear" className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </li>)}
            {!templates.length && <li className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-text-secondary">შაბლონები ჯერ არ გაქვს.</li>}
        </ul>

        <ConfirmDialog open={Boolean(removing)} title="შაბლონის წაშლა" confirmLabel="წაშლა" danger busy={busy} error={removing ? error : ""}
            onConfirm={remove} onClose={() => { if (!busy) { setRemoving(null); setError(""); } }}>
            „{removing?.title}“ წაიშლება. უკვე გაგზავნილ შეტყობინებებს ეს არ შეეხება.
        </ConfirmDialog>
    </div>;
}
