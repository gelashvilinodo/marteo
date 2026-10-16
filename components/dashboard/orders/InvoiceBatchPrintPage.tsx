"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import type { OrderInvoiceData } from "@/lib/orders/invoice-types";
import InvoiceDocument, { isInvoicePaper, type InvoicePaper } from "./InvoiceDocument";
import { prepareInvoiceQr } from "@/lib/orders/prepare-invoice-qr-client";
import InvoicePreview from "./InvoicePreview";
import { waitForInvoiceImage } from "@/lib/orders/wait-for-invoice-image";

const EMPTY_IDS: string[] = [];
type Entry = { id: string; invoice: OrderInvoiceData };
export default function InvoiceBatchPrintPage({ ids = EMPTY_IDS, mode, selectionKey }: { ids?: string[]; mode?: "new" | "pending"; selectionKey?: string }) {
    const [entries, setEntries] = useState<Entry[]>([]);
    const [paper, setPaper] = useState<InvoicePaper>("a4");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [pdfProgress, setPdfProgress] = useState("");
    const [prompt, setPrompt] = useState(false);
    const [confirmed, setConfirmed] = useState<string[]>([]);
    const [rollHeight, setRollHeight] = useState(200);
    const sheets = useRef<HTMLDivElement>(null);
    const operation = useRef(false);
    const [total, setTotal] = useState<number | null>(null);
    const [ready, setReady] = useState(false);
    const [prepared, setPrepared] = useState<{
        entries: Entry[];
        paper: InvoicePaper;
    } | null>(null);

    const [preparationError, setPreparationError] = useState("");

    const printReady =
        ready &&
        entries.length > 0 &&
        prepared?.entries === entries &&
        prepared?.paper === paper;

    useEffect(() => {
        setPrepared(null);
        setPreparationError("");

        const element = sheets.current;
        if (!ready || entries.length === 0 || !element) return;

        let active = true;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        async function prepare() {
            try {
                await Promise.race([
                    Promise.all([
                        document.fonts.ready,
                        ...Array.from(
                            element!.querySelectorAll("img"),
                        ).map(waitForInvoiceImage),
                    ]),
                    new Promise<never>((_, reject) => {
                        timeout = setTimeout(() => {
                            reject(new Error(
                                "ინვოისების მომზადების დრო ამოიწურა. განაახლე გვერდი და სცადე ხელახლა.",
                            ));
                        }, 15000);
                    }),
                ]);

                if (!active) return;

                if (paper === "58mm" || paper === "80mm") {
                    const contentWidth = paper === "80mm" ? 74 : 52;
                    const documents = Array.from(
                        element!.querySelectorAll<HTMLElement>(
                            ".batch-sheet",
                        ),
                    );

                    let maximumHeight = 50;

                    for (const document of documents) {
                        if (document.offsetWidth <= 0) {
                            throw new Error(
                                "ინვოისის ზომის განსაზღვრა ვერ მოხერხდა.",
                            );
                        }

                        maximumHeight = Math.max(
                            maximumHeight,
                            Math.ceil(
                                document.offsetHeight /
                                document.offsetWidth *
                                contentWidth,
                            ) + 8,
                        );
                    }

                    setRollHeight(maximumHeight);
                }

                await new Promise<void>(resolve => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => resolve());
                    });
                });

                if (active) setPrepared({ entries, paper });
            } catch (cause: unknown) {
                if (active) {
                    setPreparationError(
                        cause instanceof Error
                            ? cause.message
                            : "ინვოისების მომზადება ვერ მოხერხდა.",
                    );
                }
            } finally {
                if (timeout !== undefined) clearTimeout(timeout);
            }
        }

        void prepare();

        return () => {
            active = false;
            if (timeout !== undefined) clearTimeout(timeout);
        };
    }, [entries, paper, ready]);
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
                    const preparedInvoice = await prepareInvoiceQr(data.invoice, controller.signal);
                    if (!active || controller.signal.aborted) return;
                    loaded.push({ id, invoice: preparedInvoice });
                    setEntries([...loaded]);
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
    async function downloadPdf() {
        if (!printReady || operation.current) return;

        operation.current = true;
        setBusy(true);
        setError("");
        setPdfProgress("PDF მზადდება…");

        try {
            const [{ createInvoicePdf }, { PDFDocument }] =
                await Promise.all([
                    import("@/lib/orders/create-invoice-pdf"),
                    import("pdf-lib"),
                ]);

            const combined = await PDFDocument.create();

            for (let index = 0; index < entries.length; index++) {
                setPdfProgress(
                    `PDF მზადდება: ${index + 1} / ${entries.length}`,
                );

                const blob = await createInvoicePdf(
                    entries[index].invoice,
                    paper,
                );

                const source = await PDFDocument.load(
                    await blob.arrayBuffer(),
                );

                const pages = await combined.copyPages(
                    source,
                    source.getPageIndices(),
                );

                for (const page of pages) {
                    combined.addPage(page);
                }
            }

            combined.setTitle("Marteo — ინვოისები");
            combined.setCreator("Marteo");

            const bytes = await combined.save({
                objectsPerTick: 10,
            });

            const blob = new Blob(
                [new Uint8Array(bytes).buffer],
                { type: "application/pdf" },
            );

            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");

            link.href = url;
            link.download =
                `Marteo-invoices-${entries.length}-${paper}.pdf`;

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
            operation.current = false;
            setBusy(false);
            setPdfProgress("");
        }
    }
    function print() {
        if (!printReady || operation.current) return;

        const appleNavigator = navigator as Navigator & {
            standalone?: boolean;
        };

        const standalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            appleNavigator.standalone === true;

        const isIOS =
            /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (
                navigator.platform === "MacIntel" &&
                navigator.maxTouchPoints > 1
            );

        if (isIOS && standalone) {
            void downloadPdf();
            return;
        }

        operation.current = true;
        setBusy(true);
        setError("");

        try {
            window.print();
            setPrompt(true);
        } catch {
            setError("ბეჭდვის ფანჯარა ვერ გაიხსნა. სცადე ხელახლა.");
        } finally {
            operation.current = false;
            setBusy(false);
        }
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
    return <main className="batch-page min-h-dvh bg-background p-4 text-text-primary sm:p-6">
        <style>{`
            @page {
    size:${pageSize};
    margin:${paper === "a4" ? "12mm" : "3mm"};
}
            @media print {
                html,body { display:block!important; height:auto!important; margin:0!important; padding:0!important; overflow:visible!important; background:white!important; }
                .batch-page { min-height:0!important; padding:0!important; }
                .batch-controls { display:none!important; }
                .batch-scroll {
    width:100%!important;
    max-width:none!important;
    overflow:visible!important;
}
.batch-entry {
    margin:0!important;
    break-after:page;
}
.batch-entry:last-child {
    break-after:auto;
}
.batch-page .invoice-preview-host,
.batch-page .invoice-preview-stage {
    width:auto!important;
    max-width:none!important;
    height:auto!important;
    overflow:visible!important;
}
.batch-page .invoice-preview-inner {
    position:static!important;
    width:auto!important;
    transform:none!important;
}
.batch-sheet {
    width:${width}!important;
    max-width:none!important;
    margin:0!important;
    padding:0!important;
    box-shadow:none!important;
}
            }
        `}</style>
        <div className="batch-controls mx-auto mb-6 max-w-3xl space-y-4 rounded-2xl border border-border bg-surface p-4 text-center sm:p-5">
            <h1 className="text-xl font-semibold">ინვოისები — {entries.length} / {total ?? "…"}</h1>
            <div className="flex flex-wrap items-center justify-center gap-3">
                <a
                    href="/dashboard/orders"
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold transition-colors hover:bg-surface"
                >
                    <Icon icon="solar:arrow-left-linear" className="h-5 w-5 text-accent" />
                    უკან
                </a>
                <select aria-label="ბეჭდვის ფორმატი" value={paper} disabled={busy} onChange={event => {
                    if (!isInvoicePaper(event.target.value)) return;
                    setPaper(event.target.value);
                    try { localStorage.setItem("marteo.invoice-paper", event.target.value); } catch { /* არჩევანი მუშაობს */ }
                }} className="h-11 rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary"><option value="a4">A4</option><option value="100x150">10 × 15 სმ</option><option value="80mm">80 მმ</option><option value="58mm">58 მმ</option></select>
                <button
                    disabled={!printReady || busy}
                    onClick={print}
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-4 font-semibold text-white disabled:opacity-50"
                >
                    <Icon
                        icon="solar:documents-linear"
                        className="h-5 w-5"
                    />
                    {busy || (ready && entries.length > 0 && !printReady && !preparationError)
                        ? "მზადდება…"
                        : "ყველას ბეჭდვა / PDF"}
                </button>
                <button
                    type="button"
                    disabled={!printReady || busy}
                    onClick={downloadPdf}
                    className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold disabled:opacity-50"
                >
                    <Icon icon="solar:download-linear" className="h-5 w-5 text-accent" />
                    PDF-ის გადმოწერა
                </button>
                {pdfProgress && (
                    <p role="status" aria-live="polite" className="w-full text-sm text-text-secondary">
                        {pdfProgress}
                    </p>
                )}
            </div>
            <p className="text-xs leading-relaxed text-text-secondary">თითო ინვოისი ცალკე გვერდიდან იწყება. გამორთე ბრაუზერის ჰედერი/ფუტერი და გამოიყენე 100% მასშტაბი. თერმული ფორმატისთვის პრინტერშიც აირჩიე შესაბამისი ქაღალდი.</p>
            {ready && entries.length === 0 && <p role="status">დასაბეჭდი ინვოისები არ არის.</p>}
            {!ready && !error && <p role="status">ინვოისები იტვირთება…</p>}
            {preparationError && (
                <p role="alert" className="text-sm text-danger">
                    {preparationError}
                </p>
            )}
            {error && <p role="alert" className="text-sm text-danger">{error} {!ready && <button onClick={() => window.location.reload()} className="underline">ხელახლა ჩატვირთვა</button>}</p>}
            {ready && entries.length > 0 && <div className="rounded-xl border border-border bg-background p-3 text-sm">
                <p role="status">დადასტურებულია: {confirmed.length} / {entries.length}</p>
                {confirmed.length < entries.length && <>
                    {prompt && <p className="mt-2">ყველა ინვოისი წარმატებით დაბეჭდე ან PDF-ად შეინახე?</p>}
                    <button disabled={busy} onClick={confirm} className="mt-2 rounded-lg bg-success px-3 py-2 font-semibold text-white disabled:opacity-50">ყველა მონიშნე დაბეჭდილად</button>
                    {prompt && <button disabled={busy} onClick={() => setPrompt(false)} className="ml-3 underline">ჯერ არა</button>}
                </>}
            </div>}
        </div>
        <div
            ref={sheets}
            className="batch-scroll mx-auto w-full min-w-0 max-w-3xl"
        >
            {entries.map(entry => (
                <div key={entry.id} className="batch-entry mb-5">
                    <InvoicePreview width={width}>
                        <div
                            className="batch-sheet bg-white shadow-sm"
                            style={{ width }}
                        >
                            <InvoiceDocument
                                invoice={entry.invoice}
                                paper={paper}
                            />
                        </div>
                    </InvoicePreview>
                </div>
            ))}
        </div>
    </main>;
}
