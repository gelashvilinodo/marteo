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
    return <div className={`grid items-start gap-4 ${compact ? "md:grid-cols-3" : inset ? "md:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-3"}`}>
        {PLAN_CARDS.map(card => <PlanCardView key={card.tier} card={card} action={action(card)} current={current === card.tier} focused={(focus ?? "PRO") === card.tier} compact={compact} />)}
    </div>;
}

function PlanCardView({ card, action, current, focused, compact }: { card: PlanCard; action: ReactNode; current: boolean; focused: boolean; compact: boolean }) {
    const rows = compact ? card.rows.filter(row => row.included !== false).slice(0, 5) : card.rows;
    const pro = card.tier === "PRO";
    return <article className={`flex flex-col gap-4 rounded-2xl bg-surface p-5 ${focused ? "border-2 border-accent" : "border border-border"}`} aria-label={`${card.name} — ${card.price} ლარი თვეში`}>
        <div className="flex flex-wrap items-center gap-2.5">
            <Icon icon={card.icon} aria-hidden="true" className={`h-6 w-6 ${pro ? "text-[#E0A526]" : "text-text-secondary"}`} />
            <h3 className="text-lg font-semibold text-text-primary">{card.name}</h3>
            {current
                ? <span className="ml-auto rounded-lg bg-success/10 px-2.5 py-1 text-xs font-medium text-success">მიმდინარე გეგმა</span>
                : card.badge && <span className="ml-auto rounded-lg bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">{card.badge}</span>}
        </div>
        <p className="-mt-2 text-sm text-text-secondary">{card.tagline}</p>
        <div>
            <p className="text-text-primary"><span className="text-4xl font-semibold">{card.price}</span> <span className="text-base text-text-secondary">₾ / თვე</span></p>
            {pro && <p className="mt-1 text-xs text-accent">{card.perDay}</p>}
        </div>
        {action}
        <ul className="flex flex-col gap-3 text-sm">
            {card.includesPrevious && <li className="flex items-center gap-2.5 text-text-secondary"><Icon icon="solar:arrow-up-linear" aria-hidden="true" className="h-[18px] w-[18px] text-success" />{card.includesPrevious}</li>}
            {rows.map(row => <li key={row.label} className={`flex items-start gap-2.5 ${row.included === false ? "text-text-secondary/70" : "text-text-primary"}`}>
                <Icon icon={row.icon} aria-hidden="true" className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${row.included === false ? "" : row.highlight ? "text-accent" : "text-success"}`} />
                <span className={row.included === false ? "line-through" : ""}>{row.label}</span>
                {row.included === false && <span className="sr-only"> — არ შედის</span>}
                {row.value && <span className="ml-auto whitespace-nowrap pl-2 text-text-secondary">{row.value}</span>}
            </li>)}
        </ul>
    </article>;
}
