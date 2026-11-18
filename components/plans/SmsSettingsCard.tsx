"use client";

import { Icon } from "@/components/shared/Icon";
import { useState } from "react";
import { usePlan } from "@/components/dashboard/plan/PlanContext";
import { CornerCrown } from "@/components/dashboard/plan/PlanCrown";
import { SMS_PACKS } from "@/lib/subscription/plan-catalog";
import UsageMeter from "./UsageMeter";

type SmsUsage = { allowed: boolean; enabled: boolean; planIncluded: number; planUsed: number; balance: number; packsBought: number };
export type SmsPackResult = { status: string; amount: string; smsCount: number | null };

// SMS მომხმარებელთან: ჩამრთველი, გეგმის და ნაყიდი SMS-ის მრიცხველები, შაბლონის ნიმუში და პაკეტები.
export default function SmsSettingsCard({ initial, preview, canBuy, payment }: { initial: SmsUsage; preview: string; canBuy: boolean; payment: SmsPackResult | null }) {
    const { guard } = usePlan();
    const [sms, setSms] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [buying, setBuying] = useState<number | null>(null);
    // ჯერ პაკეტი ინიშნება, ბანკის გვერდზე მხოლოდ „ყიდვა“ გადაიყვანს.
    const [selected, setSelected] = useState<number | null>(null);
    const chosen = SMS_PACKS.find(pack => pack.count === selected) ?? null;
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

    // ბანკის გვერდზე გადასვლა: თანხას სერვერი ადგენს, აქედან მხოლოდ რაოდენობა მიდის.
    const buy = async (count: number) => {
        if (!guard("sms")) return;
        setBuying(count);
        setError("");
        try {
            const response = await fetch("/api/billing/sms-pack", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }),
            });
            const data = await response.json().catch(() => ({})) as { redirectUrl?: string; message?: string };
            if (!response.ok || !data.redirectUrl) throw new Error(data.message || "გადახდა ვერ დაიწყო.");
            window.location.assign(data.redirectUrl);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "გადახდა ვერ დაიწყო.");
            setBuying(null);
        }
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
                    ჩართვა<CornerCrown feature="sms" />
                </button>}
        </div>
        {payment && <PackPaymentResult payment={payment} />}
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
                    {SMS_PACKS.map(pack => {
                        const active = selected === pack.count;
                        return <li key={pack.count}>
                            <button type="button" aria-pressed={active} disabled={!canBuy || buying !== null}
                                onClick={() => { setError(""); setSelected(active ? null : pack.count); }}
                                className={`relative w-full rounded-xl border-2 bg-background p-3 text-center transition disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${active ? "border-success bg-success/5" : "border-border hover:border-accent/40 disabled:hover:border-border"}`}>
                                {active && <Icon icon="solar:check-circle-bold" className="absolute right-1.5 top-1.5 size-4 text-success" aria-hidden="true" />}
                                <span className="block font-semibold text-text-primary">{pack.count} SMS</span>
                                <span className="mt-1 block text-xs text-text-secondary">{pack.price} ₾</span>
                            </button>
                        </li>;
                    })}
                </ul>
                <div className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${chosen ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`} aria-hidden={!chosen}>
                    <div className="overflow-hidden sm:flex sm:justify-end">
                        <button type="button" tabIndex={chosen ? 0 : -1} disabled={!chosen || buying !== null} onClick={() => chosen && void buy(chosen.count)}
                            className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white transition duration-300 hover:brightness-110 disabled:opacity-70 motion-reduce:transition-none sm:w-auto ${chosen ? "translate-y-0" : "-translate-y-2"}`}>
                            <Icon icon="solar:card-linear" className="size-5" aria-hidden="true" />
                            {buying !== null ? "მუშავდება..." : chosen ? `ყიდვა · ${chosen.count} SMS · ${chosen.price} ₾` : "ყიდვა"}
                        </button>
                    </div>
                </div>
                <p className="mt-2 text-xs text-text-secondary">
                    {canBuy ? "ერთჯერადი გადახდა ბარათით. ბარათი არ ინახება და ავტომატურად არაფერი ჩამოიჭრება." : "პაკეტს ბიზნესის მფლობელი ყიდულობს."}
                </p>
            </div>
        </>}
    </section>;
}

// ბანკის გვერდიდან დაბრუნების შემდეგ: პაკეტის გადახდის შედეგი.
function PackPaymentResult({ payment }: { payment: SmsPackResult }) {
    const count = payment.smsCount ?? 0;
    if (payment.status === "COMPLETED") return <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-success/10 p-3 text-sm text-text-primary">
        <Icon icon="solar:check-circle-bold-duotone" className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
        <span><b className="font-semibold">გადახდა შესრულდა ({payment.amount} ₾).</b> {count} SMS დაემატა ნაშთს.</span>
    </p>;
    if (payment.status === "REJECTED") return <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-text-primary">
        <Icon icon="solar:danger-circle-bold-duotone" className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
        <span><b className="font-semibold">გადახდა ვერ შესრულდა.</b> თანხა არ ჩამოჭრილა. შეამოწმეთ ბარათის ნაშთი ან სცადეთ სხვა ბარათი.</span>
    </p>;
    return <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm text-text-primary">
        <Icon icon="solar:clock-circle-bold-duotone" className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <span><b className="font-semibold">გადახდა მუშავდება.</b> ბანკის დადასტურების შემდეგ {count} SMS ავტომატურად დაემატება. რამდენიმე წუთში განაახლეთ გვერდი.</span>
    </p>;
}
