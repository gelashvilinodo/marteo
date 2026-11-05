"use client";

import Link from "next/link";
import { useState } from "react";
import PlanCards, { planButtonClass } from "./PlanCards";
import PeriodToggle from "./PeriodToggle";
import { PLAN_FINE_PRINT, PLAN_FINE_PRINT_YEARLY } from "@/lib/subscription/plan-catalog";
import type { BillingInterval } from "@/lib/subscription/plans";

// ფასების გვერდის გეგმები: თვიური/წლიური გადამრთველი და ქარდები (ტელეფონზე ჰორიზონტალური კარუსელი).
export default function PricingPlans() {
    const [interval, setPeriod] = useState<BillingInterval>("MONTHLY");
    const yearly = interval === "YEARLY";
    return <>
        <div className="mb-8"><PeriodToggle value={interval} onSelect={setPeriod} /></div>
        <PlanCards carousel yearly={yearly} action={card => <Link href="/register" className={planButtonClass(card.tier, card.tier === "PRO")}>
            {card.tier === "PRO" ? "სცადეთ PRO 14 დღე" : "დაიწყეთ უფასოდ"}
        </Link>} />
        <p className="mt-6 text-center text-sm text-text-secondary">{yearly ? PLAN_FINE_PRINT_YEARLY : PLAN_FINE_PRINT}</p>
    </>;
}
