import { Icon } from "@iconify/react";
import type { ReactNode } from "react";
import { PLAN_CARDS, type PlanCard } from "@/lib/subscription/plan-catalog";
import type { PaidTier } from "@/lib/subscription/plans";

// სამი გეგმის ქარდი. action თითო ქარდის ღილაკს აწყობს (ფასების გვერდზე „დაიწყე“, დაშბორდში „დეტალურად“).
// compact: გეგმის ფანჯარაში ჩამონათვალი მოკლდება, რომ სამივე ქარდი ერთ ეკრანზე დაეტიოს.
// inset: დაშბორდში საიდბარის გამო ადგილი ნაკლებია, ამიტომ სამი სვეტი მხოლოდ ფართო ეკრანზე იშლება.
export default function PlanCards({ action, current, focus, compact = false, inset = false }: {
    action: (card: PlanCard) => ReactNode;
    current?: PaidTier | null;
    focus?: PaidTier | null;
    compact?: boolean;
    inset?: boolean;
}) {
    return <div className={`grid items-stretch gap-4 ${compact ? "md:grid-cols-3" : inset ? "md:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-3"}`}>
        {PLAN_CARDS.map(card => <PlanCardView key={card.tier} card={card} action={action(card)} current={current === card.tier} focused={(focus ?? "PRO") === card.tier} compact={compact} />)}
    </div>;
}

// გამოკვეთილი ქარდი (ჩვეულებრივ PRO) ჰედერის მუქ ლურჯ ფერშია, დანარჩენი ორი მშვიდი და თეთრი.
function PlanCardView({ card, action, current, focused, compact }: { card: PlanCard; action: ReactNode; current: boolean; focused: boolean; compact: boolean }) {
    const rows = compact ? card.rows.slice(0, 5) : card.rows;
    const pro = card.tier === "PRO";
    const muted = focused ? "text-white/70" : "text-text-secondary";
    return <article className={`flex flex-col gap-4 rounded-2xl p-5 ${focused ? "border border-white/10 bg-[#081F46] dark:border-accent/60 text-white shadow-xl shadow-[#081F46]/20" : "border border-border bg-surface text-text-primary"}`} aria-label={`${card.name} — ${card.price} ლარი თვეში`}>
        <div className="flex flex-wrap items-center gap-2.5">
            <Icon icon={card.icon} aria-hidden="true" className={`h-6 w-6 ${pro ? "text-[#E0A526]" : focused ? "text-white/80" : "text-text-secondary"}`} />
            <h3 className="text-lg font-semibold">{card.name}</h3>
            {current
                ? <span className={`ml-auto rounded-lg px-2.5 py-1 text-xs font-medium ${focused ? "bg-white/15 text-white" : "bg-success/10 text-success"}`}>მიმდინარე გეგმა</span>
                : focused && card.badge && <span className="ml-auto rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white">{card.badge}</span>}
        </div>
        <p className={`-mt-2 text-sm ${muted}`}>{card.tagline}</p>
        <div>
            <p><span className="text-4xl font-semibold">{card.price}</span> <span className={`text-base ${muted}`}>₾ / თვე</span></p>
            {pro && <p className={`mt-1 text-xs ${focused ? "text-[#85B7EB]" : "text-accent"}`}>{card.perDay}</p>}
        </div>
        {action}
        <ul className="flex flex-col gap-2.5 text-sm">
            {card.includesPrevious && <li className={muted}>{card.includesPrevious}</li>}
            {rows.map(row => <li key={row.label} className="flex items-start gap-2.5">
                <Icon icon="solar:check-read-linear" aria-hidden="true" className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${focused ? "text-[#85B7EB]" : "text-success"}`} />
                <span>{row.label}{row.value && <b className="font-semibold"> {row.value}</b>}</span>
            </li>)}
        </ul>
    </article>;
}
