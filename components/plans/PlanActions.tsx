"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import type { PlanChangeQuote } from "@/lib/subscription/plan-change";
import { INTERVAL_ADJECTIVES, PLAN_ADJECTIVES, PLAN_LIMITS, type BillingInterval, type PaidTier } from "@/lib/subscription/plans";
import { formatDay } from "./billing-format";

async function send(body: Record<string, unknown>) {
    const response = await fetch("/api/billing/subscription", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) throw new Error(data.message || "გეგმა ვერ შეიცვალა. სცადეთ ხელახლა.");
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
    return { open, setOpen: (value: boolean) => { setError(""); setOpen(value); }, busy, error, run, fail: setError };
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
            {until ? `შემდეგი თვის თანხა აღარ ჩამოიჭრება. გეგმა ${until}-მდე ჩვეულებრივ იმუშავებს, მერე ბიზნესი მხოლოდ ნახვის რეჟიმში გადავა. მონაცემები არ წაიშლება და ვადამდე გაგრძელებაც შეგიძლიათ.` : "გეგმა გაუქმდება. მონაცემები არ წაიშლება."}
        </ConfirmDialog>
    </div>;
}

type Member = { id: string; name: string; isYou: boolean };
export type DowngradeTeam = { mode: string; coOwners: Member[]; staff: Member[] };

// ლიმიტს გადაცილებული ჯგუფი: მფლობელი ნიშნავს, ვინ დარჩეს (თავიდან უძველესი წევრები და თავად).
function initialKeep(team: DowngradeTeam, tier: PaidTier) {
    const limits = PLAN_LIMITS[tier];
    const pick = (group: Member[], limit: number) => {
        const you = group.filter(member => member.isYou);
        return [...you, ...group.filter(member => !member.isYou)].slice(0, limit).map(member => member.id);
    };
    return new Set([...pick(team.coOwners, limits.coOwners), ...pick(team.staff, limits.staff)]);
}

function MemberPicker({ title, group, limit, keep, toggle }: { title: string; group: Member[]; limit: number; keep: Set<string>; toggle: (id: string) => void }) {
    if (group.length <= limit) return null;
    const chosen = group.filter(member => keep.has(member.id)).length;
    if (limit === 0) return <span className="mt-3 block rounded-xl bg-warning/10 p-3 text-text-primary">{title}: ახალ გეგმაში არ შედის, ამიტომ {group.length} წევრი გაიყინება. გეგმის აწევისას დაბრუნდებიან.</span>;
    return <fieldset className="mt-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-medium text-text-primary">{title}: დარჩება {limit}, მონიშნულია {chosen}</legend>
        <span className="block text-xs">დანარჩენები გაიყინება (არ წაიშლება) და გეგმის აწევისას დაბრუნდებიან.</span>
        <span className="mt-2 flex flex-col gap-1.5">
            {group.map(member => <label key={member.id} className="flex cursor-pointer items-center gap-2 text-text-primary">
                <input type="checkbox" checked={keep.has(member.id)} disabled={member.isYou || (!keep.has(member.id) && chosen >= limit)}
                    onChange={() => toggle(member.id)} className="h-4 w-4 accent-[var(--marteo-accent)]" />
                {member.name}{member.isYou ? " (თქვენ)" : ""}
            </label>)}
        </span>
    </fieldset>;
}

// დაბალ გეგმაზე გადასვლა: გადახდა არ სჭირდება, ნაშთი ახალი გეგმის დღეებად იქცევა.
// ლიმიტს გადაცილებული გუნდიდან მფლობელი ირჩევს, ვინ დარჩეს; „ორივე“ მიმართულებიდან Business-ზე —
// იმპორტს ან წარმოებას.
// sameTier: იგივე გეგმა წლიურიდან თვიურზე. გეგმა ვადის ბოლომდე უცვლელია, მერე თვიურად განახლდება.
export function DowngradeButton({ tier, interval = "MONTHLY", sameTier = false, quote, team, className, children }: { tier: PaidTier; interval?: BillingInterval; sameTier?: boolean; quote: PlanChangeQuote | null; team: DowngradeTeam; className: string; children: ReactNode }) {
    const router = useRouter();
    const action = useAction(() => { router.push("/dashboard/billing"); router.refresh(); });
    const [keep, setKeep] = useState(() => initialKeep(team, tier));
    const askMode = team.mode === "HYBRID" && tier === "BUSINESS";
    const [mode, setMode] = useState<"IMPORT" | "MANUFACTURING" | "">("");
    const limits = PLAN_LIMITS[tier];
    const toggle = (id: string) => setKeep(current => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const confirm = () => {
        if (askMode && !mode) { action.fail("აირჩიეთ მიმართულება: იმპორტი ან წარმოება."); return; }
        void action.run({ action: "downgrade", plan: tier, period: interval, keep: [...keep], ...(askMode ? { mode } : {}) });
    };
    return <>
        <button type="button" onClick={() => { setKeep(initialKeep(team, tier)); action.setOpen(true); }} className={className}>{children}</button>
        <ConfirmDialog open={action.open} title={sameTier ? `გადასვლა ${INTERVAL_ADJECTIVES[interval]} გადახდაზე` : `გადასვლა ${PLAN_ADJECTIVES[tier]} გეგმაზე`} confirmLabel="გადასვლა" busy={action.busy} error={action.error}
            onConfirm={confirm} onClose={() => action.setOpen(false)}>
            {sameTier
                ? <span className="block">
                    დამატებით არაფერს გადაიხდით. მიმდინარე გეგმა {quote ? <b className="font-medium text-text-primary">{formatDay(quote.expiresAt)}</b> : "ვადის ბოლომდე"}{quote ? "-მდე" : ""} უცვლელად მოქმედებს, შემდეგ კი {INTERVAL_ADJECTIVES[interval]} ფასით განახლდება.
                </span>
                : <>
                    <span className="block">ახალი გეგმა დღესვე ჩაირთვება და დამატებით არაფერს გადაიხდით.</span>
                    {quote && <span className="mt-2 block">
                        დაუხარჯავი ნაშთი <b className="font-medium text-text-primary">{quote.credit.toFixed(2)} ₾</b> ახალ გეგმაზე {quote.days} დღეს ფარავს:
                        {" "}გეგმა იმოქმედებს <b className="font-medium text-text-primary">{formatDay(quote.expiresAt)}</b>-მდე.
                    </span>}
                </>}
            {askMode && <fieldset className="mt-3 rounded-xl border border-border p-3">
                <legend className="px-1 text-sm font-medium text-text-primary">რომელი მიმართულება დარჩეს?</legend>
                <span className="block text-xs">ბიზნეს გეგმაში იმპორტი და წარმოება ერთად არ შედის. მეორე მიმართულების მონაცემები არ წაიშლება.</span>
                <span className="mt-2 flex gap-4">
                    {([["IMPORT", "იმპორტი"], ["MANUFACTURING", "წარმოება"]] as const).map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-2 text-text-primary">
                        <input type="radio" name="downgrade-mode" checked={mode === value} onChange={() => setMode(value)} className="h-4 w-4 accent-[var(--marteo-accent)]" />{label}
                    </label>)}
                </span>
            </fieldset>}
            <MemberPicker title="თანამფლობელები" group={team.coOwners} limit={limits.coOwners} keep={keep} toggle={toggle} />
            <MemberPicker title="თანამშრომლები" group={team.staff} limit={limits.staff} keep={keep} toggle={toggle} />
            {!sameTier && <span className="mt-2 block">ფუნქციები, რომლებიც ახალ გეგმაში არ შედის, დაიკეტება. მონაცემები არ წაიშლება.</span>}
        </ConfirmDialog>
    </>;
}
