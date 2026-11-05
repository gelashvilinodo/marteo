import { requireDashboardSection } from "@/lib/business/access";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { getBillingOverview } from "@/lib/subscription/billing";
import { readCheckoutResult } from "@/lib/subscription/bank";
import { PLAN_ADJECTIVES, PLAN_LABELS, REFUND_WINDOW_DAYS, isPaidTier } from "@/lib/subscription/plans";
import { daysLeft, formatDay, LOCK_LABELS, PAYMENT_METHOD_LABELS, planTitle } from "@/components/plans/billing-format";
import { CancelPlanButton } from "@/components/plans/PlanActions";
import UsageMeter from "@/components/plans/UsageMeter";
import PaymentResult from "@/components/plans/PaymentResult";

export const metadata = { title: "პაკეტი და გადახდები | MARTEO", robots: { index: false, follow: false } };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
    const membership = await requireDashboardSection("/dashboard/billing");
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const prisma = createPrismaClient();
    try {
        // ბანკის გვერდიდან დაბრუნება: სტატუსს ბანკს ვეკითხებით, რომ გეგმა callback-ის მოლოდინის გარეშე ჩაირთოს.
        const paymentId = (await searchParams).payment;
        const result = paymentId && /^[a-z0-9]{10,40}$/.test(paymentId) && membership.access.role === "OWNER"
            ? await readCheckoutResult(prisma, membership.businessId, paymentId) : null;
        const { plan, period, usage, payments, prices } = await getBillingOverview(prisma, user.id, membership.businessId);
        const card = await prisma.subscription.findUnique({ where: { businessId: membership.businessId }, select: { bankCardMask: true, bankCardOrderId: true } });
        const paid = plan.tier && isPaidTier(plan.tier) ? plan.tier : null;
        const monthly = paid ? prices[paid] : null;
        return (
            <main className="min-w-0 p-4 sm:p-6 lg:p-8">
                <div className="mx-auto w-full max-w-6xl space-y-5">
                    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 sm:p-5">
                        <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                            <Icon icon="solar:wallet-bold-duotone" className="size-6" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">პაკეტი და გადახდები</h1>
                            <p className="mt-1 text-sm text-text-secondary">{membership.business.name}: გეგმა, გამოყენება და გადახდების ისტორია</p>
                        </div>
                        <Link href="/pricing" target="_blank" className="inline-flex min-h-10 w-full items-center gap-1.5 text-sm font-medium text-accent hover:underline sm:w-auto">
                            ფასების გვერდი<Icon icon="solar:arrow-right-up-linear" className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </section>

                    {result && <PaymentResult status={result.status} plan={result.plan} amount={result.amount} />}

                    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                        <section aria-labelledby="current-plan" className="rounded-2xl border border-border bg-surface p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm text-text-secondary">მიმდინარე გეგმა</p>
                                    <h2 id="current-plan" className="mt-1 text-xl font-semibold text-text-primary">{planTitle(plan)}</h2>
                                </div>
                                {plan.locked
                                    ? <span className="rounded-lg bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">{LOCK_LABELS[plan.lockReason ?? "NO_PLAN"]}</span>
                                    : plan.cancelAtPeriodEnd
                                        ? <span className="rounded-lg bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning">გაუქმდება ვადის ბოლოს</span>
                                        : <span className="rounded-lg bg-success/10 px-2.5 py-1 text-xs font-medium text-success">{plan.tier === "TRIAL" ? "საცდელი" : "აქტიური"}</span>}
                            </div>

                            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                                {monthly && <div className="rounded-xl bg-background p-4">
                                    <dt className="text-xs text-text-secondary">ყოველთვიური ფასი</dt>
                                    <dd className="mt-1 text-lg font-semibold text-text-primary">{monthly.price} ₾
                                        {monthly.discounted && <span className="ml-2 text-sm font-normal text-text-secondary line-through">{monthly.full} ₾</span>}
                                    </dd>
                                    {monthly.discounted && <p className="mt-1 text-xs text-success">დამატებითი ბიზნესის ფასდაკლება −25%</p>}
                                </div>}
                                {plan.expiresAt && <div className="rounded-xl bg-background p-4">
                                    <dt className="text-xs text-text-secondary">{plan.locked ? "დასრულდა" : plan.tier === "TRIAL" ? "საცდელი მთავრდება" : plan.cancelAtPeriodEnd ? "მოქმედებს" : "შემდეგი გადახდა"}</dt>
                                    <dd className="mt-1 text-lg font-semibold text-text-primary">{formatDay(plan.expiresAt)}</dd>
                                    {!plan.locked && <p className="mt-1 text-xs text-text-secondary">დარჩა {daysLeft(plan.expiresAt)} დღე</p>}
                                    {!plan.locked && paid && !plan.cancelAtPeriodEnd && card?.bankCardOrderId && <p className="mt-1 text-xs text-text-secondary">ავტომატურად, ბარათიდან{card.bankCardMask ? ` ${card.bankCardMask}` : ""}</p>}
                                </div>}
                            </dl>

                            {plan.locked && <p className="mt-4 rounded-xl bg-warning/10 p-3 text-sm leading-6 text-text-primary">
                                ბიზნესი მხოლოდ ნახვის რეჟიმშია. მონაცემები შენახულია. დამატებისა და ცვლილებისთვის აირჩიეთ გეგმა.
                            </p>}

                            <div className="mt-5 flex flex-wrap items-start gap-2">
                                {/* დაბლოკილი ფასიანი გეგმა ერთი დაჭერით ნახლდება; სხვა შემთხვევაში გეგმების გვერდი იხსნება. */}
                                {plan.locked && plan.lastPaidTier
                                    ? <Link href={`/dashboard/plans/checkout?plan=${plan.lastPaidTier.toLowerCase()}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover">
                                        <Icon icon="solar:restart-bold" className="h-4 w-4" aria-hidden="true" />{PLAN_ADJECTIVES[plan.lastPaidTier]} გეგმის განახლება
                                    </Link>
                                    : null}
                                <Link href="/dashboard/plans" className={plan.locked && plan.lastPaidTier
                                    ? "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-text-primary transition hover:border-accent/40 hover:text-accent"
                                    : "inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover"}>
                                    <Icon icon="solar:crown-bold" className="h-4 w-4" aria-hidden="true" />
                                    {plan.locked || plan.tier === "TRIAL" ? "აირჩიეთ გეგმა" : "გეგმის შეცვლა"}
                                </Link>
                                {paid && <CancelPlanButton canceled={plan.cancelAtPeriodEnd} expiresAt={plan.expiresAt} />}
                            </div>
                        </section>

                        <section aria-labelledby="payment-method" className="rounded-2xl border border-border bg-surface p-5">
                            <h2 id="payment-method" className="flex items-center gap-2 font-semibold text-text-primary">
                                <Icon icon="solar:card-bold-duotone" className="h-5 w-5 text-accent" aria-hidden="true" />გადახდის მეთოდი
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-text-secondary">
                                ბარათი ჯერ მიბმული არ არის. ის გეგმის პირველი გადახდისას მიებმება და ყოველთვიური გადახდა ავტომატურად შესრულდება.
                            </p>
                            <ul className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-text-secondary">
                                {["Visa", "Mastercard", "Apple Pay", "Google Pay"].map(method => <li key={method} className="rounded-lg border border-border px-2.5 py-1">{method}</li>)}
                            </ul>
                            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-text-secondary">
                                <Icon icon="solar:shield-check-linear" className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                                ბარათის მონაცემებს ბანკი ინახავს. მართეო მათ ვერ ხედავს.
                            </p>
                        </section>
                    </div>

                    <section aria-labelledby="usage" className="rounded-2xl border border-border bg-surface p-5">
                        <h2 id="usage" className="flex items-center gap-2 font-semibold text-text-primary">
                            <Icon icon="solar:chart-square-bold-duotone" className="h-5 w-5 text-accent" aria-hidden="true" />გამოყენება ამ პერიოდში
                        </h2>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            <UsageMeter icon="solar:bag-4-linear" label="შეკვეთები" used={usage.orders.used} limit={usage.orders.limit} />
                            <UsageMeter icon="solar:magic-stick-3-linear" label={plan.tier === "TRIAL" ? "მართეო AI (საცდელში სულ)" : "მართეო AI კითხვები"} used={usage.ai.used} limit={usage.ai.limit} />
                            {!usage.aiFiles.shared && <UsageMeter icon="solar:document-add-linear" label="შესყიდვა ფაილიდან" used={usage.aiFiles.used} limit={usage.aiFiles.limit} />}
                            {usage.sms.allowed && usage.sms.planIncluded > 0 && <UsageMeter icon="solar:chat-round-line-linear" label="გეგმის SMS" used={usage.sms.planUsed} limit={usage.sms.planIncluded} />}
                            <UsageMeter icon="solar:user-id-linear" label="თანამფლობელები" used={usage.team.coOwners} limit={usage.team.coOwnersLimit} />
                            <UsageMeter icon="solar:users-group-rounded-linear" label="თანამშრომლები" used={usage.team.staff} limit={usage.team.staffLimit} />
                        </div>
                        {usage.sms.balance > 0 && <p className="mt-3 text-sm text-text-secondary">ნაყიდი SMS: <b className="font-semibold text-text-primary">{usage.sms.balance}</b>{usage.sms.allowed ? "" : " (მიმდინარე გეგმაში SMS არ შედის, ნაშთი ინახება)"}</p>}
                        {!plan.locked && period.end && <p className="mt-3 text-xs text-text-secondary">პერიოდი: {formatDay(period.start)} — {formatDay(period.end)}. შეკვეთების და AI-ის ლიმიტი ახალ პერიოდში თავიდან იწყება.</p>}
                    </section>

                    <section aria-labelledby="payments" className="rounded-2xl border border-border bg-surface p-5">
                        <h2 id="payments" className="flex items-center gap-2 font-semibold text-text-primary">
                            <Icon icon="solar:bill-list-bold-duotone" className="h-5 w-5 text-accent" aria-hidden="true" />გადახდების ისტორია
                        </h2>
                        {payments.length === 0
                            ? <p className="mt-4 rounded-xl bg-background p-4 text-sm text-text-secondary">გადახდა ჯერ არ ყოფილა. პირველი გადახდის შემდეგ აქ გამოჩნდება თარიღი, თანხა და პერიოდი.</p>
                            : <ul className="mt-3 divide-y divide-border">
                                {payments.map(payment => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
                                    <span className="min-w-0">
                                        <span className="block font-medium text-text-primary">{isPaidTier(payment.plan) ? PLAN_LABELS[payment.plan] : payment.plan} · {formatDay(payment.paidAt)}</span>
                                        <span className="block text-xs text-text-secondary">{formatDay(payment.periodStart)} — {formatDay(payment.periodEnd)} · {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</span>
                                    </span>
                                    <span className="font-semibold text-text-primary">{payment.amount} ₾</span>
                                </li>)}
                            </ul>}
                    </section>

                    <section className="grid gap-3 text-sm sm:grid-cols-2">
                        <p className="flex items-start gap-2 rounded-2xl border border-border bg-surface p-4 leading-6 text-text-secondary">
                            <Icon icon="solar:refresh-circle-linear" className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                            ბიზნესის პირველი შეძენიდან {REFUND_WINDOW_DAYS} დღის განმავლობაში თანხის დაბრუნება შეგიძლიათ მოითხოვოთ დახმარების ჩატში.
                        </p>
                        <p className="flex items-start gap-2 rounded-2xl border border-border bg-surface p-4 leading-6 text-text-secondary">
                            <Icon icon="solar:calendar-mark-linear" className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                            გაუქმების შემდეგ თანხა აღარ ჩამოიჭრება, გეგმა კი გადახდილი თვის ბოლომდე მოქმედებს. მონაცემები შენახული რჩება.
                        </p>
                    </section>
                </div>
            </main>
        );
    } finally {
        await prisma.$disconnect();
    }
}
