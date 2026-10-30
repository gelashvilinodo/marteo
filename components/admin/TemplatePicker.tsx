"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Template = { id: string; title: string; body: string };

// {name} becomes the contact's first name, or disappears cleanly when unknown.
export function fillTemplate(body: string, name: string) {
    return name ? body.replaceAll("{name}", name) : body.replace(/,?\s*\{name\}/g, "");
}

export default function TemplatePicker({ contactName, onPick }: { contactName: string; onPick: (text: string) => void }) {
    const [open, setOpen] = useState(false);
    const [templates, setTemplates] = useState<Template[] | null>(null);
    const [error, setError] = useState(false);
    const [query, setQuery] = useState("");
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open || templates) return;
        fetch("/api/admin/support/templates", { cache: "no-store" })
            .then(response => response.ok ? response.json() as Promise<{ templates: Template[] }> : Promise.reject(new Error(String(response.status))))
            .then(data => setTemplates(data.templates))
            .catch(() => setError(true));
    }, [open, templates]);

    useEffect(() => {
        if (!open) return;
        const close = (event: Event) => {
            if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", close);
        document.addEventListener("keydown", close);
        return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
    }, [open]);

    const term = query.trim().toLowerCase();
    const visible = (templates ?? []).filter(item => !term || item.title.toLowerCase().includes(term) || item.body.toLowerCase().includes(term));

    return <div ref={root} className="relative shrink-0">
        <button type="button" onClick={() => { setOpen(value => !value); setError(false); }} aria-expanded={open} aria-label="სწრაფი პასუხები" title="სწრაფი პასუხები"
            className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${open ? "border-accent bg-accent/10 text-accent" : "border-border text-text-secondary hover:text-accent"}`}>
            <Icon icon="solar:bolt-bold-duotone" className="h-5 w-5" aria-hidden="true" />
        </button>
        {open && <div className="support-message-in absolute bottom-full left-0 z-20 mb-2 flex max-h-[min(420px,60dvh)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="border-b border-border p-2">
                <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="ძებნა შაბლონებში"
                    className="h-10 w-full rounded-xl bg-background px-3 text-base text-text-primary outline-none placeholder:text-text-secondary sm:text-sm" />
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-1">
                {!templates && !error && <li className="px-3 py-4 text-sm text-text-secondary">იტვირთება…</li>}
                {error && <li className="px-3 py-4 text-sm text-danger">შაბლონები ვერ ჩაიტვირთა.</li>}
                {templates && !visible.length && <li className="px-3 py-4 text-sm text-text-secondary">{templates.length ? "ვერ მოიძებნა." : "შაბლონები ჯერ არ გაქვს."}</li>}
                {visible.map(item => <li key={item.id}>
                    <button type="button" onClick={() => { onPick(fillTemplate(item.body, contactName)); setOpen(false); setQuery(""); }}
                        className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-background">
                        <span className="block text-sm font-medium text-text-primary">{item.title}</span>
                        <span className="line-clamp-2 block text-xs text-text-secondary">{fillTemplate(item.body, contactName)}</span>
                    </button>
                </li>)}
            </ul>
            <Link href="/admin/support/templates" prefetch={false} className="flex items-center justify-center gap-1.5 border-t border-border px-3 py-2.5 text-xs font-medium text-accent hover:bg-background">
                <Icon icon="solar:pen-linear" className="h-3.5 w-3.5" aria-hidden="true" /> შაბლონების მართვა
            </Link>
        </div>}
    </div>;
}
