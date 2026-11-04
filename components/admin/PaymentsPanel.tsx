"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import type { AdminPayment } from "@/lib/admin/payments";
import { MONTH_OPTIONS, PAID_PLANS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS, paymentPeriod, toTbilisiDay, type PaidPlan } from "@/lib/admin/payment-period";
import { formatSupportDate } from "@/lib/support/support-config";

type Current = { plan: string | null; status: string | null; expiresAt: string | null };

const money = (value: string | number) => `${Number(value).toLocaleString("ka-GE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₾`;
const day = (iso: string) => formatSupportDate(iso);

// Payments are never deleted: a mistake is voided with a reason and stays visible, struck through.
export default function PaymentsPanel({ businessId, current, initial }: { businessId: string; current: Current; initial: AdminPayment[] }) {
    const router = useRouter();
    const [payments, setPayments] = useState(initial);
    const [plan, setPlan] = useState<PaidPlan>(PAID_PLANS.includes(current.plan as PaidPlan) ? current.plan as PaidPlan : "START");
    const [months, setMonths] = useState(1);
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState<string>("BANK_TRANSFER");
    const [paidAt, setPaidAt] = useState(() => toTbilisiDay(new Date()));
    const [note, setNote] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [voiding, setVoiding] = useState<AdminPayment | null>(null);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const period = paymentPeriod({ plan: current.plan, status: current.status, expiresAt: current.expiresAt ? new Date(current.expiresAt) : null }, plan, months);
    const validAmount = /^\d{1,6}([.,]\d{1,2})?$/.test(amount.trim()) && Number(amount.replace(",", ".")) > 0;

    const send = async (url: string, body: object) => {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await response.json().catch(() => ({})) as { payments?: AdminPayment[]; message?: string };
            if (!response.ok || !data.payments) throw new Error(data.message || "მოქმედება ვერ შესრულდა.");
            setPayments(data.payments);
            setNotice(data.message ?? "");
            router.refresh();
            return true;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "მოქმედება ვერ შესრულდა.");
            return false;
        } finally { setBusy(false); }
    };

    const save = async () => {
        if (await send(`/api/admin/businesses/${businessId}/payments`, { plan, months, amount, method, paidAt, note })) {
            setConfirming(false);
            setAmount("");
            setNote("");
        }
    };

    const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-accent sm:text-sm";
    const active = payments.filter(payment => !payment.voidedAt);
    const total = active.reduce((sum, payment) => sum + Number(payment.amount), 0);

    return <div>
        {notice && <p role="status" className="mb-3 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            <Icon icon="solar:check-circle-bold" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}
        </p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-text-secondary">პაკეტი
                <select value={plan} onChange={event => { setNotice(""); setPlan(event.target.value as PaidPlan); }} className={`mt-1 ${field}`}>
                    {PAID_PLANS.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
            </label>
            <label className="text-xs text-text-secondary">პერიოდი
                <select value={months} onChange={event => { setNotice(""); setMonths(Number(event.target.value)); }} className={`mt-1 ${field}`}>
                    {MONTH_OPTIONS.map(option => <option key={option} value={option}>{option} თვე</option>)}
                </select>
            </label>
            <label className="text-xs text-text-secondary">თანხა (₾)
                <input inputMode="decimal" value={amount} onChange={event => { setNotice(""); setAmount(event.target.value); }} placeholder="მაგ.: 49.90" maxLength={9} className={`mt-1 ${field}`} />
            </label>
            <label className="text-xs text-text-secondary">მეთოდი
                <select value={method} onChange={event => setMethod(event.target.value)} className={`mt-1 ${field}`}>
                    {PAYMENT_METHODS.map(option => <option key={option} value={option}>{PAYMENT_METHOD_LABELS[option]}</option>)}
                </select>
            </label>
            <label className="text-xs text-text-secondary">გადახდის თარიღი
                <input type="date" value={paidAt} min="2024-01-01" max={toTbilisiDay(new Date())} onChange={event => setPaidAt(event.target.value)} className={`mt-1 ${field}`} />
            </label>
            <label className="text-xs text-text-secondary sm:col-span-1 lg:col-span-3">შენიშვნა (არასავალდებულო)
                <input value={note} onChange={event => setNote(event.target.value)} maxLength={500} placeholder="მაგ.: ინვოისი #12, TBC გადარიცხვა" className={`mt-1 ${field}`} />
            </label>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-secondary">
                {period.continues ? "გაგრძელდება მიმდინარე ვადიდან: " : "დაიწყება დღეს: "}
                <b className="font-medium text-text-primary">{plan} · {toTbilisiDay(period.end).split("-").reverse().join(".")}-ის ჩათვლით</b>
            </p>
            <button type="button" disabled={!validAmount || !paidAt} onClick={() => { setError(""); setConfirming(true); }}
                className="h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover disabled:opacity-40">გადახდის დამატება</button>
        </div>

        <div className="mt-5 flex items-baseline justify-between gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-text-primary">ისტორია</h3>
            {active.length > 0 && <p className="text-xs text-text-secondary">სულ გადახდილი: <b className="font-semibold text-text-primary">{money(total)}</b></p>}
        </div>
        <ul className="mt-2 flex flex-col">
            {payments.map(payment => <li key={payment.id} className="flex gap-3 border-b border-border py-2.5 last:border-0">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${payment.voidedAt ? "bg-background text-text-secondary" : "bg-success/12 text-success"}`}>
                    <Icon icon={payment.voidedAt ? "solar:close-circle-linear" : "solar:wallet-money-linear"} className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${payment.voidedAt ? "text-text-secondary line-through" : "text-text-primary"}`}>
                        {money(payment.amount)} · {payment.plan} · {payment.months} თვე
                    </p>
                    <p className="text-xs text-text-secondary">{day(payment.paidAt)} · {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method} · პერიოდი {day(payment.periodStart)} - {day(payment.periodEnd)}</p>
                    {payment.note && <p className="break-words text-xs text-text-secondary">{payment.note}</p>}
                    <p className="mt-0.5 text-[11px] text-text-secondary">ჩაწერა: {payment.createdBy ?? "წაშლილი ადმინი"}</p>
                    {payment.voidedAt && <p className="mt-0.5 text-[11px] text-danger">გაუქმდა {day(payment.voidedAt)} · {payment.voidReason}</p>}
                </div>
                {!payment.voidedAt && <button type="button" onClick={() => { setError(""); setReason(""); setVoiding(payment); }}
                    className="h-8 shrink-0 rounded-lg px-2 text-xs text-text-secondary transition hover:bg-danger/10 hover:text-danger">გაუქმება</button>}
            </li>)}
            {!payments.length && <li className="py-2.5 text-xs text-text-secondary">გადახდები ჯერ არ აღრიცხულა.</li>}
        </ul>

        <ConfirmDialog open={confirming} title="გადახდის დამატება" confirmLabel="დამატება" busy={busy} error={confirming ? error : ""} onConfirm={save} onClose={() => { if (!busy) setConfirming(false); }}>
            <span className="block"><b className="font-medium text-text-primary">{validAmount ? money(amount.replace(",", ".")) : ""}</b> · {PAYMENT_METHOD_LABELS[method]} · {paidAt.split("-").reverse().join(".")}</span>
            <span className="block">პაკეტი გახდება: <b className="font-medium text-text-primary">{plan} · აქტიური · {toTbilisiDay(period.end).split("-").reverse().join(".")}-ის ჩათვლით</b></span>
            <span className="mt-1 block text-xs">მფლობელები მიიღებენ შეტყობინებას „გადახდა დადასტურდა“.</span>
        </ConfirmDialog>
        <ConfirmDialog open={Boolean(voiding)} title="გადახდის გაუქმება" confirmLabel="გაუქმება" danger busy={busy} error={voiding ? error : ""}
            onConfirm={async () => { if (voiding && await send(`/api/admin/businesses/${businessId}/payments/${voiding.id}/void`, { reason })) setVoiding(null); }}
            onClose={() => { if (!busy) setVoiding(null); }}>
            <span className="block">{voiding ? `${money(voiding.amount)} · ${day(voiding.paidAt)}` : ""} შემოსავალში აღარ ჩაითვლება, მაგრამ ისტორიაში დარჩება. პაკეტის ვადა არ შეიცვლება.</span>
            <input value={reason} onChange={event => setReason(event.target.value)} maxLength={300} placeholder="მიზეზი (მაგ.: შეცდომით ჩაიწერა)" aria-label="გაუქმების მიზეზი"
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-accent sm:text-sm" />
        </ConfirmDialog>
    </div>;
}
