import PlanCards from "@/components/plans/PlanCards";
import PlanComparison from "@/components/plans/PlanComparison";
import { SkeletonPage, SkeletonText as Text } from "@/components/plans/LoadingSkeleton";
import { pricingFaq } from "@/components/plans/pricing-faq";
import { PLAN_FINE_PRINT } from "@/lib/subscription/plan-catalog";
import styles from "@/components/plans/PlansSkeleton.module.css";

export default function Loading() {
    return <SkeletonPage spaced>
        <div className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium"><span className="h-4 w-4 rounded bg-text-secondary/10" /><Text>პაკეტი და გადახდები</Text></div>
        <section className="text-center">
            <h1 className="text-2xl font-bold sm:text-3xl"><Text>აირჩიეთ გეგმა თქვენი ბიზნესისთვის</Text></h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm sm:text-base"><Text>ახლა: მიმდინარე გეგმა. გეგმის შეცვლისას გადახდილი თანხა არ იკარგება.</Text></p>
        </section>
        <div className="flex flex-col items-center gap-3">
            <div className="inline-flex rounded-2xl border border-border bg-surface p-1">
                <div className="inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold"><Text>თვიური</Text></div>
                <div className="inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold"><Text>წლიური</Text><Text className="px-1.5 py-0.5 text-[11px]">−17%</Text></div>
            </div>
            <p className="inline-flex items-center gap-1.5 text-center text-sm"><span className="h-5 w-5 shrink-0 rounded bg-text-secondary/10" /><Text>წლიურ გადახდაზე 2 თვე საჩუქრად</Text></p>
        </div>
        <div className={styles.catalog}><PlanCards inset action={() => <div className="min-h-11 w-full rounded-xl bg-text-secondary/10" />} /></div>
        <p className="text-center text-sm"><Text>{PLAN_FINE_PRINT}</Text></p>
        <section className="pt-6">
            <h2 className="mb-4 text-xl font-semibold"><Text>გეგმების სრული შედარება</Text></h2>
            <div className={styles.catalog}><PlanComparison /></div>
        </section>
        <section className="mx-auto max-w-3xl pt-6">
            <div className="space-y-12 sm:space-y-14">{pricingFaq.map(group => <div key={group.id}>
                <div className="flex items-center gap-3"><span className="h-10 w-10 shrink-0 rounded-xl bg-text-secondary/10" /><h2 className="text-lg font-semibold sm:text-xl"><Text>{group.title}</Text></h2></div>
                <ul className="mt-5 space-y-3">{group.items.map(item => <li key={item.id} className="rounded-2xl border border-border bg-surface">
                    <div className="flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-4 sm:px-6 sm:py-5"><span className="text-[15px] font-semibold leading-snug sm:text-base"><Text>{item.question}</Text></span><span className="h-8 w-8 shrink-0 rounded-lg bg-text-secondary/10" /></div>
                </li>)}</ul>
            </div>)}</div>
        </section>
    </SkeletonPage>;
}
