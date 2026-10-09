"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import type { OrderInvoiceData } from "@/lib/orders/invoice-types";
import InvoiceDocument, { isInvoicePaper, type InvoicePaper } from "./InvoiceDocument";

const EMPTY_IDS: string[] = [];
type Entry = { id: string; invoice: OrderInvoiceData };
export default function InvoiceBatchPrintPage({ ids = EMPTY_IDS, mode, selectionKey }: { ids?: string[]; mode?: "new" | "pending"; selectionKey?: string }) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [paper, setPaper] = useState<InvoicePaper>("a4");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [prompt, setPrompt] = useState(false);
    const [confirmed, setConfirmed] = useState<string[]>([]);
    const [rollHeight, setRollHeight] = useState(200);
    const sheets = useRef<HTMLDivElement>(null);
    const operation = useRef(false);
    const [total, setTotal] = useState<number | null>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        async function load() {
            try {
                const preference = localStorage.getItem("marteo.invoice-paper");
                if (isInvoicePaper(preference)) setPaper(preference);
            } catch { /* არჩევანი მაინც მუშაობს */ }
            const loaded: Entry[] = [];
            try {
                let requestedIds = ids;
                if (selectionKey) {
                    const value = sessionStorage.getItem(`marteo.invoice-selection.${selectionKey}`);
                    const parsed: unknown = value ? JSON.parse(value) : null;
                    if (!Array.isArray(parsed) || !parsed.every(id => typeof id === "string" && id.trim())) throw new Error("მონიშვნა ვერ მოიძებნა. შეკვეთებიდან ხელახლა გახსენი ბეჭდვა.");
                    requestedIds = [...new Set(parsed as string[])];
                }
                if (mode) {
                    requestedIds = [];
                    let cursor: string | null = null;
                    let snapshot = "";
                    do {
                        const params = new URLSearchParams({ mode });
                        if (snapshot) params.set("snapshot", snapshot);
                        if (cursor) params.set("cursor", cursor);
                        const response = await fetch(`/api/orders/invoices/pending?${params}`, { cache: "no-store", signal: controller.signal });
                        const data = await response.json() as { success?: boolean; message?: string; ids?: string[]; cursor?: string | null; snapshot?: string };
                        if (!response.ok || !data.success || !data.ids || !data.snapshot) throw new Error(data.message || "ბეჭდვის რიგი ვერ ჩაიტვირთა.");
                        requestedIds.push(...data.ids); snapshot = data.snapshot; cursor = data.cursor ?? null;
                    } while (cursor);
                }
                if (active) setTotal(requestedIds.length);
                for (const id of requestedIds) {
                    const response = await fetch(`/api/orders/${encodeURIComponent(id)}/invoice`, { cache: "no-store", signal: controller.signal });
                    const data = await response.json() as { success?: boolean; message?: string; invoice?: OrderInvoiceData };
                    if (!response.ok || !data.success || !data.invoice) throw new Error(data.message || "ინვოისი ვერ ჩაიტვირთა.");
                    loaded.push({ id, invoice: data.invoice });
                    if (active) setEntries([...loaded]);
                }
                if (active) setReady(true);
            } catch (cause: unknown) {
                if (active) setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "ჩატვირთვა შეწყდა. განაახლე გვერდი.");
            }
        }
        void load();
        return () => { active = false; controller.abort(); };
    }, [ids, mode, selectionKey]);
    useEffect(() => {
        const afterPrint = () => setPrompt(true);
        window.addEventListener("afterprint", afterPrint);
        return () => window.removeEventListener("afterprint", afterPrint);
    }, []);
    useEffect(() => {
        const element = sheets.current;
        if (
            !element ||
            (paper !== "58mm" && paper !== "80mm")
        ) return;
        const observer = new ResizeObserver(() => {
            const heights = Array.from(element.querySelectorAll<HTMLElement>(".batch-sheet")).map(sheet => {
                const rect = sheet.getBoundingClientRect();
                return rect.width ? Math.ceil(rect.height / rect.width * (paper === "80mm" ? 74 : 52)) + 8 : 50;
            });
            setRollHeight(heights.reduce((maximum, height) => Math.max(maximum, height), 50));
        });
        element.querySelectorAll(".batch-sheet").forEach(sheet => observer.observe(sheet));
        return () => observer.disconnect();
    }, [entries, paper]);
    async function print() {
        if (!ready || !entries.length || operation.current || !sheets.current) return;
        operation.current = true; setBusy(true); setError("");
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                Promise.all([document.fonts.ready, ...Array.from(sheets.current.querySelectorAll("img")).map(image => image.decode())]),
                new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("მომზადება შეწყდა. გადაამოწმე სურათები და სცადე ხელახლა.")), 15000); }),
            ]);
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            window.print(); setPrompt(true);
        } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "ბეჭდვა ვერ მომზადდა."); }
        finally { if (timeout) clearTimeout(timeout); operation.current = false; setBusy(false); }
    }
    async function confirm() {
        if (!ready || operation.current) return;
        operation.current = true; setBusy(true); setError("");
        const completed = [...confirmed];
        try {
            for (const entry of entries) {
                if (completed.includes(entry.id)) continue;
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 30000);
                try {
                    const response = await fetch(`/api/orders/${encodeURIComponent(entry.id)}/invoice/printed`, {
                        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: entry.invoice.version }), signal: controller.signal,
                    });
                    const data = await response.json() as { success?: boolean; message?: string };
                    if (!response.ok || !data.success) throw new Error(data.message || "მონიშვნა ვერ მოხერხდა.");
                    completed.push(entry.id); setConfirmed([...completed]);
                } finally { clearTimeout(timeout); }
            }
            setPrompt(false);
        } catch (cause: unknown) { setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "კავშირი შეწყდა. სცადე ხელახლა; უკვე მონიშნული ინვოისები შენახულია."); }
        finally { operation.current = false; setBusy(false); }
    }
    const width =
        paper === "a4"
            ? "186mm"
            : paper === "100x150"
                ? "94mm"
                : paper === "80mm"
                    ? "74mm"
                    : "52mm";

    const pageSize =
        paper === "a4"
            ? "A4"
            : paper === "100x150"
                ? "100mm 150mm"
                : `${paper === "80mm" ? 80 : 58}mm ${rollHeight}mm`;
    return <main className="batch-page min-h-dvh bg-slate-100 p-3 text-slate-900 sm:p-6">
        <style>{`
            @page {
    size:${pageSize};
    margin:${paper === "a4" ? "12mm" : "3mm"};
}
            @media print {
                html,body { display:block!important; height:auto!important; margin:0!important; padding:0!important; overflow:visible!important; background:white!important; }
                .batch-page { min-height:0!important; padding:0!important; }
                .batch-controls { display:none!important; }
                .batch-scroll { overflow:visible!important; }
                .batch-sheet { width:${width}!important; margin:0!important; padding:0!important; box-shadow:none!important; break-after:page; }
                .batch-sheet:last-child { break-after:auto; }
            }
        `}</style>
        <div className="batch-controls mx-auto mb-4 max-w-3xl space-y-3">
            <h1 className="text-xl font-semibold">ინვოისები — {entries.length} / {total ?? "…"}</h1>
            <div className="flex flex-wrap gap-3">
                <select aria-label="ბეჭდვის ფორმატი" value={paper} disabled={busy} onChange={event => {
                    if (!isInvoicePaper(event.target.value)) return;
                    setPaper(event.target.value);
                    try { localStorage.setItem("marteo.invoice-paper", event.target.value); } catch { /* არჩევანი მუშაობს */ }
                }} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-[16px]"><option value="a4">A4</option><option value="100x150">10 × 15 სმ</option><option value="80mm">80 მმ</option><option value="58mm">58 მმ</option></select>
                <button disabled={!ready || !entries.length || busy} onClick={print} className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-4 font-semibold text-white disabled:opacity-50"><Icon icon="solar:documents-linear" className="h-5 w-5" />{busy ? "მზადდება…" : "ყველას ბეჭდვა / PDF"}</button>
                <a href="/dashboard/orders" className="inline-flex h-11 items-center px-3">შეკვეთები</a>
            </div>
            <p className="text-xs text-slate-600">თითო ინვოისი ცალკე გვერდიდან იწყება. გამორთე ბრაუზერის ჰედერი/ფუტერი და გამოიყენე 100% მასშტაბი. თერმული ფორმატისთვის პრინტერშიც აირჩიე შესაბამისი ქაღალდი.</p>
            {ready && entries.length === 0 && <p role="status">დასაბეჭდი ინვოისები არ არის.</p>}
            {!ready && !error && <p role="status">ინვოისები იტვირთება…</p>}
            {error && <p role="alert" className="text-sm text-red-700">{error} {!ready && <button onClick={() => window.location.reload()} className="underline">ხელახლა ჩატვირთვა</button>}</p>}
            {ready && entries.length > 0 && <div className="rounded-xl border border-slate-300 bg-white p-3 text-sm">
                <p role="status">დადასტურებულია: {confirmed.length} / {entries.length}</p>
                {confirmed.length < entries.length && <>
                    {prompt && <p className="mt-2">ყველა ინვოისი წარმატებით დაბეჭდე ან PDF-ად შეინახე?</p>}
                    <button disabled={busy} onClick={confirm} className="mt-2 rounded-lg bg-success px-3 py-2 font-semibold text-white disabled:opacity-50">ყველა მონიშნე დაბეჭდილად</button>
                    {prompt && <button disabled={busy} onClick={() => setPrompt(false)} className="ml-3 underline">ჯერ არა</button>}
                </>}
            </div>}
        </div>
        <div ref={sheets} className="batch-scroll overflow-x-auto">{entries.map(entry => <div key={entry.id} className="batch-sheet mx-auto mb-5 bg-white shadow-sm" style={{ width }}><InvoiceDocument invoice={entry.invoice} paper={paper} /></div>)}</div>
    </main>;
}
