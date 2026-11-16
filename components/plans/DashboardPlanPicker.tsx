"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/shared/Icon";
import PlanCards, { planButtonClass } from "./PlanCards";
import PeriodToggle from "./PeriodToggle";
import Swap from "./Swap";
import { DowngradeButton, type DowngradeTeam } from "./PlanActions";
import { PLAN_FINE_PRINT, PLAN_FINE_PRINT_YEARLY } from "@/lib/subscription/plan-catalog";
import type { PlanChangeQuote } from "@/lib/subscription/plan-change";
import type { TierPrice } from "@/lib/subscription/billing";
import { INTERVAL_ADJECTIVES, periodPrice, PLAN_LABELS, PLAN_ONTO, type BillingInterval, type PaidTier } from "@/lib/subscription/plans";

// დაშბორდის გეგმების გადამრთველი და ქარდები. ორივე პერიოდის ფასი და გადასვლის გათვლა სერვერმა წინასწარ მოიტანა,
// ამიტომ თვიური/წლიური გადართვა მყისიერია და გვერდი თავიდან არ იტვირთება. მისამართი მაინც ახლდება (?period=).
export default function DashboardPlanPicker({ initial, current, currentInterval, focus, prices, quotes, team }: {
    initial: BillingInterval;
    current: PaidTier | null;
    currentInterval: BillingInterval;
    focus: PaidTier | null;
    prices: Record<PaidTier, TierPrice>;
    quotes: Record<BillingInterval, Record<PaidTier, PlanChangeQuote>> | null;
    team: DowngradeTeam | null;
}) {
    const [interval, setInterval] = useState(initial);
    const yearly = interval === "YEARLY";
    const select = (value: BillingInterval) => {
        setInterval(value);
        const url = new URL(window.location.href);
        url.searchParams.set("period", value.toLowerCase());
        window.history.replaceState(window.history.state, "", url);
    };

    return <>
        <PeriodToggle value={interval} onSelect={select} />
        <PlanCards inset yearly={yearly} current={current && currentInterval === interval ? current : null} focus={focus} action={card => {
            const price = prices[card.tier];
            if (card.tier === current && currentInterval === interval) return <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-success/30 bg-success/10 px-4 text-sm font-semibold text-success">თქვენი მიმდინარე გეგმა</span>;
            // იგივე გეგმა სხვა პერიოდით: თვიურიდან წლიურზე გადახდით, წლიურიდან თვიურზე ვადის ბოლოს.
            const sameTier = card.tier === current;
            const primary = (focus ?? "PRO") === card.tier;
            const buttonClass = `w-full ${planButtonClass(card.tier, primary)}`;
            const quote = quotes?.[interval][card.tier] ?? null;
            return <div className="space-y-2">
                {price.discounted && <p className="text-sm text-success">ამ ბიზნესზე: <b className="font-semibold">{periodPrice(price.price, interval)} ₾</b> <span className="text-text-secondary line-through">{periodPrice(price.full, interval)} ₾</span></p>}
                {quote?.kind === "downgrade"
                    ? <DowngradeButton key={interval} tier={card.tier} interval={interval} sameTier={sameTier} quote={quote} team={team!} className={buttonClass}>{sameTier ? `გადასვლა ${INTERVAL_ADJECTIVES[interval]} გადახდაზე` : `გადასვლა ${PLAN_ONTO[card.tier]}`}</DowngradeButton>
                    : <Link href={`/dashboard/plans/checkout?plan=${card.tier.toLowerCase()}${yearly ? "&period=yearly" : ""}`} className={buttonClass}>
                        {sameTier ? `გადასვლა ${INTERVAL_ADJECTIVES[interval]} გადახდაზე` : quote?.kind === "upgrade" ? `გადასვლა ${PLAN_ONTO[card.tier]}` : `აირჩიეთ ${PLAN_LABELS[card.tier]}`}<Icon icon="solar:arrow-right-linear" className="h-4 w-4" aria-hidden="true" />
                    </Link>}
                {quote?.kind === "upgrade" && quote.days > 0 && <p className="text-xs text-text-secondary">მიმდინარე გეგმის ნაშთი ახალ გეგმას {quote.days} დღედ დაემატება</p>}
                {quote?.kind === "downgrade" && <p className="text-xs text-text-secondary">{sameTier ? "მიმდინარე ვადის ბოლომდე ყველაფერი უცვლელია" : `ნაშთი ${quote.days} დღეს ფარავს, გადახდა არ სჭირდება`}</p>}
            </div>;
        }} />
        <Swap on={yearly} className="justify-items-center text-center text-sm text-text-secondary" yes={PLAN_FINE_PRINT_YEARLY} no={PLAN_FINE_PRINT} />
    </>;
}
