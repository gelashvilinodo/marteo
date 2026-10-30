"use client";

import { Icon } from "@iconify/react";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import { formatSupportDate, formatSupportTime } from "@/lib/support/support-config";

type Note = { id: string; body: string; createdAt: string; adminName: string | null };

// Private to the admin panel: the business never sees these notes.
export default function NotesPanel({ businessId, initial }: { businessId: string; initial: Note[] }) {
    const [notes, setNotes] = useState(initial);
    const [draft, setDraft] = useState("");
    const [removing, setRemoving] = useState<Note | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const request = async (url: string, init: RequestInit) => {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(url, init);
            const data = await response.json().catch(() => ({})) as { notes?: Note[]; message?: string };
            if (!response.ok || !data.notes) throw new Error(data.message || "მოქმედება ვერ შესრულდა.");
            setNotes(data.notes);
            return true;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "მოქმედება ვერ შესრულდა.");
            return false;
        } finally { setBusy(false); }
    };

    const add = async () => {
        if (!draft.trim()) return;
        const ok = await request(`/api/admin/businesses/${businessId}/notes`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft }),
        });
        if (ok) setDraft("");
    };

    return <div>
        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-text-secondary">
            <Icon icon="solar:eye-closed-linear" className="h-3.5 w-3.5" aria-hidden="true" /> მხოლოდ ადმინ პანელში ჩანს, ბიზნესი ვერ ხედავს.
        </p>
        <textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} rows={2} placeholder="მაგ.: ურეკავს ხშირად, სურს PRO თვის ბოლოს…"
            onKeyDown={event => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void add(); } }}
            className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-base text-text-primary outline-none transition placeholder:text-text-secondary focus:border-accent sm:text-sm" />
        <div className="mt-2 flex items-center justify-between gap-2">
            {error && !removing ? <p role="alert" className="text-xs text-danger">{error}</p> : <span />}
            <button type="button" onClick={add} disabled={busy || !draft.trim()}
                className="h-9 shrink-0 rounded-lg bg-accent px-3 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:opacity-40">{busy && !removing ? "ინახება…" : "დამატება"}</button>
        </div>
        <ul className="mt-2 flex flex-col">
            {notes.map(note => <li key={note.id} className="group flex gap-2 border-t border-border py-2.5">
                <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap break-words text-sm text-text-primary">{note.body}</p>
                    <p className="mt-0.5 text-[11px] text-text-secondary">{formatSupportDate(note.createdAt)}, {formatSupportTime(note.createdAt)} · {note.adminName ?? "წაშლილი ადმინი"}</p>
                </div>
                <button type="button" onClick={() => { setError(""); setRemoving(note); }} aria-label="შენიშვნის წაშლა"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-danger/10 hover:text-danger">
                    <Icon icon="solar:trash-bin-trash-linear" className="h-4 w-4" aria-hidden="true" />
                </button>
            </li>)}
            {!notes.length && <li className="border-t border-border py-2.5 text-xs text-text-secondary">შენიშვნები ჯერ არ არის.</li>}
        </ul>
        <ConfirmDialog open={Boolean(removing)} title="შენიშვნის წაშლა" confirmLabel="წაშლა" danger busy={busy} error={removing ? error : ""}
            onConfirm={async () => { if (removing && await request(`/api/admin/businesses/${businessId}/notes/${removing.id}`, { method: "DELETE" })) setRemoving(null); }}
            onClose={() => { if (!busy) { setRemoving(null); setError(""); } }}>
            შენიშვნა სამუდამოდ წაიშლება.
        </ConfirmDialog>
    </div>;
}
