"use client";

import { useEffect, useId, useRef, useState } from "react";
import InvoiceDocument, { isInvoicePaper, type InvoicePaper } from "./InvoiceDocument";
import { sendOrderAction } from "@/lib/orders/order-actions-client";
import { Icon } from "@iconify/react";
import type { OrderInvoiceData } from "@/lib/orders/invoice-types";

export default function OrderInvoiceButton({ orderId }: { orderId: string }) {
    const [paper, setPaper] = useState<InvoicePaper>("a4");
    const [invoice, setInvoice] = useState<OrderInvoiceData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [linkBusy, setLinkBusy] = useState(false);
    const linkOperation = useRef(false);
    const isOpen = Boolean(invoice);
    const [notice, setNotice] = useState("");
    const dialog = useRef<HTMLDialogElement>(null);
    const request = useRef<AbortController | null>(null);
    const mounted = useRef(false);
    const headingId = useId();
    const errorId = useId();

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; request.current?.abort(); };
    }, []);
    useEffect(() => {
        if (!isOpen) return;
        const element = dialog.current;
        element?.showModal();
        const previous = document.body.style.overflow;
        if (previous !== "hidden") document.body.style.overflow = "hidden";
        return () => {
            element?.close();
            if (previous !== "hidden") document.body.style.overflow = previous;
        };
    }, [isOpen]);

    async function openInvoice() {
        if (request.current) return;
        setLoading(true); setError(""); setNotice("");
        const controller = new AbortController();
        request.current = controller;
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice`, {
                cache: "no-store", signal: controller.signal,
            });
            const data = await response.json() as { success?: boolean; message?: string; invoice?: OrderInvoiceData };
            if (!response.ok || !data.success || !data.invoice) throw new Error(data.message || "ინვოისის მომზადება ვერ მოხერხდა.");
            if (mounted.current) {
                try { const saved = localStorage.getItem("marteo.invoice-paper"); if (isInvoicePaper(saved)) setPaper(saved); } catch { /* გამოიყენება A4 */ }
                setInvoice(data.invoice as OrderInvoiceData);
            }
        } catch (cause: unknown) {
            if (mounted.current) setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "ინვოისის ჩატვირთვა შეწყდა. სცადე ხელახლა.");
        } finally {
            clearTimeout(timeout); request.current = null;
            if (mounted.current) setLoading(false);
        }
    }
    async function changeLink(action: "create" | "rotate" | "revoke") {
        if (!invoice || linkOperation.current) return;
        if (action !== "create" && !window.confirm(action === "revoke" ? "ბმულის გაუქმების შემდეგ კლიენტი ამ ბმულით და ძველი QR-ით შეკვეთას ვეღარ ნახავს. გავაუქმოთ?" : "ახალი ბმულის შექმნისას ძველი ბმული და QR აღარ იმუშავებს. გავაგრძელოთ?")) return;
        linkOperation.current = true; setLinkBusy(true); setNotice("");
        try {
            await sendOrderAction(orderId, "link", { action, expectedVersion: invoice.version });
            const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice`, { cache: "no-store" });
            const data = await response.json() as { success?: boolean; message?: string; invoice?: OrderInvoiceData };
            if (!response.ok || !data.success || !data.invoice) throw new Error(data.message || "ბმული შეიცვალა. ინვოისი ხელახლა გახსენი.");
            if (mounted.current && dialog.current?.open) { setInvoice(data.invoice); setNotice(action === "revoke" ? "ბმული გაუქმებულია." : "ბმული მზადაა."); }
        } catch (cause: unknown) { if (mounted.current) setNotice(cause instanceof Error ? cause.message : "ბმული ვერ შეიცვალა."); }
        finally { linkOperation.current = false; if (mounted.current) setLinkBusy(false); }
    }
    function close() { setInvoice(null); setNotice(""); }
    async function copyLink() {
        if (!invoice?.publicUrl) return;
        try { await navigator.clipboard.writeText(invoice.publicUrl); setNotice("ბმული დაკოპირებულია."); }
        catch { setNotice("კოპირება ვერ მოხერხდა. ბმული ქვემოთ მოცემული ველიდან დააკოპირე."); }
    }
    async function shareLink() {
        if (!invoice?.publicUrl) return;
        if (!navigator.share) { await copyLink(); return; }
        try {
            await navigator.share({ title: `${invoice.business.name} — შეკვეთა`, url: invoice.publicUrl });
        } catch (cause: unknown) {
            if (!(cause instanceof Error && cause.name === "AbortError")) setNotice("გაზიარება ვერ მოხერხდა. შეგიძლია ბმული დააკოპირო.");
        }
    }

    return <>
        <button type="button" onClick={openInvoice} disabled={loading} aria-label="ინვოისის ნახვა" title="ინვოისი" aria-busy={loading} aria-describedby={error ? errorId : undefined} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-accent transition hover:border-accent disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
            <Icon icon={loading ? "solar:refresh-linear" : "solar:document-text-linear"} className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </button>
        {error && <span id={errorId} role="alert" className="block max-w-64 text-xs text-danger">{error}</span>}
        <dialog ref={dialog} onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }} onClose={event => { event.stopPropagation(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }} aria-labelledby={headingId} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-3xl overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm">
            {invoice && <>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface p-3 sm:px-5">
                    <h2 id={headingId} className="flex items-center gap-2 font-semibold"><Icon icon="solar:document-text-linear" className="h-5 w-5 text-accent" />ინვოისი</h2>
                    <button type="button" onClick={close} aria-label="დახურვა" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border"><Icon icon="solar:close-circle-linear" className="h-6 w-6" /></button>
                </div>
                <div className="p-3 sm:p-5">
                    <p className="mb-3 text-xs text-text-secondary">{invoice.printState === "NEW" ? "ახალი ინვოისი" : invoice.printState === "UPDATED" ? "ინვოისი განახლებულია — საჭიროა ხელახლა ბეჭდვა" : "მონიშნულია დაბეჭდილად"} · ვერსია {invoice.version}</p>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <select aria-label="ინვოისის ფორმატი" value={paper} onChange={event => {
                            if (!isInvoicePaper(event.target.value)) return;
                            setPaper(event.target.value);
                            try { localStorage.setItem("marteo.invoice-paper", event.target.value); } catch { /* არჩევანი მაინც მუშაობს */ }
                        }} className="h-11 max-w-full rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary lg:text-sm">
                            <option value="a4">A4</option><option value="100x150">10 × 15 სმ</option><option value="80mm">თერმული — 80 მმ</option><option value="58mm">თერმული — 58 მმ</option>
                        </select>
                        <a href={`/print/orders/${encodeURIComponent(orderId)}?format=${paper}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white"><Icon icon="solar:document-text-linear" className="h-5 w-5" />ბეჭდვა / PDF</a>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 sm:p-7"><InvoiceDocument invoice={invoice} paper={paper} /></div>
                    {invoice.publicUrl ? <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2"><button type="button" onClick={copyLink} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm"><Icon icon="solar:copy-linear" className="h-5 w-5 text-accent" />ბმულის კოპირება</button><button type="button" onClick={shareLink} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm"><Icon icon="solar:share-linear" className="h-5 w-5 text-accent" />გაზიარება</button><a href={invoice.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm">კლიენტის გვერდი</a></div>
                        <label className="block min-w-0"><span className="mb-1 block text-xs text-text-secondary">კლიენტის ბმული</span><input readOnly value={invoice.publicUrl} onFocus={event => event.currentTarget.select()} className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary lg:text-sm" /></label>
                    </div> : <p className="mt-4 text-sm text-text-secondary">ამ შეკვეთაზე კლიენტის ბმული ჯერ არ არის შექმნილი.</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                        {invoice.publicUrl ? <>
                            <button type="button" disabled={linkBusy} onClick={() => changeLink("rotate")} className="min-h-11 rounded-xl border border-border px-3 text-sm">ბმულის შეცვლა</button>
                            <button type="button" disabled={linkBusy} onClick={() => changeLink("revoke")} className="min-h-11 rounded-xl border border-danger/30 px-3 text-sm text-danger">ბმულის გაუქმება</button>
                        </> : <button type="button" disabled={linkBusy} onClick={() => changeLink("create")} className="min-h-11 rounded-xl border border-border px-3 text-sm">კლიენტის ბმულის შექმნა</button>}
                        {linkBusy && <span role="status" className="self-center text-sm text-text-secondary">ინახება…</span>}
                    </div>
                    <p role="status" aria-live="polite" className="mt-2 text-sm text-text-secondary">{notice}</p>
                </div>
            </>}
        </dialog>
    </>;
}
