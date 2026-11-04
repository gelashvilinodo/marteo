"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import type { PlanChangeQuote } from "@/lib/subscription/plan-change";
import { PLAN_ADJECTIVES, type PaidTier } from "@/lib/subscription/plans";
import { formatDay } from "./billing-format";

async function send(body: Record<string, unknown>) {
    const response = await fetch("/api/billing/subscription", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) throw new Error(data.message || "გეგმა ვერ შეიცვალა. სცადე ხელახლა.");
    return data.message ?? "";
}

function useAction(onDone: (message: string) => void) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const run = async (body: Record<string, unknown>) => {
        setBusy(true);
        setError("");
        try {
            onDone(await send(body));
            setOpen(false);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "გეგმა ვერ შეიცვალა.");
        } finally { setBusy(false); }
    };
    return { open, setOpen: (value: boolean) => { setError(""); setOpen(value); }, busy, error, run };
}

function Notice({ text }: { text: string }) {
    return text ? <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success">
        <Icon icon="solar:check-circle-bold" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{text}
    </p> : null;
}

// გაუქმება (მოქმედებს ვადის ბოლომდე) ან გაუქმების გადაფიქრება.
export function CancelPlanButton({ canceled, expiresAt }: { canceled: boolean; expiresAt: string | null }) {
    const router = useRouter();
    const [notice, setNotice] = useState("");
    const action = useAction(message => { setNotice(message); router.refresh(); });
    const until = expiresAt ? formatDay(expiresAt) : null;
    if (canceled) {
        return <div>
            <button type="button" disabled={action.busy} onClick={() => void action.run({ action: "resume" })}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-success/40 px-4 text-sm font-semibold text-success transition hover:bg-success/10 disabled:opacity-50">
                <Icon icon="solar:restart-bold" className="h-4 w-4" aria-hidden="true" />გეგმის გაგრძელება
            </button>
            {action.error && <p role="alert" className="mt-2 text-sm text-danger">{action.error}</p>}
            <Notice text={notice} />
        </div>;
    }
    return <div>
        <button type="button" onClick={() => action.setOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-text-secondary transition hover:border-danger/40 hover:text-danger">
            გეგმის გაუქმება
        </button>
        <Notice text={notice} />
        <ConfirmDialog open={action.open} danger title="გეგმის გაუქმება" confirmLabel="გეგმის გაუქმება" cancelLabel="დატოვება" busy={action.busy} error={action.error}
            onConfirm={() => void action.run({ action: "cancel" })} onClose={() => action.setOpen(false)}>
            {until ? `გეგმა ${until}-მდე ჩვეულებრივ იმუშავებს, მერე ბიზნესი მხოლოდ ნახვის რეჟიმში გადავა. მონაცემები არ წაიშლება და ვადამდე გაგრძელებაც შეგიძლია.` : "გეგმა გაუქმდება. მონაცემები არ წაიშლება."}
        </ConfirmDialog>
    </div>;
}

// დაბალ გეგმაზე გადასვლა: გადახდა არ სჭირდება, ნაშთი ახალი გეგმის დღეებად იქცევა.
export function DowngradeButton({ tier, quote, className, children }: { tier: PaidTier; quote: PlanChangeQuote | null; className: string; children: ReactNode }) {
    const router = useRouter();
    const action = useAction(() => { router.push("/dashboard/billing"); router.refresh(); });
    return <>
        <button type="button" onClick={() => action.setOpen(true)} className={className}>{children}</button>
        <ConfirmDialog open={action.open} title={`გადასვლა ${PLAN_ADJECTIVES[tier]} გეგმაზე`} confirmLabel="გადასვლა" busy={action.busy} error={action.error}
            onConfirm={() => void action.run({ action: "downgrade", plan: tier })} onClose={() => action.setOpen(false)}>
            <span className="block">ახალი გეგმა დღესვე ჩაირთვება და დამატებით არაფერს გადაიხდი.</span>
            {quote && <span className="mt-2 block">
                დაუხარჯავი ნაშთი <b className="font-medium text-text-primary">{quote.credit.toFixed(2)} ₾</b> ახალ გეგმაზე {quote.days} დღეს ფარავს:
                {" "}გეგმა იმოქმედებს <b className="font-medium text-text-primary">{formatDay(quote.expiresAt)}</b>-მდე.
            </span>}
            <span className="mt-2 block">ფუნქციები, რომლებიც ახალ გეგმაში არ შედის, დაიკეტება. მონაცემები არ წაიშლება.</span>
        </ConfirmDialog>
    </>;
}
