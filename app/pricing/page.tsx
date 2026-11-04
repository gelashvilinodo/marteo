import Link from "next/link";
import { Icon } from "@iconify/react";

import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";
import FaqAccordion from "@/components/landing/FaqAccordion";
import PlanCards from "@/components/plans/PlanCards";
import PlanComparison from "@/components/plans/PlanComparison";
import { pricingFaq } from "@/components/plans/pricing-faq";
import { PLAN_FINE_PRINT, TRIAL_PITCH } from "@/lib/subscription/plan-catalog";

export const metadata = {
    title: "ფასები - MARTEO",
    description: "სამი მარტივი გეგმა ონლაინ ბიზნესისთვის: სტარტი 19 ₾, ბიზნესი 39 ₾ და PRO 79 ₾ თვეში. 14 დღე უფასოდ.",
};

const everywhere = [
    { icon: "solar:bag-4-bold-duotone", title: "შეკვეთების მართვა", text: "სტატუსები, გადახდები, კურიერი და მიწოდების ზონები ერთ სიაში." },
    { icon: "solar:qr-code-bold-duotone", title: "ინვოისი QR კოდით", text: "ერთი დაჭერით ბეჭდვა, ჯგუფურადაც." },
    { icon: "solar:link-round-bold-duotone", title: "ბმული მომხმარებლისთვის", text: "მომხმარებელი შეკვეთის სტატუსს თავად ხედავს." },
    { icon: "solar:chart-2-bold-duotone", title: "ანალიტიკა", text: "შემოსავალი, ხარჯი, მოგება და სტატისტიკა." },
    { icon: "solar:calendar-bold-duotone", title: "კონტენტ-კალენდარი", text: "პოსტების დაგეგმვა ყველა არხისთვის." },
    { icon: "solar:smartphone-bold-duotone", title: "ტელეფონზეც", text: "დააყენე როგორც აპი და მართე ნებისმიერი ადგილიდან." },
    { icon: "solar:chat-round-dots-bold-duotone", title: "დახმარების ჩატი", text: "ქართულად, პირდაპირ აპიდან." },
    { icon: "solar:shield-check-bold-duotone", title: "უსაფრთხოება", text: "შენი მონაცემები მხოლოდ შენ გეკუთვნის." },
];

export default function PricingPage() {
    return (
        <main className="min-h-screen bg-background">
            <Header />

            <section aria-labelledby="pricing-title" className="landing-hero landing-hero-page relative isolate overflow-hidden text-white">
                <div aria-hidden="true" className="landing-hero-backdrop">
                    <span className="landing-hero-glow landing-hero-glow-1" />
                    <span className="landing-hero-glow landing-hero-glow-2" />
                </div>
                <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 sm:py-20 lg:px-8">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase sm:text-sm">ფასები</p>
                    <h1 id="pricing-title" className="mt-3 text-[clamp(1.6rem,6vw,3rem)] leading-tight font-bold text-balance">
                        გეგმა, რომელიც შენს ბიზნესთან ერთად იზრდება
                    </h1>
                    <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
                        დაიწყე უფასოდ, აირჩიე ის, რაც ახლა გჭირდება, და გადადი უფრო დიდზე, როცა ბიზნესი გაიზრდება. გადახდილი თანხა არ იკარგება.
                    </p>
                    <p className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white">
                        <Icon icon="solar:gift-bold-duotone" className="h-5 w-5 text-[#7ee2a8]" aria-hidden="true" />
                        {TRIAL_PITCH}
                    </p>
                </div>
            </section>

            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
                <section aria-label="გეგმები">
                    <PlanCards action={card => <Link href="/register"
                        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${card.tier === "PRO" ? "bg-accent text-white hover:bg-accent-hover" : "border border-border bg-background text-text-primary hover:border-accent/40 hover:text-accent"}`}>
                        {card.tier === "PRO" ? "სცადე PRO 14 დღე" : "დაიწყე უფასოდ"}
                    </Link>} />
                    <p className="mt-6 text-center text-sm text-text-secondary">{PLAN_FINE_PRINT}</p>
                </section>

                <section aria-labelledby="everywhere-title" className="mt-20">
                    <h2 id="everywhere-title" className="text-center text-2xl font-bold text-text-primary sm:text-3xl">ყველა გეგმაში შედის</h2>
                    <p className="mx-auto mt-3 max-w-xl text-center text-sm text-text-secondary sm:text-base">სტარტიც კი სრულფასოვანი სამუშაო სივრცეა: შეკვეთიდან ინვოისამდე ყველაფერი ერთ ადგილას.</p>
                    <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {everywhere.map(item => <li key={item.title} className="rounded-2xl border border-border bg-surface p-5">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><Icon icon={item.icon} className="h-5 w-5" aria-hidden="true" /></span>
                            <h3 className="mt-4 font-semibold text-text-primary">{item.title}</h3>
                            <p className="mt-1 text-sm leading-relaxed text-text-secondary">{item.text}</p>
                        </li>)}
                    </ul>
                </section>

                <section aria-labelledby="compare-title" className="mt-20">
                    <h2 id="compare-title" className="text-center text-2xl font-bold text-text-primary sm:text-3xl">გეგმების სრული შედარება</h2>
                    <div className="mt-10"><PlanComparison /></div>
                </section>

                <section aria-label="კითხვები ფასებზე" className="mx-auto mt-20 max-w-3xl">
                    <FaqAccordion groups={pricingFaq} />
                </section>

                <section className="mt-20 rounded-3xl bg-[#081F46] px-6 py-12 text-center text-white sm:px-10">
                    <h2 className="text-2xl font-bold sm:text-3xl">დაიწყე დღესვე, 14 დღე უფასოდ</h2>
                    <p className="mx-auto mt-3 max-w-lg text-sm text-white/70 sm:text-base">ბარათი არ არის საჭირო. რეგისტრაციას რამდენიმე წუთი სჭირდება.</p>
                    <Link href="/register" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">
                        რეგისტრაცია<Icon icon="solar:arrow-right-linear" className="h-4 w-4" aria-hidden="true" />
                    </Link>
                </section>
            </div>

            <Footer />
        </main>
    );
}
