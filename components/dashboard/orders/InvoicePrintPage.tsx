"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import type { OrderInvoiceData } from "@/lib/orders/invoice-types";
import InvoiceDocument, { type InvoicePaper, isInvoicePaper } from "./InvoiceDocument";
import InvoicePreview from "./InvoicePreview";
import { prepareInvoiceQr } from "@/lib/orders/prepare-invoice-qr-client";

export default function InvoicePrintPage({ orderId, initialPaper }: { orderId: string; initialPaper: InvoicePaper }) {
    const [paper, setPaper] = useState(initialPaper);
    const [invoice, setInvoice] = useState<OrderInvoiceData | null>(null);
    const [error, setError] = useState("");
    const [printing, setPrinting] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const downloadInFlight = useRef(false);
    const [confirming, setConfirming] = useState(false);
    const [confirmPrompt, setConfirmPrompt] = useState(false);
    const confirmationInFlight = useRef(false);
    const [rollHeight, setRollHeight] = useState(200);
    const sheet = useRef<HTMLDivElement>(null);
    const [prepared, setPrepared] = useState<{
        paper: InvoicePaper;
        version: number;
    } | null>(null);
    const [preparationError, setPreparationError] = useState("");

    const printReady =
        Boolean(invoice) &&
        prepared?.paper === paper &&
        prepared?.version === invoice?.version;

    useEffect(() => {
        setPrepared(null);
        setPreparationError("");

        const element = sheet.current;
        if (!invoice || !element) return;

        let active = true;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let firstFrame = 0;
        let secondFrame = 0;

        async function prepare() {
            if (!element || !invoice) return;

            try {
                const images = Array.from(element.querySelectorAll("img"));

                await Promise.race([
                    Promise.all([
                        document.fonts.ready,
                        ...images.map(image => image.decode()),
                    ]),
                    new Promise<never>((_, reject) => {
                        timeout = setTimeout(
                            () => reject(new Error("Preparation timed out")),
                            15000,
                        );
                    }),
                ]);

                if (!active) return;

                if (paper === "58mm" || paper === "80mm") {
                    const rectangle = element.getBoundingClientRect();
                    if (rectangle.width <= 0) {
                        throw new Error("Invalid invoice width");
                    }

                    const contentWidth = paper === "80mm" ? 74 : 52;
                    setRollHeight(Math.max(
                        50,
                        Math.ceil(
                            rectangle.height / rectangle.width * contentWidth,
                        ) + 8,
                    ));
                }

                firstFrame = requestAnimationFrame(() => {
                    secondFrame = requestAnimationFrame(() => {
                        if (active) {
                            setPrepared({
                                paper,
                                version: invoice.version,
                            });
                        }
                    });
                });
            } catch {
                if (active) {
                    setPreparationError(
                        "ინვოისის მომზადება ვერ მოხერხდა. სცადე ხელახლა.",
                    );
                }
            } finally {
                if (timeout) clearTimeout(timeout);
            }
        }

        void prepare();

        return () => {
            active = false;
            if (timeout) clearTimeout(timeout);
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(secondFrame);
        };
    }, [invoice, paper]);

    useEffect(() => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        let active = true;
        async function load() {
            try {
                const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice`, { cache: "no-store", signal: controller.signal });
                const data = await response.json() as { success?: boolean; message?: string; invoice?: OrderInvoiceData };
                if (!response.ok || !data.success || !data.invoice) throw new Error(data.message || "ინვოისი ვერ ჩაიტვირთა.");
                const preparedInvoice = await prepareInvoiceQr(data.invoice, controller.signal);
                if (active && !controller.signal.aborted) setInvoice(preparedInvoice);
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

    function print() {
        if (!invoice || !printReady || printing || confirming) return;

        setPrinting(true);
        setError("");

        try {
            window.print();
            setConfirmPrompt(true);
        } catch {
            setError(
                "ბეჭდვის ფანჯარა ვერ გაიხსნა. სცადე ხელახლა.",
            );
        } finally {
            setPrinting(false);
        }
    }

    async function downloadPdf() {
        if (!invoice || downloadInFlight.current || printing) return;

        downloadInFlight.current = true;
        setDownloading(true);
        setError("");

        try {
            const { createInvoicePdf } = await import(
                "@/lib/orders/create-invoice-pdf"
            );

            const blob = await createInvoicePdf(invoice, paper);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download = `Marteo-invoice-${invoice.number === null
                ? orderId
                : String(invoice.number).padStart(4, "0")
                }-${paper}.pdf`;

            document.body.appendChild(link);

            try {
                link.click();
            } finally {
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
        } catch (cause: unknown) {
            setError(
                cause instanceof Error
                    ? cause.message
                    : "PDF-ის შექმნა ვერ მოხერხდა. სცადე ხელახლა.",
            );
        } finally {
            downloadInFlight.current = false;
            setDownloading(false);
        }
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
    return <main className="invoice-print-page min-h-dvh bg-background p-4 text-text-primary sm:p-6">
        <style>{`
            @page { size:${pageSize}; margin:${paper === "a4" ? "12mm" : "3mm"}; }
            @media print {
                html,body { display:block!important; height:auto!important; min-height:0!important; margin:0!important; padding:0!important; overflow:visible!important; background:white!important; }
                .invoice-print-page { min-height:0!important; margin:0!important; padding:0!important; background:white!important; }
                .invoice-print-controls { display:none!important; }
                .invoice-print-scroll { overflow:visible!important; }
                .invoice-preview-host,
.invoice-preview-stage {
    width:auto!important;
    max-width:none!important;
    height:auto!important;
    overflow:visible!important;
}

.invoice-preview-inner {
    position:static!important;
    width:auto!important;
    transform:none!important;
}
                .invoice-print-sheet { width:${width}!important; max-width:none!important; padding:0!important; margin:0!important; border:0!important; box-shadow:none!important; }
            }
        `}</style>
        <div className="invoice-print-controls mx-auto mb-6 max-w-3xl space-y-4 rounded-2xl border border-border bg-surface p-4 text-center sm:p-5">

            <div className="flex flex-wrap items-center justify-center gap-3">
                <div className="flex justify-start">
                    <a
                        href="/dashboard/orders"
                        className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-surface"
                    >
                        <Icon
                            icon="solar:arrow-left-linear"
                            className="h-5 w-5 text-accent"
                        />
                        უკან
                    </a>
                </div>
                <select aria-label="ბეჭდვის ფორმატი" value={paper} disabled={printing || downloading} onChange={event => {
                    if (!isInvoicePaper(event.target.value)) return;
                    setPaper(event.target.value);
                    try { localStorage.setItem("marteo.invoice-paper", event.target.value); } catch { /* არჩევანი მაინც მუშაობს */ }
                }} className="h-11 rounded-xl border border-border bg-background px-3 text-[16px]">
                    <option value="a4">A4</option><option value="100x150">10 × 15 სმ</option><option value="80mm">თერმული — 80 მმ</option><option value="58mm">თერმული — 58 მმ</option>
                </select>
                <button
                    type="button"
                    disabled={!printReady || printing || confirming || downloading}
                    onClick={print}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-5 text-sm font-semibold text-white disabled:opacity-50"
                >
                    <Icon
                        icon={!printReady && !preparationError
                            ? "solar:refresh-linear"
                            : "solar:document-text-linear"}
                        className={`h-5 w-5 ${!printReady && !preparationError
                            ? "motion-safe:animate-spin"
                            : ""
                            }`}
                    />
                    {preparationError
                        ? "ბეჭდვა მიუწვდომელია"
                        : !printReady
                            ? "მზადდება…"
                            : "ბეჭდვა / PDF"}
                </button>

                {preparationError && (
                    <span role="alert" className="text-sm text-danger">
                        {preparationError}
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="ml-2 underline"
                        >
                            ხელახლა ცდა
                        </button>
                    </span>
                )}
                <button
                    type="button"
                    disabled={!invoice || downloading || printing || confirming}
                    onClick={downloadPdf}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold disabled:opacity-50"
                >
                    <Icon
                        icon={downloading
                            ? "solar:refresh-linear"
                            : "solar:download-linear"}
                        className={`h-5 w-5 ${downloading ? "motion-safe:animate-spin" : ""
                            }`}
                    />
                    {downloading ? "PDF მზადდება…" : "PDF-ის გადმოწერა"}
                </button>
            </div>
            {invoice && <div className="rounded-xl border border-border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <span className="inline-flex items-center gap-2">
                        <Icon icon={invoice.printState === "PRINTED" ? "solar:check-circle-linear" : "solar:document-text-linear"} className="h-5 w-5" />
                        {invoice.printState === "PRINTED" ? "დაბეჭდილია" : invoice.printState === "UPDATED" ? "შეცვლილია — ხელახლა დასაბეჭდია" : "ჯერ არ დაბეჭდილა"}
                    </span>
                    {invoice.printState !== "PRINTED" && <button type="button" disabled={confirming || printing} onClick={confirmPrinted} className="rounded-lg bg-success px-3 py-2 font-semibold text-white disabled:opacity-50">{confirming ? "ინახება…" : "მონიშნე დაბეჭდილად"}</button>}
                </div>
                {invoice.printedAt && <p className="mt-2 text-xs text-text-secondary">ბოლო დადასტურება: {new Intl.DateTimeFormat("ka-GE", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tbilisi" }).format(new Date(invoice.printedAt))}</p>}
                {confirmPrompt && invoice.printState !== "PRINTED" && <div className="mt-3 border-t border-border pt-3">
                    <p>ინვოისი წარმატებით დაბეჭდე ან PDF-ად შეინახე? დაადასტურე ზემოთ მდებარე ღილაკით.</p>
                    <button type="button" disabled={confirming} onClick={() => setConfirmPrompt(false)} className="mt-2 text-text-secondary underline">ჯერ არა</button>
                </div>}
            </div>}
            <p className="text-xs text-text-secondary">ბეჭდვის ფანჯარაში აირჩიე პრინტერი ან PDF-ად შენახვა. გამორთე ბრაუზერის ჰედერი/ფუტერი და გამოიყენე 100% მასშტაბი.</p>
            {(paper === "58mm" || paper === "80mm") && (
                <p className="text-xs text-text-secondary">
                    პრინტერის პარამეტრებშიც აირჩიე შესაბამისი ქაღალდის
                    სიგანე. რულონის სიგრძისა და ჭრის მხარდაჭერა
                    დრაივერზეა დამოკიდებული.
                </p>
            )}

            {paper === "100x150" && (
                <p className="text-xs text-text-secondary">
                    პრინტერის პარამეტრებში აირჩიე 100 × 150 მმ ქაღალდი.
                    ბევრი პროდუქტის შემთხვევაში ინვოისი რამდენიმე
                    გვერდზე გაგრძელდება.
                </p>
            )}
            {error && <div role="alert" className="rounded-xl border border-danger/30 bg-background p-3 text-sm text-danger">{error}<button type="button" onClick={() => window.location.reload()} className="ml-3 underline">ხელახლა ცდა</button></div>}
            {!invoice && !error && <p role="status" className="text-sm">ინვოისი იტვირთება…</p>}
        </div>
        {invoice && (
            <div className="invoice-print-scroll mx-auto max-w-3xl">
                <InvoicePreview width={width}>
                    <div
                        ref={sheet}
                        className="invoice-print-sheet bg-white shadow-sm"
                        style={{ width }}
                    >
                        <InvoiceDocument invoice={invoice} paper={paper} />
                    </div>
                </InvoicePreview>
            </div>
        )}
    </main>;
}
