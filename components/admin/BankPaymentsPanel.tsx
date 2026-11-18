"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";
import AdminCodeField from "./AdminCodeField";
import type { AdminBankAttempt, BankPanelData } from "@/lib/admin/bank-payments";
import { formatSupportDate, formatSupportTime } from "@/lib/support/support-config";
import { BANK_INTERVAL_LABELS as INTERVAL, BANK_KIND_LABELS, bankBadge, bankStatusText } from "@/lib/admin/bank-labels";

const money = (value: string | number) => `${Number(value).toLocaleString("ka-GE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₾`;
const when = (iso: string) => `${formatSupportDate(iso)}, ${formatSupportTime(iso)}`;
// ბარათით (საქართველოს ბანკი) ყველა მცდელობა: წარმატებულიც, უარყოფილიც და პასუხის მომლოდინეც.
export default function BankPaymentsPanel({ businessId, initial }: { businessId: string; initial: BankPanelData }) {
    const router = useRouter();
    const [data, setData] = useState(initial);
    const [busyId, setBusyId] = useState("");
    const [refunding, setRefunding] = useState<AdminBankAttempt | null>(null);
    const [reason, setReason] = useState("");
    const [code, setCode] = useState("");
    const [endPlan, setEndPlan] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const send = async (attemptId: string, action: "sync" | "refund", body?: object) => {
        setBusyId(attemptId);
        setError("");
        setNotice("");
        try {
            const response = await fetch(`/api/admin/businesses/${businessId}/bank/${attemptId}/${action}`, {
                method: "POST", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
            });
            const result = await response.json().catch(() => ({})) as { bank?: BankPanelData; message?: string };
            if (!response.ok || !result.bank) throw new Error(result.message || "მოქმედება ვერ შესრულდა.");
            setData(result.bank);
            setNotice(result.message ?? "");
            router.refresh();
            return true;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "მოქმედება ვერ შესრულდა.");
            return false;
        } finally { setBusyId(""); }
    };

    return <div>
        {notice && <p role="status" className="mb-3 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
            <Icon icon="solar:check-circle-bold" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}
        </p>}
        {error && !refunding && <p role="alert" className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5 text-sm">
            <Icon icon="solar:card-linear" className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
            {data.card
                ? <p className="text-text-primary">შენახული ბარათი <b className="font-semibold">{data.card.mask ?? "••••"}</b>
                    <span className="text-text-secondary"> · ავტოგანახლება {data.card.amount ? money(data.card.amount) : ""} ({INTERVAL[data.card.interval] ?? data.card.interval}){data.card.autoRenew ? "" : " · გაუქმებულია ვადის ბოლოს"}</span></p>
                : <p className="text-text-secondary">შენახული ბარათი არ არის: ავტომატურად არაფერი ჩამოიჭრება.</p>}
        </div>
        {!data.configured && <p className="mt-2 text-xs text-text-secondary">ბანკის გასაღებები ჯერ არ არის დაყენებული: შემოწმება და დაბრუნება არ იმუშავებს.</p>}

        <ul className="mt-3 flex flex-col">
            {data.attempts.map(attempt => {
                const badge = bankBadge(attempt);
                const busy = busyId === attempt.id;
                const raw = bankStatusText(attempt.bankStatus);
                return <li key={attempt.id} className="flex flex-wrap items-start gap-3 border-b border-border py-2.5 last:border-0">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${badge.tone}`}>
                        <Icon icon={badge.icon} className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-text-primary">
                            <span className={attempt.refundedAt ? "line-through text-text-secondary" : ""}>{money(attempt.amount)}</span>
                            <span>· {attempt.kind === "SMS_PACK" ? `${attempt.smsCount ?? 0} SMS` : `${attempt.plan} ${INTERVAL[attempt.interval] ?? ""}`}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] ${badge.tone}`}>{badge.label}</span>
                        </p>
                        <p className="text-xs text-text-secondary">
                            {when(attempt.createdAt)} · {BANK_KIND_LABELS[attempt.kind] ?? attempt.kind}{attempt.cardMask ? ` · ${attempt.cardMask}` : ""}
                            {attempt.renewsExpiresAt ? ` · ვადა ${formatSupportDate(attempt.renewsExpiresAt)}` : ""}
                        </p>
                        {raw && <p className="text-[11px] text-text-secondary">ბანკი: {raw}{attempt.refundedAt ? ` · დაბრუნება მოითხოვა ${when(attempt.refundedAt)}` : ""}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                        {attempt.hasBankOrder && (attempt.status === "PENDING" || (attempt.refundedAt && attempt.bankStatus !== "refunded")) && <button type="button" disabled={busy || !data.configured}
                            onClick={() => send(attempt.id, "sync")}
                            className="h-8 rounded-lg px-2 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-40">{busy ? "..." : "ბანკთან შემოწმება"}</button>}
                        {attempt.status === "COMPLETED" && attempt.hasBankOrder && !attempt.refundedAt && <button type="button" disabled={Boolean(busyId) || !data.configured}
                            onClick={() => { setError(""); setReason(""); setCode(""); setEndPlan(attempt.kind !== "SMS_PACK"); setRefunding(attempt); }}
                            className="h-8 rounded-lg px-2 text-xs text-text-secondary transition hover:bg-danger/10 hover:text-danger disabled:opacity-40">თანხის დაბრუნება</button>}
                    </div>
                </li>;
            })}
            {!data.attempts.length && <li className="py-2.5 text-xs text-text-secondary">ბარათით გადახდის მცდელობა ჯერ არ ყოფილა.</li>}
        </ul>

        <ConfirmDialog open={Boolean(refunding)} title="თანხის დაბრუნება ბარათზე" confirmLabel="დაბრუნება" danger busy={Boolean(busyId)} error={refunding ? error : ""}
            onConfirm={async () => {
                if (!reason.trim()) { setError("მიუთითეთ დაბრუნების მიზეზი."); return; }
                if (!code) { setError("შეიყვანეთ კოდი აპიდან."); return; }
                if (refunding && await send(refunding.id, "refund", { reason, endPlan, code })) setRefunding(null); }}
            onClose={() => { if (!busyId) setRefunding(null); }}>
            <span className="block">
                <b className="font-medium text-text-primary">{refunding ? money(refunding.amount) : ""}</b> სრულად დაუბრუნდება ბარათს{refunding?.cardMask ? ` ${refunding.cardMask}` : ""}.
                ბანკს ამას რამდენიმე დღე შეიძლება დასჭირდეს. გადახდა შემოსავალში აღარ ჩაითვლება. ამას ვეღარ გააუქმებ.
            </span>
            <input value={reason} onChange={event => setReason(event.target.value)} maxLength={300} placeholder="მიზეზი (მაგ.: 3 დღეში მოითხოვა დაბრუნება)" aria-label="დაბრუნების მიზეზი"
                className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text-primary outline-none transition focus:border-accent sm:text-sm" />
            {refunding?.kind === "SMS_PACK"
                ? <span className="mt-3 block text-xs text-text-secondary">გეგმა უცვლელი რჩება. ბიზნესს ნაშთიდან დაუხარჯავი SMS გამოაკლდება (მაქსიმუმ {refunding.smsCount ?? 0}).</span>
                : <label className="mt-3 flex items-start gap-2 text-sm text-text-primary">
                <input type="checkbox" checked={endPlan} onChange={event => setEndPlan(event.target.checked)} className="mt-0.5" />
                <span>გეგმის ახლავე შეწყვეტა და შენახული ბარათის მოხსნა<span className="block text-xs text-text-secondary">მონიშვნის გარეშე გეგმა ვადის ბოლომდე რჩება და ავტოგანახლებაც გაგრძელდება.</span></span>
            </label>}
            <AdminCodeField value={code} onChange={setCode} />
        </ConfirmDialog>
    </div>;
}
