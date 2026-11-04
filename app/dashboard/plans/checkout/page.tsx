import { requirePageAccess } from "@/lib/business/access";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import CheckoutConsent from "@/components/plans/CheckoutConsent";
import { daysLeft, formatDay } from "@/components/plans/billing-format";
import { priceForBusiness } from "@/lib/subscription/billing";
import { planCard } from "@/lib/subscription/plan-catalog";
import { addBillingMonths } from "@/lib/subscription/period";
import { PAID_TIERS, REFUND_WINDOW_DAYS, type PaidTier } from "@/lib/subscription/plans";

export const metadata = { title: "გადახდა | MARTEO", robots: { index: false, follow: false } };

// გადახდის გვერდი. ბანკის (საქართველოს ბანკი) ფორმა აქ ჩაჯდება; მანამდე ჯამი და პირობები ჩანს.
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
    const membership = await requirePageAccess("OWNER");
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const requested = (await searchParams).plan?.toUpperCase();
    if (!PAID_TIERS.includes(requested as PaidTier)) redirect("/dashboard/plans");
    const tier = requested as PaidTier;
    const plan = membership.plan;
    if (plan.tier === tier) redirect("/dashboard/billing");
    const prisma = createPrismaClient();
    try {
        const price = (await priceForBusiness(prisma, user.id, membership.businessId))[tier];
        const card = planCard(tier);
        const now = new Date();
        const nextCharge = addBillingMonths(now, 1).toISOString();
        const trialDays = plan.tier === "TRIAL" && plan.expiresAt ? daysLeft(plan.expiresAt) : 0;
        const amount = price.price.toFixed(2);
        return (
            <main className="min-w-0 p-4 sm:p-6 lg:p-8">
                <div className="mx-auto w-full max-w-4xl space-y-5">
                    <Link href={`/dashboard/plans?plan=${tier.toLowerCase()}`} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-accent">
                        <Icon icon="solar:arrow-left-linear" className="h-4 w-4" aria-hidden="true" />გეგმები
                    </Link>
                    <h1 className="text-2xl font-semibold text-text-primary">გადახდა</h1>

                    <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <section aria-labelledby="order-summary" className="rounded-2xl border border-border bg-surface p-5">
                            <h2 id="order-summary" className="font-semibold text-text-primary">შეკვეთის შეჯამება</h2>
                            <div className="mt-4 flex items-center gap-3 rounded-xl bg-background p-4">
                                <Icon icon={card.icon} className={`h-8 w-8 ${tier === "PRO" ? "text-[#E0A526]" : "text-accent"}`} aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="font-semibold text-text-primary">{card.name} გეგმა</p>
                                    <p className="text-sm text-text-secondary">{membership.business.name}</p>
                                </div>
                            </div>
                            <dl className="mt-4 space-y-3 text-sm">
                                <div className="flex justify-between gap-3"><dt className="text-text-secondary">თვიური ფასი</dt><dd className="text-text-primary">{price.full.toFixed(2)} ₾</dd></div>
                                {price.discounted && <div className="flex justify-between gap-3 text-success"><dt>დამატებითი ბიზნესის ფასდაკლება</dt><dd>−{(price.full - price.price).toFixed(2)} ₾</dd></div>}
                                <div className="flex justify-between gap-3 border-t border-border pt-3 text-base font-semibold"><dt className="text-text-primary">დღეს გადასახდელი</dt><dd className="text-text-primary">{amount} ₾</dd></div>
                                <div className="flex justify-between gap-3"><dt className="text-text-secondary">შემდეგი გადახდა</dt><dd className="text-text-primary">{formatDay(nextCharge)}</dd></div>
                            </dl>
                            <p className="mt-3 text-xs text-text-secondary">ფასში შედის ბანკის საკომისიო.</p>
                            {trialDays > 0 && <p className="mt-4 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm leading-6 text-text-primary">
                                <Icon icon="solar:info-circle-linear" className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                                საცდელი პერიოდის დარჩენილი {trialDays} დღე გაუქმდება და გეგმა დღესვე დაიწყება.
                            </p>}
                        </section>

                        <section aria-labelledby="payment-form" className="rounded-2xl border border-border bg-surface p-5">
                            <h2 id="payment-form" className="font-semibold text-text-primary">გადახდის მეთოდი</h2>
                            <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
                                {[{ icon: "solar:card-bold-duotone", label: "ბარათი" }, { icon: "ph:apple-logo-fill", label: "Apple Pay" }, { icon: "ph:google-logo-bold", label: "Google Pay" }, { icon: "solar:shield-check-bold-duotone", label: "დაცული გადახდა" }].map(item =>
                                    <li key={item.label} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-text-primary"><Icon icon={item.icon} className="h-5 w-5 text-accent" aria-hidden="true" />{item.label}</li>)}
                            </ul>
                            <p className="mt-4 flex items-start gap-2 rounded-xl bg-background p-3 text-sm leading-6 text-text-secondary">
                                <Icon icon="solar:refresh-circle-bold-duotone" className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                                ყიდვიდან {REFUND_WINDOW_DAYS} დღის განმავლობაში შეგიძლია თანხის სრული დაბრუნება მოითხოვო. ამის შემდეგ თანხა აღარ ბრუნდება.
                            </p>
                            <div className="mt-5"><CheckoutConsent amount={amount} /></div>
                        </section>
                    </div>
                </div>
            </main>
        );
    } finally {
        await prisma.$disconnect();
    }
}
