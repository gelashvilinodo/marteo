import { requireDashboardSection } from "@/lib/business/access";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import FaqAccordion from "@/components/landing/FaqAccordion";
import PlanCards, { planButtonClass } from "@/components/plans/PlanCards";
import PlanComparison from "@/components/plans/PlanComparison";
import { pricingFaq } from "@/components/plans/pricing-faq";
import { daysLeft, planTitle } from "@/components/plans/billing-format";
import { priceForBusiness } from "@/lib/subscription/billing";
import { quoteForBusiness, readDowngradeContext } from "@/lib/subscription/manage";
import type { PlanChangeQuote } from "@/lib/subscription/plan-change";
import { DowngradeButton } from "@/components/plans/PlanActions";
import { PLAN_FINE_PRINT, PLAN_FINE_PRINT_YEARLY } from "@/lib/subscription/plan-catalog";
import { INTERVAL_ADJECTIVES, isPaidTier, PAID_TIERS, periodPrice, PLAN_LABELS, PLAN_ONTO, type BillingInterval, type PaidTier } from "@/lib/subscription/plans";
import PeriodToggle from "@/components/plans/PeriodToggle";

export const metadata = { title: "გეგმები | MARTEO", robots: { index: false, follow: false } };

// „დეტალურად“ ამ გვერდზე მოდის: სრული შესაძლებლობები, სხვა გეგმები და ყიდვის ღილაკი.
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ plan?: string; period?: string }> }) {
    const membership = await requireDashboardSection("/dashboard/plans");
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const params = await searchParams;
    const requested = params.plan?.toUpperCase();
    const focus = PAID_TIERS.includes(requested as PaidTier) ? requested as PaidTier : null;
    const plan = membership.plan;
    const current = plan.tier && isPaidTier(plan.tier) ? plan.tier : null;
    // წლიურზე მყოფს გადამრთველი წლიურზე ხვდება, თუ სხვა არ აირჩია.
    const period = params.period?.toUpperCase();
    const interval: BillingInterval = period === "YEARLY" || period === "MONTHLY" ? period : current ? plan.interval : "MONTHLY";
    const yearly = interval === "YEARLY";
    const periodHref = (value: BillingInterval) => `/dashboard/plans?${focus ? `plan=${focus.toLowerCase()}&` : ""}period=${value.toLowerCase()}`;
    const periodQuery = yearly ? "&period=yearly" : "";
    const prisma = createPrismaClient();
    try {
        const prices = await priceForBusiness(prisma, user.id, membership.businessId);
        // მოქმედი ფასიანი გეგმიდან: იაფზე გადასვლა აქვე ხდება, ძვირზე — გადახდის გვერდზე სხვაობით.
        const team = current ? await readDowngradeContext(prisma, membership.businessId, user.id) : null;
        const quotes = current ? Object.fromEntries(await Promise.all(PAID_TIERS.map(async tier =>
            [tier, (await quoteForBusiness(prisma, user.id, membership.businessId, tier, interval)).quote] as const))) as Record<PaidTier, PlanChangeQuote> : null;
        const discounted = Object.values(prices).some(price => price.discounted);
        return (
            <main className="min-w-0 p-4 sm:p-6 lg:p-8">
                <div className="mx-auto w-full max-w-6xl space-y-6">
                    <Link href="/dashboard/billing" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-accent">
                        <Icon icon="solar:arrow-left-linear" className="h-4 w-4" aria-hidden="true" />პაკეტი და გადახდები
                    </Link>

                    <section className="text-center">
                        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">აირჩიეთ გეგმა „{membership.business.name}“-სთვის</h1>
                        <p className="mx-auto mt-2 max-w-2xl text-sm text-text-secondary sm:text-base">
                            ახლა: {planTitle(plan)}{plan.tier === "TRIAL" && plan.expiresAt ? `, დარჩა ${daysLeft(plan.expiresAt)} დღე` : ""}.
                            {" "}გეგმის შეცვლისას გადახდილი თანხა არ იკარგება.
                        </p>
                        {discounted && <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-success/10 px-4 py-2 text-sm font-medium text-success">
                            <Icon icon="solar:sale-bold-duotone" className="h-5 w-5" aria-hidden="true" />ეს დამატებითი ბიზნესია: გეგმებზე მოქმედებს −25% ფასდაკლება
                        </p>}
                    </section>

                    <PeriodToggle value={interval} href={periodHref} />

                    <PlanCards inset yearly={yearly} current={current && plan.interval === interval ? current : null} focus={focus} action={card => {
                        const price = prices[card.tier];
                        if (card.tier === current && plan.interval === interval) return <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-success/30 bg-success/10 px-4 text-sm font-semibold text-success">თქვენი მიმდინარე გეგმა</span>;
                        // იგივე გეგმა სხვა პერიოდით: თვიურიდან წლიურზე გადახდით, წლიურიდან თვიურზე ვადის ბოლოს.
                        const sameTier = card.tier === current;
                        const primary = (focus ?? "PRO") === card.tier;
                        const buttonClass = `w-full ${planButtonClass(card.tier, primary)}`;
                        const quote = quotes?.[card.tier] ?? null;
                        return <div className="space-y-2">
                            {price.discounted && <p className="text-sm text-success">ამ ბიზნესზე: <b className="font-semibold">{periodPrice(price.price, interval)} ₾</b> <span className="text-text-secondary line-through">{periodPrice(price.full, interval)} ₾</span></p>}
                            {quote?.kind === "downgrade"
                                ? <DowngradeButton tier={card.tier} interval={interval} sameTier={sameTier} quote={quote} team={team!} className={buttonClass}>{sameTier ? `გადასვლა ${INTERVAL_ADJECTIVES[interval]} გადახდაზე` : `გადასვლა ${PLAN_ONTO[card.tier]}`}</DowngradeButton>
                                : <Link href={`/dashboard/plans/checkout?plan=${card.tier.toLowerCase()}${periodQuery}`} className={buttonClass}>
                                    {sameTier ? `გადასვლა ${INTERVAL_ADJECTIVES[interval]} გადახდაზე` : quote?.kind === "upgrade" ? `გადასვლა ${PLAN_ONTO[card.tier]}` : `აირჩიეთ ${PLAN_LABELS[card.tier]}`}<Icon icon="solar:arrow-right-linear" className="h-4 w-4" aria-hidden="true" />
                                </Link>}
                            {quote?.kind === "upgrade" && quote.days > 0 && <p className="text-xs text-text-secondary">მიმდინარე გეგმის ნაშთი ახალ გეგმას {quote.days} დღედ დაემატება</p>}
                            {quote?.kind === "downgrade" && <p className="text-xs text-text-secondary">{sameTier ? "მიმდინარე ვადის ბოლომდე ყველაფერი უცვლელია" : `ნაშთი ${quote.days} დღეს ფარავს, გადახდა არ სჭირდება`}</p>}
                        </div>;
                    }} />
                    <p className="text-center text-sm text-text-secondary">{yearly ? PLAN_FINE_PRINT_YEARLY : PLAN_FINE_PRINT}</p>

                    <section aria-labelledby="compare-title" className="pt-6">
                        <h2 id="compare-title" className="mb-4 text-xl font-semibold text-text-primary">გეგმების სრული შედარება</h2>
                        <PlanComparison />
                    </section>

                    <section aria-label="კითხვები გეგმებზე" className="mx-auto max-w-3xl pt-6">
                        <FaqAccordion groups={pricingFaq} />
                    </section>
                </div>
            </main>
        );
    } finally {
        await prisma.$disconnect();
    }
}
