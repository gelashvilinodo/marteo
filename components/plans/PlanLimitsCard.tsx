import Link from "next/link";
import { Icon } from "@/components/shared/Icon";
import type { BillingOverview } from "@/lib/subscription/billing";
import { formatDay, planTitle } from "./billing-format";
import UsageMeter from "./UsageMeter";

// ბიზნესის პარამეტრებში: გეგმა და ლიმიტების ხაზოვანი მრიცხველები. დეტალები „პაკეტი და გადახდებშია“.
export default function PlanLimitsCard({ overview }: { overview: Pick<BillingOverview, "plan" | "usage" | "period"> }) {
    const { plan, usage, period } = overview;
    return <section aria-labelledby="plan-limits" className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
                <h2 id="plan-limits" className="flex items-center gap-2 font-semibold text-text-primary">
                    <Icon icon="solar:crown-linear" className="size-5 shrink-0 text-accent" aria-hidden="true" />{planTitle(plan)}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                    {plan.locked ? "ბიზნესი მხოლოდ ნახვის რეჟიმშია." : period.end ? `ლიმიტები განახლდება: ${formatDay(period.end)}.` : "ლიმიტები მიმდინარე პერიოდში."}
                </p>
            </div>
            <Link href="/dashboard/billing" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                პაკეტი და გადახდები<Icon icon="solar:arrow-right-linear" className="h-4 w-4" aria-hidden="true" />
            </Link>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <UsageMeter icon="solar:bag-4-linear" label="შეკვეთები" used={usage.orders.used} limit={usage.orders.limit} />
            {/* გეგმაში არშემავალი ლიმიტი აქ არ ჩანს; სრული სია „პაკეტი და გადახდებშია“. */}
            {usage.ai.limit > 0 && <UsageMeter icon="solar:magic-stick-3-linear" label={plan.tier === "TRIAL" ? "მართეო AI (საცდელში სულ)" : "მართეო AI კითხვები"} used={usage.ai.used} limit={usage.ai.limit} />}
            {!usage.aiFiles.shared && usage.aiFiles.limit !== 0 && <UsageMeter icon="solar:document-add-linear" label="შესყიდვა ფაილიდან" used={usage.aiFiles.used} limit={usage.aiFiles.limit} />}
        </div>
    </section>;
}
