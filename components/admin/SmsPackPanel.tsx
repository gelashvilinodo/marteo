"use client";

import { Icon } from "@iconify/react";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import type { BusinessSmsView } from "@/lib/sms/sms-admin";
import { SMS_PACKS } from "@/lib/subscription/plan-catalog";
import { formatSupportDate } from "@/lib/support/support-config";

// SMS ნაშთი და პაკეტის ხელით დამატება (ბანკის გადახდამდე, მაგ. გადარიცხვის შემდეგ).
export default function SmsPackPanel({ businessId, initial }: { businessId: string; initial: BusinessSmsView }) {
    const [sms, setSms] = useState(initial);
    const [count, setCount] = useState<number>(SMS_PACKS[0].count);
    const [note, setNote] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const pack = SMS_PACKS.find(item => item.count === count)!;

    const save = async () => {
        setBusy(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/businesses/${businessId}/sms`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count, note }),
            });
            const data = await response.json().catch(() => ({})) as { sms?: BusinessSmsView; message?: string };
            if (!response.ok || !data.sms) throw new Error(data.message || "ვერ დაემატა.");
            setSms(data.sms);
            setNotice(data.message ?? "დაემატა.");
            setNote("");
            setConfirming(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "ვერ დაემატა.");
        } finally { setBusy(false); }
    };

    const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-accent sm:text-sm";

    return <div>
        {notice && <p role="status" className="mb-3 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            <Icon icon="solar:check-circle-bold" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}
        </p>}
        <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-background p-3"><p className="text-xs text-text-secondary">ნაყიდი ნაშთი</p><p className="mt-1 text-lg font-semibold text-text-primary">{sms.balance}</p></div>
            <div className="rounded-xl bg-background p-3"><p className="text-xs text-text-secondary">გეგმის SMS</p><p className="mt-1 text-lg font-semibold text-text-primary">{sms.planIncluded ? `${sms.planUsed} / ${sms.planIncluded}` : "არ შედის"}</p></div>
            <div className="rounded-xl bg-background p-3"><p className="text-xs text-text-secondary">30 დღეში გაიგზავნა</p><p className="mt-1 text-lg font-semibold text-text-primary">{sms.sentThisMonth}</p></div>
        </div>
        <p className="mt-2 text-xs text-text-secondary">{!sms.allowed ? "მიმდინარე გეგმაში SMS არ შედის (ნაშთი ინახება)." : sms.enabled ? "SMS ჩართულია." : "მფლობელმა SMS გამორთოთ."}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
            <label className="text-xs text-text-secondary">პაკეტი
                <select value={count} onChange={event => { setNotice(""); setCount(Number(event.target.value)); }} className={`mt-1 ${field}`}>
                    {SMS_PACKS.map(item => <option key={item.count} value={item.count}>{item.count} SMS · {item.price} ₾</option>)}
                </select>
            </label>
            <label className="text-xs text-text-secondary">შენიშვნა
                <input value={note} maxLength={300} onChange={event => setNote(event.target.value)} placeholder="მაგ. გადარიცხვა 04.11" className={`mt-1 ${field}`} />
            </label>
            <button type="button" onClick={() => { setError(""); setConfirming(true); }} className="h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition hover:bg-accent-hover">დამატება</button>
        </div>
        {sms.packs.length > 0 && <ul className="mt-4 divide-y divide-border text-sm">
            {sms.packs.map(item => <li key={item.id} className="flex justify-between gap-3 py-2"><span className="text-text-primary">{item.count} SMS</span><span className="text-text-secondary">{item.price} ₾ · {formatSupportDate(item.createdAt)}</span></li>)}
        </ul>}
        <ConfirmDialog open={confirming} title="SMS პაკეტის დამატება" confirmLabel="დამატება" busy={busy} error={error} onConfirm={save} onClose={() => { if (!busy) setConfirming(false); }}>
            ბიზნესს დაემატება <b className="font-medium text-text-primary">{pack.count} SMS</b> ({pack.price} ₾). ნაშთი გახდება {sms.balance + pack.count}.
        </ConfirmDialog>
    </div>;
}
