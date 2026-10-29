"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, type ReactNode } from "react";

type ConfirmDialogProps = {
    open: boolean;
    title: string;
    children: ReactNode;
    confirmLabel: string;
    danger?: boolean;
    busy?: boolean;
    error?: string;
    onConfirm: () => void;
    onClose: () => void;
};

// Native <dialog>: focus trapping, Escape and backdrop dismissal come from the browser.
export default function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, error, onConfirm, onClose }: ConfirmDialogProps) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return <dialog ref={ref} onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }}
        className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-[var(--marteo-overlay)] backdrop:backdrop-blur-sm">
        <div className="p-5">
            <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-danger/12 text-danger" : "bg-accent/12 text-accent"}`}>
                    <Icon icon={danger ? "solar:danger-triangle-bold-duotone" : "solar:question-circle-bold-duotone"} className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-base font-semibold">{title}</h2>
                    <div className="mt-1 text-sm leading-6 text-text-secondary">{children}</div>
                </div>
            </div>
            {error && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={onClose} disabled={busy} className="h-11 rounded-xl border border-border px-4 text-sm font-medium transition hover:bg-background disabled:opacity-60">გაუქმება</button>
                <button type="button" onClick={onConfirm} disabled={busy}
                    className={`h-11 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-60 ${danger ? "bg-danger hover:opacity-90" : "bg-accent hover:bg-accent-hover"}`}>
                    {busy ? "სრულდება…" : confirmLabel}
                </button>
            </div>
        </div>
    </dialog>;
}
