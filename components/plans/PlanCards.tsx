import { Icon } from "@iconify/react";
import type { ReactNode } from "react";
import { PLAN_CARDS, YEARLY_PAID_MONTHS, type PlanCard } from "@/lib/subscription/plan-catalog";
import PlanCarousel from "./PlanCarousel";
import type { PaidTier } from "@/lib/subscription/plans";

// სამი გეგმის ქარდი. action თითო ქარდის ღილაკს აწყობს (ფასების გვერდზე „დაიწყე“, დაშბორდში „დეტალურად“).
// compact: გეგმის ფანჯარაში ჩამონათვალი მოკლდება, რომ სამივე ქარდი ერთ ეკრანზე დაეტიოს.
// inset: დაშბორდში საიდბარის გამო ადგილი ნაკლებია, ამიტომ სამი სვეტი მხოლოდ ფართო ეკრანზე იშლება.
// carousel: ტელეფონზე ქარდები ჰორიზონტალურად იფურცლება (ფასების გვერდი). yearly: ფასი წლიურად.
export default function PlanCards({ action, current, focus, compact = false, inset = false, carousel = false, yearly = false }: {
    action: (card: PlanCard) => ReactNode;
    current?: PaidTier | null;
    focus?: PaidTier | null;
    compact?: boolean;
    inset?: boolean;
    carousel?: boolean;
    yearly?: boolean;
}) {
    const cards = PLAN_CARDS.map(card => <PlanCardView key={card.tier} card={card} action={action(card)} current={current === card.tier} focused={(focus ?? "PRO") === card.tier} compact={compact} yearly={yearly} />);
    if (carousel) return <PlanCarousel labels={PLAN_CARDS.map(card => card.name)}>{cards}</PlanCarousel>;
    return <div className={`grid items-stretch gap-4 ${compact ? "md:grid-cols-3" : inset ? "md:grid-cols-2 xl:grid-cols-3" : "lg:grid-cols-3"}`}>{cards}</div>;
}

// სტარტი მწვანეა, ბიზნესი PRO-ს ღილაკის ლურჯში. PRO-ს საკუთარი ფერი არ აქვს: გამოკვეთილი ქარდის მუქ ლურჯში ჩანს.
const TIER_THEME: Record<PaidTier, { card: string; tile: string; check: string; badge: string; button: string }> = {
    START: {
        card: "border-emerald-500/30 bg-linear-to-b from-emerald-500/12 via-emerald-500/4 to-surface",
        tile: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        check: "text-emerald-600 dark:text-emerald-400",
        badge: "bg-emerald-600 text-white",
        button: "bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600",
    },
    BUSINESS: {
        card: "border-accent/30 bg-linear-to-b from-accent/14 via-accent/4 to-surface",
        tile: "bg-accent/15 text-accent",
        check: "text-accent",
        badge: "bg-accent text-white",
        button: "bg-accent text-white hover:bg-accent-hover",
    },
    PRO: {
        card: "border-border bg-surface",
        tile: "text-[#E0A526]",
        check: "text-success",
        badge: "bg-accent text-white",
        button: "border border-border bg-background text-text-primary hover:border-accent/40 hover:text-accent",
    },
};

// ქარდის ღილაკის ფერი: გამოკვეთილზე ლურჯი, დანარჩენზე გეგმის საკუთარი ფერი.
export function planButtonClass(tier: PaidTier, primary: boolean) {
    return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${primary ? "bg-accent text-white hover:bg-accent-hover" : TIER_THEME[tier].button}`;
}

// გამოკვეთილი ქარდი (ჩვეულებრივ PRO) ჰედერის მუქ ლურჯ ფერშია, დანარჩენი ორი თავისი ფერით.
function PlanCardView({ card, action, current, focused, compact, yearly }: { card: PlanCard; action: ReactNode; current: boolean; focused: boolean; compact: boolean; yearly: boolean }) {
    const rows = compact ? [...card.rows.filter(row => !row.shared), ...card.rows.filter(row => row.shared)].slice(0, 5) : card.rows;
    const pro = card.tier === "PRO";
    const theme = TIER_THEME[card.tier];
    const muted = focused ? "text-white/70" : "text-text-secondary";
    return <article className={`flex flex-col gap-4 rounded-2xl p-5 ${focused ? "border border-white/10 bg-[#081F46] dark:border-accent/60 text-white shadow-xl shadow-[#081F46]/20" : `border text-text-primary ${theme.card}`}`} aria-label={yearly ? `${card.name} — ${card.price * YEARLY_PAID_MONTHS} ლარი წელიწადში` : `${card.name} — ${card.price} ლარი თვეში`}>
        <div className="flex flex-wrap items-center gap-2.5">
            {pro || focused
                ? <Icon icon={card.icon} aria-hidden="true" className={`h-6 w-6 ${pro ? "text-[#E0A526]" : "text-white/80"}`} />
                : <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${theme.tile}`}><Icon icon={card.icon} aria-hidden="true" className="h-5 w-5" /></span>}
            <h3 className="text-lg font-semibold">{card.name}</h3>
            {current
                ? <span className={`ml-auto rounded-lg px-2.5 py-1 text-xs font-medium ${focused ? "bg-white/15 text-white" : "bg-success/10 text-success"}`}>მიმდინარე გეგმა</span>
                : card.badge && (focused || !pro) && <span className={`ml-auto rounded-lg px-2.5 py-1 text-xs font-medium ${focused ? "bg-accent text-white" : theme.badge}`}>{card.badge}</span>}
        </div>
        <p className={`-mt-2 text-sm ${muted}`}>{card.tagline}</p>
        {yearly
            ? <div>
                <p><span className="text-4xl font-semibold">{card.price * YEARLY_PAID_MONTHS}</span> <span className={`text-base ${muted}`}>₾ / წელი</span></p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <s className={muted}>{card.price * 12} ₾</s>
                    <span className={`rounded-md px-1.5 py-0.5 font-semibold ${focused ? "bg-[#7ee2a8]/15 text-[#7ee2a8]" : "bg-success/12 text-success"}`}>{12 - YEARLY_PAID_MONTHS} თვე საჩუქრად · −{card.price * (12 - YEARLY_PAID_MONTHS)} ₾</span>
                </p>
            </div>
            : <div>
                <p><span className="text-4xl font-semibold">{card.price}</span> <span className={`text-base ${muted}`}>₾ / თვე</span></p>
                {pro && <p className={`mt-1 text-xs ${focused ? "text-[#85B7EB]" : "text-accent"}`}>{card.perDay}</p>}
            </div>}
        {action}
        <ul className="flex flex-col gap-2.5 text-sm">
            {rows.map(row => <li key={row.label} className="flex items-start gap-2.5">
                <Icon icon="solar:check-read-linear" aria-hidden="true" className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${focused ? "text-[#85B7EB]" : theme.check}`} />
                <span>{row.label}{row.value && <b className="font-semibold"> {row.value}</b>}</span>
            </li>)}
        </ul>
    </article>;
}
