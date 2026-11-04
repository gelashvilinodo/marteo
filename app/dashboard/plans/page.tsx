import { requireDashboardSection } from "@/lib/business/access";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import FaqAccordion from "@/components/landing/FaqAccordion";
import PlanCards from "@/components/plans/PlanCards";
import PlanComparison from "@/components/plans/PlanComparison";
import { pricingFaq } from "@/components/plans/pricing-faq";
import { daysLeft, planTitle } from "@/components/plans/billing-format";
import { priceForBusiness } from "@/lib/subscription/billing";
import { PLAN_FINE_PRINT } from "@/lib/subscription/plan-catalog";
import { isPaidTier, PAID_TIERS, PLAN_LABELS, type PaidTier } from "@/lib/subscription/plans";

export const metadata = { title: "გეგმები | MARTEO", robots: { index: false, follow: false } };

// „დეტალურად“ ამ გვერდზე მოდის: სრული შესაძლებლობები, სხვა გეგმები და ყიდვის ღილაკი.
export default async function PlansPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
    const membership = await requireDashboardSection("/dashboard/plans");
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const requested = (await searchParams).plan?.toUpperCase();
    const focus = PAID_TIERS.includes(requested as PaidTier) ? requested as PaidTier : null;
    const plan = membership.plan;
    const current = plan.tier && isPaidTier(plan.tier) ? plan.tier : null;
    const prisma = createPrismaClient();
    try {
        const prices = await priceForBusiness(prisma, user.id, membership.businessId);
        const discounted = Object.values(prices).some(price => price.discounted);
        return (
            <main className="min-w-0 p-4 sm:p-6 lg:p-8">
                <div className="mx-auto w-full max-w-6xl space-y-6">
                    <Link href="/dashboard/billing" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-accent">
                        <Icon icon="solar:arrow-left-linear" className="h-4 w-4" aria-hidden="true" />პაკეტი და გადახდები
                    </Link>

                    <section className="text-center">
                        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">აირჩიე გეგმა „{membership.business.name}“-სთვის</h1>
                        <p className="mx-auto mt-2 max-w-2xl text-sm text-text-secondary sm:text-base">
                            ახლა: {planTitle(plan)}{plan.tier === "TRIAL" && plan.expiresAt ? `, დარჩა ${daysLeft(plan.expiresAt)} დღე` : ""}.
                            {" "}გეგმის შეცვლისას გადახდილი თანხა არ იკარგება.
                        </p>
                        {discounted && <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-success/10 px-4 py-2 text-sm font-medium text-success">
                            <Icon icon="solar:sale-bold-duotone" className="h-5 w-5" aria-hidden="true" />ეს დამატებითი ბიზნესია: გეგმებზე მოქმედებს −25% ფასდაკლება
                        </p>}
                    </section>

                    <PlanCards inset current={current} focus={focus} action={card => {
                        const price = prices[card.tier];
                        if (card.tier === current) return <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-success/30 bg-success/10 px-4 text-sm font-semibold text-success">შენი მიმდინარე გეგმა</span>;
                        const primary = (focus ?? "PRO") === card.tier;
                        return <div className="space-y-2">
                            {price.discounted && <p className="text-sm text-success">ამ ბიზნესზე: <b className="font-semibold">{price.price} ₾</b> <span className="text-text-secondary line-through">{price.full} ₾</span></p>}
                            <Link href={`/dashboard/plans/checkout?plan=${card.tier.toLowerCase()}`}
                                className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${primary ? "bg-accent text-white hover:bg-accent-hover" : "border border-border bg-background text-text-primary hover:border-accent/40 hover:text-accent"}`}>
                                აირჩიე {PLAN_LABELS[card.tier]}<Icon icon="solar:arrow-right-linear" className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        </div>;
                    }} />
                    <p className="text-center text-sm text-text-secondary">{PLAN_FINE_PRINT}</p>

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
