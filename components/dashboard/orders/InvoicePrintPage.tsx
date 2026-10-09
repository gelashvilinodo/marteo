"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import type { OrderInvoiceData } from "@/lib/orders/invoice-types";
import InvoiceDocument, { type InvoicePaper, isInvoicePaper } from "./InvoiceDocument";

export default function InvoicePrintPage({ orderId, initialPaper }: { orderId: string; initialPaper: InvoicePaper }) {
    const [paper, setPaper] = useState(initialPaper);
    const [invoice, setInvoice] = useState<OrderInvoiceData | null>(null);
    const [error, setError] = useState("");
    const [printing, setPrinting] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [confirmPrompt, setConfirmPrompt] = useState(false);
    const confirmationInFlight = useRef(false);
    const [rollHeight, setRollHeight] = useState(200);
    const sheet = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        let active = true;
        async function load() {
            try {
                const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice`, { cache: "no-store", signal: controller.signal });
                const data = await response.json() as { success?: boolean; message?: string; invoice?: OrderInvoiceData };
                if (!response.ok || !data.success || !data.invoice) throw new Error(data.message || "ინვოისი ვერ ჩაიტვირთა.");
                if (active) setInvoice(data.invoice);
            } catch (cause: unknown) {
                if (active) setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "ინვოისის ჩატვირთვა შეწყდა. სცადე ხელახლა.");
            } finally { clearTimeout(timeout); }
        }
        void load();
        return () => { active = false; clearTimeout(timeout); controller.abort(); };
    }, [orderId]);

    useEffect(() => {
        const element = sheet.current;
        if (
            !element ||
            (paper !== "58mm" && paper !== "80mm")
        ) return;
        const observer = new ResizeObserver(() => {
            const rectangle = element.getBoundingClientRect();
            if (rectangle.width > 0) {
                const contentWidth = paper === "80mm" ? 74 : 52;
                setRollHeight(Math.max(50, Math.ceil(rectangle.height / rectangle.width * contentWidth) + 8));
            }
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [invoice, paper]);

    useEffect(() => {
        const afterPrint = () => setConfirmPrompt(true);
        window.addEventListener("afterprint", afterPrint);
        return () => window.removeEventListener("afterprint", afterPrint);
    }, []);

    async function confirmPrinted() {
        if (!invoice || confirmationInFlight.current) return;
        confirmationInFlight.current = true;
        setConfirming(true); setError("");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice/printed`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ version: invoice.version }), signal: controller.signal,
            });
            const data = await response.json() as { success?: boolean; message?: string; printedAt?: string };
            if (!response.ok || !data.success || !data.printedAt) throw new Error(data.message || "მონიშვნა ვერ მოხერხდა.");
            const printedAt = data.printedAt;
            setInvoice(current => current ? { ...current, printState: "PRINTED", printedAt } : current);
            setConfirmPrompt(false);
        } catch (cause: unknown) {
            setError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "კავშირი შეწყდა. მონიშვნა ხელახლა სცადე.");
        } finally {
            clearTimeout(timeout); confirmationInFlight.current = false; setConfirming(false);
        }
    }

    async function print() {
        if (!invoice || printing || !sheet.current) return;
        setPrinting(true); setError("");
        try {
            const images = Array.from(sheet.current.querySelectorAll("img"));
            let preparationTimeout: ReturnType<typeof setTimeout> | undefined;
            try {
                await Promise.race([
                    Promise.all([document.fonts.ready, ...images.map(image => image.decode())]),
                    new Promise<never>((_, reject) => {
                        preparationTimeout = setTimeout(() => reject(new Error("Print preparation timed out")), 15000);
                    }),
                ]);
            } finally {
                if (preparationTimeout) clearTimeout(preparationTimeout);
            }
            if (paper === "58mm" || paper === "80mm") {
                const contentWidth = paper === "80mm" ? 74 : 52;
                const rectangle = sheet.current.getBoundingClientRect();
                const height = Math.ceil(rectangle.height / rectangle.width * contentWidth) + 8;
                setRollHeight(Math.max(50, height));
                await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            }
            window.print();
            setConfirmPrompt(true);
        } catch {
            setError("ბეჭდვის მომზადება ვერ მოხერხდა. გადაამოწმე სურათების ჩატვირთვა და სცადე ხელახლა.");
        } finally { setPrinting(false); }
    }

    const pageSize =
        paper === "a4"
            ? "A4"
            : paper === "100x150"
                ? "100mm 150mm"
                : `${paper === "80mm" ? 80 : 58}mm ${rollHeight}mm`;

    const width =
        paper === "a4"
            ? "186mm"
            : paper === "100x150"
                ? "94mm"
                : paper === "80mm"
                    ? "74mm"
                    : "52mm";
    return <main className="invoice-print-page min-h-dvh bg-slate-100 p-3 text-slate-900 sm:p-6">
        <style>{`
            @page { size:${pageSize}; margin:${paper === "a4" ? "12mm" : "3mm"}; }
            @media print {
                html,body { display:block!important; height:auto!important; min-height:0!important; margin:0!important; padding:0!important; overflow:visible!important; background:white!important; }
                .invoice-print-page { min-height:0!important; margin:0!important; padding:0!important; background:white!important; }
                .invoice-print-controls { display:none!important; }
                .invoice-print-scroll { overflow:visible!important; }
                .invoice-print-sheet { width:${width}!important; max-width:none!important; padding:0!important; margin:0!important; border:0!important; box-shadow:none!important; }
            }
        `}</style>
        <div className="invoice-print-controls mx-auto mb-4 max-w-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-3">
                <select aria-label="ბეჭდვის ფორმატი" value={paper} disabled={printing} onChange={event => {
                    if (!isInvoicePaper(event.target.value)) return;
                    setPaper(event.target.value);
                    try { localStorage.setItem("marteo.invoice-paper", event.target.value); } catch { /* არჩევანი მაინც მუშაობს */ }
                }} className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-[16px]">
                    <option value="a4">A4</option><option value="100x150">10 × 15 სმ</option><option value="80mm">თერმული — 80 მმ</option><option value="58mm">თერმული — 58 მმ</option>
                </select>
                <button type="button" disabled={!invoice || printing || confirming} onClick={print} className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-5 text-sm font-semibold text-white disabled:opacity-50"><Icon icon="solar:document-text-linear" className="h-5 w-5" />{printing ? "მზადდება…" : "ბეჭდვა / PDF"}</button>
                <a href="/dashboard/orders" className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm">შეკვეთები</a>
            </div>
            {invoice && <div className="rounded-xl border border-slate-300 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2">
                        <Icon icon={invoice.printState === "PRINTED" ? "solar:check-circle-linear" : "solar:document-text-linear"} className="h-5 w-5" />
                        {invoice.printState === "PRINTED" ? "დაბეჭდილია" : invoice.printState === "UPDATED" ? "შეცვლილია — ხელახლა დასაბეჭდია" : "ჯერ არ დაბეჭდილა"}
                    </span>
                    {invoice.printState !== "PRINTED" && <button type="button" disabled={confirming || printing} onClick={confirmPrinted} className="rounded-lg bg-success px-3 py-2 font-semibold text-white disabled:opacity-50">{confirming ? "ინახება…" : "მონიშნე დაბეჭდილად"}</button>}
                </div>
                {invoice.printedAt && <p className="mt-2 text-xs text-slate-500">ბოლო დადასტურება: {new Intl.DateTimeFormat("ka-GE", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tbilisi" }).format(new Date(invoice.printedAt))}</p>}
                {confirmPrompt && invoice.printState !== "PRINTED" && <div className="mt-3 border-t border-slate-200 pt-3">
                    <p>ინვოისი წარმატებით დაბეჭდე ან PDF-ად შეინახე? დაადასტურე ზემოთ მდებარე ღილაკით.</p>
                    <button type="button" disabled={confirming} onClick={() => setConfirmPrompt(false)} className="mt-2 text-slate-500 underline">ჯერ არა</button>
                </div>}
            </div>}
            <p className="text-xs text-slate-600">ბეჭდვის ფანჯარაში აირჩიე პრინტერი ან PDF-ად შენახვა. გამორთე ბრაუზერის ჰედერი/ფუტერი და გამოიყენე 100% მასშტაბი.</p>
            {(paper === "58mm" || paper === "80mm") && (
                <p className="text-xs text-slate-600">
                    პრინტერის პარამეტრებშიც აირჩიე შესაბამისი ქაღალდის
                    სიგანე. რულონის სიგრძისა და ჭრის მხარდაჭერა
                    დრაივერზეა დამოკიდებული.
                </p>
            )}

            {paper === "100x150" && (
                <p className="text-xs text-slate-600">
                    პრინტერის პარამეტრებში აირჩიე 100 × 150 მმ ქაღალდი.
                    ბევრი პროდუქტის შემთხვევაში ინვოისი რამდენიმე
                    გვერდზე გაგრძელდება.
                </p>
            )}
            {error && <div role="alert" className="rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700">{error}<button type="button" onClick={() => window.location.reload()} className="ml-3 underline">ხელახლა ცდა</button></div>}
            {!invoice && !error && <p role="status" className="text-sm">ინვოისი იტვირთება…</p>}
        </div>
        {invoice && <div className="invoice-print-scroll overflow-x-auto"><div ref={sheet} className="invoice-print-sheet mx-auto bg-white shadow-sm" style={{ width }}><InvoiceDocument invoice={invoice} paper={paper} /></div></div>}
    </main>;
}
