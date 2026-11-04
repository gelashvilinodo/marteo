"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";

const inputClass =
    "mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2 text-base text-text-primary outline-none focus:border-red-600";

// ბიზნესის წაშლა: სახელის და პაროლის დადასტურება, შემდეგ ყველა მფლობელის თანხმობა.
export default function DangerZone({ businessName, ownerCount }: { businessName: string; ownerCount: number }) {
    const [open, setOpen] = useState(false);
    return (
        <section className="min-w-0 rounded-2xl border-2 border-red-600/40 bg-red-600/5 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 font-semibold text-red-600">
                <Icon icon="solar:danger-triangle-linear" className="size-5 shrink-0" aria-hidden="true" />
                სახიფათო ზონა
            </h2>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <p className="font-medium text-text-primary">ბიზნესის წაშლა</p>
                    <p className="mt-1 text-sm text-text-secondary">
                        წაიშლება ყველა შეკვეთა, მარაგი, შესყიდვა და ანალიტიკა. ამის დაბრუნება შეუძლებელია.
                        {ownerCount > 1 && " წაშლას ყველა მფლობელის თანხმობა სჭირდება."}
                    </p>
                </div>
                <button type="button" onClick={() => setOpen(true)}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center delete-action rounded-xl border px-4 text-sm font-semibold transition">
                    ბიზნესის წაშლა
                </button>
            </div>
            {open && <DeleteDialog businessName={businessName} onClose={() => setOpen(false)} />}
        </section>
    );
}

function DeleteDialog({ businessName, onClose }: { businessName: string; onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const [confirmName, setConfirmName] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        const element = dialog.current;
        if (element && !element.open) element.showModal();
        return () => element?.close();
    }, []);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/business/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirmName, password }),
            });
            const data = await response.json().catch(() => ({})) as { success?: boolean; deleted?: boolean; message?: string };
            if (!response.ok || !data.success) {
                setError(data.message || "წაშლა ვერ მოხერხდა. სცადე ხელახლა.");
                return;
            }
            if (data.deleted) {
                window.location.assign("/dashboard");
                return;
            }
            // სხვა მფლობელების თანხმობა საჭიროა: მოთხოვნა გუნდის სექციაში გამოჩნდება.
            window.location.reload();
        } catch {
            setError("კავშირი ვერ დამყარდა. სცადე ხელახლა.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <dialog ref={dialog} aria-labelledby={titleId} aria-busy={busy}
            onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
            className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-red-600/40 bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm">
            <form onSubmit={submit} noValidate className="space-y-4 p-4 sm:p-5">
                <h2 id={titleId} className="flex items-center gap-2 font-semibold text-red-600">
                    <Icon icon="solar:trash-bin-trash-linear" className="size-5 shrink-0" aria-hidden="true" />
                    ბიზნესის წაშლა
                </h2>
                <p className="text-sm text-text-secondary">
                    დასადასტურებლად ჩაწერე ბიზნესის სახელი: <strong className="break-all text-text-primary">{businessName}</strong>
                </p>
                <label className="block text-sm font-medium">
                    ბიზნესის სახელი
                    <input value={confirmName} disabled={busy} autoComplete="off" onChange={event => { setConfirmName(event.target.value); setError(""); }} className={inputClass} />
                </label>
                <label className="block text-sm font-medium">
                    შენი პაროლი
                    <input type="password" value={password} disabled={busy} autoComplete="current-password" onChange={event => { setPassword(event.target.value); setError(""); }} className={inputClass} />
                </label>
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} disabled={busy}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">
                        გაუქმება
                    </button>
                    <button type="submit" disabled={busy || confirmName.trim() !== businessName.trim() || !password}
                        className="inline-flex min-h-10 items-center justify-center delete-button gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50">
                        {busy && <Icon icon="solar:refresh-linear" className="size-4 animate-spin" aria-hidden="true" />}
                        სამუდამოდ წაშლა
                    </button>
                </div>
            </form>
        </dialog>
    );
}
