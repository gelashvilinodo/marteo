"use client";

import { Icon } from "@/components/shared/Icon";
import { useState } from "react";
import { usePlan } from "@/components/dashboard/plan/PlanContext";
import { CornerCrown } from "@/components/dashboard/plan/PlanCrown";
import { SMS_PACKS } from "@/lib/subscription/plan-catalog";
import UsageMeter from "./UsageMeter";

type SmsUsage = { allowed: boolean; enabled: boolean; planIncluded: number; planUsed: number; balance: number; packsBought: number };

// SMS მომხმარებელთან: ჩამრთველი, გეგმის და ნაყიდი SMS-ის მრიცხველები, შაბლონის ნიმუში და პაკეტები.
export default function SmsSettingsCard({ initial, preview }: { initial: SmsUsage; preview: string }) {
    const { guard } = usePlan();
    const [sms, setSms] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [packNotice, setPackNotice] = useState(false);
    const planLeft = Math.max(sms.planIncluded - sms.planUsed, 0);
    // „ამოიწურა“ მხოლოდ მაშინ, როცა SMS ნამდვილად ჰქონდა: გეგმის SMS დაიხარჯა ან ნაყიდი პაკეტი გათავდა.
    const hadSms = sms.planUsed > 0 || sms.packsBought > 0;
    const empty = sms.allowed && hadSms && planLeft + sms.balance === 0;

    const toggle = async () => {
        if (!guard("sms")) return;
        setBusy(true);
        setError("");
        try {
            const response = await fetch("/api/business/sms", {
                method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !sms.enabled }),
            });
            const data = await response.json().catch(() => ({})) as { sms?: SmsUsage; message?: string };
            if (!response.ok || !data.sms) throw new Error(data.message || "პარამეტრი ვერ შეინახა.");
            setSms(data.sms);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "პარამეტრი ვერ შეინახა.");
        } finally { setBusy(false); }
    };

    return <section aria-labelledby="sms-settings" className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
                <h2 id="sms-settings" className="flex items-center gap-2 font-semibold text-text-primary">
                    <Icon icon="solar:chat-round-line-linear" className="size-5 shrink-0 text-accent" aria-hidden="true" />SMS მომხმარებელთან
                </h2>
                <p className="mt-1 text-sm text-text-secondary">შეკვეთის გაგზავნილზე გადაყვანისას მომხმარებელს ავტომატურად ეგზავნება შეტყობინება.</p>
            </div>
            {sms.allowed
                ? <button type="button" role="switch" aria-checked={sms.enabled} aria-label="SMS მომხმარებელთან" disabled={busy} onClick={() => void toggle()}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-60 ${sms.enabled ? "bg-success" : "bg-border"}`}>
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${sms.enabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
                : <button type="button" onClick={() => guard("sms")} className="relative inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium text-text-secondary">
                    ჩართვა<CornerCrown feature="sms" pro />
                </button>}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

        <div className="mt-4 rounded-xl bg-background p-3 text-sm">
            <p className="text-xs text-text-secondary">შეტყობინების ნიმუში (გამგზავნი: MARTEO)</p>
            <p className="mt-1 text-text-primary">{preview}</p>
        </div>

        {sms.allowed && <>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {sms.planIncluded > 0 && <UsageMeter icon="solar:chat-round-line-linear" label="გეგმის SMS ამ პერიოდში" used={sms.planUsed} limit={sms.planIncluded} />}
                <div className="rounded-xl bg-background p-4">
                    <p className="flex items-center gap-2 text-sm text-text-secondary"><Icon icon="solar:box-linear" className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />ნაყიდი SMS</p>
                    <p className="mt-2 text-lg font-semibold text-text-primary">{sms.balance}</p>
                    <p className="mt-2 text-xs text-text-secondary">ვადა არ გასდის. {sms.planIncluded > 0 ? "იხარჯება გეგმის SMS-ის მერე." : ""}</p>
                </div>
            </div>
            {empty && <p role="status" className="mt-3 rounded-xl bg-warning/10 p-3 text-sm text-text-primary">SMS ამოიწურა: მომხმარებლებს შეტყობინება აღარ ეგზავნება. შეიძინეთ პაკეტი.</p>}
            <div className="mt-4">
                <p className="text-sm font-medium text-text-primary">SMS პაკეტები</p>
                <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {SMS_PACKS.map(pack => <li key={pack.count}>
                        <button type="button" onClick={() => setPackNotice(true)} className="w-full rounded-xl border border-border bg-background p-3 text-center transition hover:border-accent/40">
                            <span className="block font-semibold text-text-primary">{pack.count} SMS</span>
                            <span className="mt-1 block text-xs text-text-secondary">{pack.price} ₾</span>
                        </button>
                    </li>)}
                </ul>
                {packNotice && <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-accent/10 p-3 text-sm text-text-primary">
                    <Icon icon="solar:info-circle-bold-duotone" className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                    ბარათით ყიდვა მალე ჩაირთვება. მანამდე პაკეტის დასამატებლად მოგვწერეთ დახმარების ჩატში.
                </p>}
            </div>
        </>}
    </section>;
}
