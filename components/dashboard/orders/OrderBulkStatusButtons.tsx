"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { refreshOrdersAfterMutation } from "@/lib/orders/refresh-orders-client";
import type { BulkCompleteResult } from "@/lib/orders/bulk-order-status";

type Method = "CASH" | "BANK_TRANSFER" | "CARD";
type PaymentRow = BulkCompleteResult["needsPayment"][number];

const methods: Record<Method, string> = { CASH: "ნაღდი", BANK_TRANSFER: "გადარიცხვა", CARD: "ბარათი" };
const control = "h-10 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[16px] lg:text-sm";

async function send(body: Record<string, unknown>) {
    const response = await fetch("/api/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const result = await response.json() as { success?: boolean; message?: string } & Partial<BulkCompleteResult> & { shipped?: number };
    if (!response.ok || !result.success) throw new Error(result.message || "სტატუსი ვერ შეიცვალა.");
    return result;
}

export default function OrderBulkStatusButtons({
    processing,
    shipped,
    selection,
    onOpenOrder,
}: {
    processing: number;
    shipped: number;
    // მონიშვნის რეჟიმში ღილაკები მხოლოდ მონიშნულ შეკვეთებზე მოქმედებს და ყოველთვის ჩანს;
    // აქტიურია მხოლოდ მაშინ, როცა ყველა მონიშნულს შესაბამისი სტატუსი აქვს.
    selection?: { ids: string[]; canShip: boolean; canComplete: boolean };
    onOpenOrder: (orderId: string) => void;
}) {
    const router = useRouter();
    const dialog = useRef<HTMLDialogElement>(null);
    const [busy, setBusy] = useState<"" | "ship" | "complete">("");
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [open, setOpen] = useState(false);
    const [completedCount, setCompletedCount] = useState(0);
    const [rows, setRows] = useState<PaymentRow[]>([]);
    const [blocked, setBlocked] = useState<BulkCompleteResult["blocked"]>([]);
    const [received, setReceived] = useState<Record<string, boolean>>({});
    const [rowMethod, setRowMethod] = useState<Record<string, Method | "">>({});
    const [commonMethod, setCommonMethod] = useState<Method>("CASH");
    const [bankName, setBankName] = useState("");

    useEffect(() => {
        const element = dialog.current;
        if (open && !element?.open) element?.showModal();
        if (!open && element?.open) element.close();
    }, [open]);

    function show(result: BulkCompleteResult, completedBefore: number) {
        const completed = completedBefore + result.completed.length;
        setCompletedCount(completed);
        setRows(result.needsPayment);
        setBlocked(current => [...current.filter(row => !result.blocked.some(next => next.id === row.id)), ...result.blocked]);
        setReceived({});
        if (result.needsPayment.length || result.blocked.length) {
            setOpen(true);
        } else {
            setOpen(false);
            setNotice(completed ? `დასრულდა ${completed} შეკვეთა.` : "დასასრულებელი შეკვეთა არ მოიძებნა.");
        }
    }

    const scope = selection ? { orderIds: selection.ids } : {};

    async function ship() {
        const count = selection ? selection.ids.length : processing;
        if (busy || !window.confirm(`„მუშავდება“ სტატუსის ${count} ${selection ? "მონიშნული " : ""}შეკვეთა გადავიდეს „გაგზავნილზე“?`)) return;
        setBusy("ship"); setError(""); setNotice("");
        try {
            const result = await send({ action: "ship", ...scope });
            setNotice(`გაგზავნილზე გადავიდა ${result.shipped ?? 0} შეკვეთა.`);
            refreshOrdersAfterMutation(() => router.refresh());
        } catch (cause: unknown) {
            setError(cause instanceof Error ? cause.message : "სტატუსი ვერ შეიცვალა.");
        } finally { setBusy(""); }
    }

    async function complete() {
        if (busy) return;
        setBusy("complete"); setError(""); setNotice(""); setBlocked([]);
        try {
            const result = await send({ action: "complete", ...scope }) as BulkCompleteResult;
            show(result, 0);
            refreshOrdersAfterMutation(() => router.refresh());
        } catch (cause: unknown) {
            setError(cause instanceof Error ? cause.message : "სტატუსი ვერ შეიცვალა.");
        } finally { setBusy(""); }
    }

    async function confirmPayments() {
        const selected = rows.filter(row => received[row.id]);
        if (busy || !selected.length) return;
        setBusy("complete"); setError("");
        try {
            const result = await send({
                action: "complete",
                payments: selected.map(row => {
                    const method = rowMethod[row.id] || commonMethod;
                    return {
                        orderId: row.id,
                        remaining: row.remaining,
                        method,
                        bankName: method === "BANK_TRANSFER" ? bankName : "",
                    };
                }),
            }) as BulkCompleteResult;
            const skipped = rows.filter(row => !received[row.id]);
            show({ ...result, needsPayment: [...result.needsPayment, ...skipped] }, completedCount);
            refreshOrdersAfterMutation(() => router.refresh());
        } catch (cause: unknown) {
            setError(cause instanceof Error ? cause.message : "სტატუსი ვერ შეიცვალა.");
        } finally { setBusy(""); }
    }

    const checkedCount = rows.filter(row => received[row.id]).length;
    const allChecked = rows.length > 0 && checkedCount === rows.length;
    const needsBank = rows.some(row => received[row.id] && (rowMethod[row.id] || commonMethod) === "BANK_TRANSFER");

    const button = "inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm text-text-primary disabled:opacity-40";

    return <>
        {(selection || processing > 0) && (
            <button
                type="button"
                disabled={Boolean(busy) || (selection ? !selection.canShip : false)}
                onClick={() => void ship()}
                className={button}
            >
                <Icon icon={busy === "ship" ? "solar:refresh-linear" : "solar:delivery-linear"} className={`h-5 w-5 text-accent ${busy === "ship" ? "animate-spin" : ""}`} />
                {selection ? "მონიშნულები გაგზავნილად" : `ყველა გაგზავნილად (${processing})`}
            </button>
        )}
        {(selection || shipped > 0) && (
            <button
                type="button"
                disabled={Boolean(busy) || (selection ? !selection.canComplete : false)}
                onClick={() => void complete()}
                className={button}
            >
                <Icon icon={busy === "complete" ? "solar:refresh-linear" : "solar:check-circle-linear"} className={`h-5 w-5 text-success ${busy === "complete" ? "animate-spin" : ""}`} />
                {selection ? "მონიშნულების დასრულება" : `გაგზავნილების დასრულება (${shipped})`}
            </button>
        )}
        {(notice || (error && !open)) && (
            <span role="status" className={`text-xs ${error ? "text-danger" : "text-text-secondary"}`}>{error || notice}</span>
        )}

        <dialog
            ref={dialog}
            onCancel={event => { event.preventDefault(); if (!busy) setOpen(false); }}
            onClose={event => event.stopPropagation()}
            aria-label="გაგზავნილი შეკვეთების დასრულება"
            className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-text-primary shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm"
        >
            <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Icon icon="solar:check-circle-linear" className="h-6 w-6 text-success" />
                გაგზავნილი შეკვეთების დასრულება
            </h2>
            {completedCount > 0 && (
                <p className="mt-3 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
                    დასრულდა {completedCount} შეკვეთა, რომელზეც თანხა უკვე სრულად იყო მიღებული.
                </p>
            )}

            {rows.length > 0 && <section className="mt-4">
                <p className="text-sm text-text-secondary">
                    ამ შეკვეთებზე თანხა ბოლომდე არ არის აღრიცხული. მონიშნე, რომელზეც დარჩენილი თანხა რეალურად მიიღე, და მიუთითე გადახდის მეთოდი.
                </p>
                <div className="mt-3 grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2">
                    <label className="flex items-center gap-3 text-sm font-medium sm:col-span-2">
                        <input
                            type="checkbox"
                            checked={allChecked}
                            onChange={event => setReceived(Object.fromEntries(rows.map(row => [row.id, event.target.checked])))}
                            className="h-4 w-4 accent-accent"
                        />
                        ყველა თანხა სრულად მივიღე
                    </label>
                    <label className="block text-sm">
                        <span className="mb-1 block text-text-secondary">საერთო გადახდის მეთოდი</span>
                        <select value={commonMethod} onChange={event => setCommonMethod(event.target.value as Method)} className={control}>
                            {Object.entries(methods).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                        </select>
                    </label>
                    {needsBank && (
                        <label className="block text-sm">
                            <span className="mb-1 block text-text-secondary">ბანკი - არასავალდებულო</span>
                            <input value={bankName} onChange={event => setBankName(event.target.value)} className={control} />
                        </label>
                    )}
                </div>
                <div className="mt-3 space-y-2">
                    {rows.map(row => (
                        <article key={row.id} className="grid items-center gap-2 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                            <label className="flex min-w-0 items-start gap-3 text-sm">
                                <input
                                    type="checkbox"
                                    checked={Boolean(received[row.id])}
                                    onChange={event => setReceived(current => ({ ...current, [row.id]: event.target.checked }))}
                                    className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
                                />
                                <span className="min-w-0">
                                    <span className="font-semibold">{row.label}</span>
                                    <span className="text-text-secondary"> · {row.customer}</span>
                                    <span className="block text-xs text-text-secondary">მივიღე დარჩენილი {row.remaining} ₾</span>
                                </span>
                            </label>
                            <select
                                aria-label={`${row.label} გადახდის მეთოდი`}
                                value={rowMethod[row.id] ?? ""}
                                onChange={event => setRowMethod(current => ({ ...current, [row.id]: event.target.value as Method | "" }))}
                                className={control}
                            >
                                <option value="">საერთო ({methods[commonMethod]})</option>
                                {Object.entries(methods).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                            </select>
                        </article>
                    ))}
                </div>
            </section>}

            {blocked.length > 0 && <section className="mt-5">
                <h3 className="text-sm font-semibold">ცალკე მოსაგვარებელი</h3>
                <div className="mt-2 space-y-2">
                    {blocked.map(row => (
                        <article key={row.id} className="rounded-xl border border-border p-3">
                            <p className="text-sm"><span className="font-semibold">{row.label}</span><span className="text-text-secondary"> · {row.customer}</span></p>
                            <p className="mt-1 text-xs text-warning">{row.reason}</p>
                            <button
                                type="button"
                                disabled={Boolean(busy)}
                                onClick={() => { setOpen(false); onOpenOrder(row.id); }}
                                className="mt-2 min-h-10 text-sm font-medium text-accent underline disabled:opacity-40"
                            >შეკვეთის გახსნა</button>
                        </article>
                    ))}
                </div>
            </section>}

            {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

            <footer className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => setOpen(false)} className="h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-40">დახურვა</button>
                {rows.length > 0 && (
                    <button
                        type="button"
                        disabled={Boolean(busy) || checkedCount === 0}
                        onClick={() => void confirmPayments()}
                        className="inline-flex h-11 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white disabled:opacity-40"
                    >
                        <Icon icon={busy ? "solar:refresh-linear" : "solar:check-circle-linear"} className={`h-5 w-5 ${busy ? "animate-spin" : ""}`} />
                        {busy ? "ინახება…" : `დასრულება (${checkedCount})`}
                    </button>
                )}
            </footer>
        </dialog>
    </>;
}
