"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import type { getOrder } from "@/lib/orders/get-order";
import { moneyCents } from "@/lib/orders/order-form";
import { OrderActionError, sendOrderAction } from "@/lib/orders/order-actions-client";
import { useOrderLeaveGuard } from "./useOrderLeaveGuard";

type Order = Awaited<ReturnType<typeof getOrder>>;
type Method = "CASH" | "BANK_TRANSFER" | "CARD";
const field = "h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-[16px] text-text-primary outline-none focus:border-accent";

export default function OrderRefundButton({ orderId, onUpdated }: {
    orderId: string;
    onUpdated?: () => void;
}) {
    const router = useRouter();
    const dialog = useRef<HTMLDialogElement>(null);
    const fetchController = useRef<AbortController | null>(null);
    const saveController = useRef<AbortController | null>(null);
    const running = useRef(false);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [order, setOrder] = useState<Order | null>(null);
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState<Method>("CASH");
    const [bankName, setBankName] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState("");
    const [pending, setPending] = useState<Record<string, unknown> | null>(null);

    useEffect(() => {
        const element = dialog.current;
        if (open && !element?.open) element?.showModal();
        if (!open && element?.open) element.close();
    }, [open]);
    useEffect(() => () => {
        fetchController.current?.abort();
        saveController.current?.abort();
    }, []);

    function canLeave() {
        if (running.current) return false;
        return !(dirty || pending) || window.confirm(pending
            ? "თანხის დაბრუნების აღრიცხვის შედეგი დაუდასტურებელია. ხელახლა ცდა იგივე მოთხოვნით შესრულდება. დახურო ფანჯარა?"
            : "ცვლილებები შენახული არ არის. დახურო ფანჯარა?");
    }
    function leave() {
        fetchController.current?.abort();
        setOpen(false);
    }
    useOrderLeaveGuard({ open, dirty: dirty || Boolean(pending), canLeave, leave });

    const load = useCallback(async () => {
        fetchController.current?.abort();
        const controller = new AbortController();
        fetchController.current = controller;
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
                cache: "no-store", signal: controller.signal,
            });
            const result = await response.json() as { success?: boolean; message?: string; order?: Order };
            if (!response.ok || !result.success || !result.order) {
                throw new Error(result.message || "შეკვეთა ვერ ჩაიტვირთა.");
            }
            if (controller.signal.aborted) return;
            setOrder(result.order);
            setAmount(result.order.refundDue);
            setMethod("CASH");
            setBankName("");
            setConfirmed(false);
            setDirty(false);
        } catch (cause: unknown) {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "კავშირი შეწყდა.");
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [orderId]);

    async function send(payload: Record<string, unknown>) {
        if (running.current) return;
        const controller = new AbortController();
        saveController.current = controller;
        running.current = true;
        setSaving(true);
        setPending(payload);
        setError("");
        try {
            await sendOrderAction(orderId, "refund", payload, controller.signal);
            setPending(null);
            setDirty(false);
            setOpen(false);
            router.refresh();
            onUpdated?.();
        } catch (cause: unknown) {
            const definite = cause instanceof OrderActionError && cause.status < 500;
            if (definite) {
                setPending(null);
                setError(cause.message);
            } else {
                setError("აღრიცხვის შედეგი დაუდასტურებელია. ხელახლა ცდა მხოლოდ ჩანაწერს გადაამოწმებს — კლიენტს თანხა მეორედ არ დაუბრუნო.");
            }
        } finally {
            running.current = false;
            saveController.current = null;
            setSaving(false);
        }
    }
    function submit() {
        if (!order || saving || loading || pending) return;
        const value = moneyCents(amount);
        const due = moneyCents(order.refundDue) ?? 0n;
        if (value === null || value <= 0n || value > due) {
            setError(`მიუთითე დადებითი თანხა, მაქსიმუმ ${order.refundDue} ₾.`);
            return;
        }
        if (!confirmed) {
            setError("მონიშნე დადასტურება მხოლოდ მაშინ, თუ თანხა რეალურად დაუბრუნე კლიენტს.");
            return;
        }
        void send({
            requestId: crypto.randomUUID(),
            expectedVersion: order.expectedVersion,
            amount: amount.trim().replace(",", "."),
            paymentMethod: method,
            bankName,
            confirmRefund: true,
        });
    }
    const blocked = loading || saving || Boolean(pending);
    const due = order ? moneyCents(order.refundDue) ?? 0n : 0n;

    return <>
        <button type="button" onClick={() => { setOpen(true); if (!pending) { setOrder(null); void load(); } }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-warning/40 px-3 text-sm font-medium text-warning">
            <Icon icon="solar:wallet-money-linear" className="h-5 w-5" />თანხის დაბრუნების აღრიცხვა
        </button>
        <dialog ref={dialog} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (canLeave()) leave(); }} onClose={event => event.stopPropagation()} aria-labelledby="order-refund-title" className="m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-text-primary shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-sm">
            <h2 id="order-refund-title" className="flex items-center gap-2 text-lg font-semibold"><Icon icon="solar:wallet-money-linear" className="h-6 w-6 text-warning" />თანხის დაბრუნება</h2>
            <p className="mt-3 text-sm text-text-secondary">ეს მოქმედება თანხას ბანკიდან არ გადარიცხავს. აქ აღრიცხე მხოლოდ ის თანხა, რომელიც კლიენტს უკვე დაუბრუნე.</p>
            {loading && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-accent"><Icon icon="solar:refresh-linear" className="h-5 w-5 animate-spin" />იტვირთება…</p>}
            {!loading && order && <>
                <div className="mt-4 rounded-xl border border-warning/30 bg-warning/5 p-3"><p className="text-xs text-text-secondary">კლიენტს დასაბრუნებელი თანხა</p><p className="mt-1 text-xl font-semibold tabular-nums text-warning">{order.refundDue} ₾</p></div>
                {due > 0n ? <fieldset disabled={blocked} className="mt-4 space-y-3 disabled:opacity-60">
                    <label className="block"><span className="mb-1 block text-sm">რეალურად დაბრუნებული თანხა · ₾</span><input inputMode="decimal" value={amount} onChange={event => { setAmount(event.target.value); setDirty(true); }} className={field} /><span className="mt-1 block text-xs text-text-secondary">შეგიძლია თანხა ნაწილობრივაც აღრიცხო. დარჩენილი ნაწილი დასაბრუნებლად დარჩება.</span></label>
                    <label className="block"><span className="mb-1 block text-sm">დაბრუნების მეთოდი</span><select value={method} onChange={event => { setMethod(event.target.value as Method); setDirty(true); }} className={field}><option value="CASH">ნაღდი ფული</option><option value="BANK_TRANSFER">საბანკო გადარიცხვა</option><option value="CARD">ბარათი</option></select></label>
                    {method === "BANK_TRANSFER" && <label className="block"><span className="mb-1 block text-sm">ბანკი</span><input value={bankName} onChange={event => { setBankName(event.target.value); setDirty(true); }} className={field} /></label>}
                    <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={confirmed} onChange={event => { setConfirmed(event.target.checked); setDirty(true); }} className="mt-0.5 h-4 w-4 shrink-0 accent-accent" /><span>ვადასტურებ, რომ მითითებული თანხა კლიენტს რეალურად დავუბრუნე.</span></label>
                </fieldset> : <p className="mt-4 text-sm text-success">ამ შეკვეთაზე დასაბრუნებელი თანხა აღარ არის.</p>}
            </>}
            {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
            {!loading && !order && !pending && <button type="button" onClick={() => void load()} className="mt-3 text-sm text-accent underline">ხელახლა ჩატვირთვა</button>}
            <footer className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <button type="button" disabled={saving} onClick={() => { if (canLeave()) leave(); }} className="h-11 rounded-xl border border-border px-3 text-sm disabled:opacity-40">დახურვა</button>
                {saving && <button type="button" onClick={() => saveController.current?.abort()} className="text-xs text-text-secondary underline">შეაჩერე ლოდინი</button>}
                {(pending || due > 0n) && <button type="button" disabled={loading || saving} onClick={() => pending ? void send(pending) : submit()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-success px-3 text-sm font-semibold text-white disabled:opacity-40"><Icon icon={saving ? "solar:refresh-linear" : "solar:check-circle-linear"} className={`h-5 w-5 ${saving ? "animate-spin" : ""}`} />{saving ? "ინახება…" : pending ? "ხელახლა ცდა" : "დაბრუნების დადასტურება"}</button>}
            </footer>
        </dialog>
    </>;
}
