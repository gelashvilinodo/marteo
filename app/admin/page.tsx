import { Icon } from "@iconify/react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAccessError, getAdminOverview } from "@/lib/admin/overview";
import { formatSupportCount, formatSupportTime } from "@/lib/support/support-config";
import { getGrowthStats, parseGrowthRange } from "@/lib/admin/growth";
import GrowthSection from "@/components/admin/GrowthSection";

type Card = { label: string; value: number; icon: string; tone: string; href?: string };

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const range = parseGrowthRange((await searchParams).range);
    const [data, growth] = await Promise.all([getAdminOverview(), getGrowthStats(range)]).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    const cards: Card[] = [
        { label: "ბიზნესები", value: data.totalBusinesses, icon: "solar:buildings-2-bold-duotone", tone: "bg-accent/12 text-accent", href: "/admin/businesses" },
        { label: "მომხმარებლები", value: data.users, icon: "solar:users-group-rounded-bold-duotone", tone: "bg-violet-500/12 text-violet-500", href: "/admin/users" },
        { label: "შეკვეთები", value: data.orders, icon: "solar:cart-large-2-bold-duotone", tone: "bg-success/12 text-success" },
        { label: "დაბეჭდილი ინვოისები", value: data.invoices, icon: "solar:printer-bold-duotone", tone: "bg-sky-500/12 text-sky-500" },
        { label: "მარაგის მოძრაობები", value: data.movements, icon: "solar:box-bold-duotone", tone: "bg-amber-500/12 text-amber-500" },
    ];

    return <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
                <h1 className="text-2xl font-semibold text-text-primary">მიმოხილვა</h1>
                <p className="mt-1 text-sm text-text-secondary">მთელი პლატფორმის მონაცემები · {data.date}, თბილისის დროით</p>
            </div>
            <p className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-secondary">
                <Icon icon="solar:refresh-linear" className="h-3.5 w-3.5" aria-hidden="true" />
                განახლდა {formatSupportTime(data.updatedAt)}-ზე
            </p>
        </div>

        <section className="mt-6 flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B2A55] via-[#0A244B] to-[#081F46] p-5 text-white sm:p-6">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                <Icon icon="solar:star-shine-bold-duotone" className="h-6 w-6 text-accent" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-sm text-slate-300">დღეს დამატებული ბიზნესები</p>
                <p className="mt-0.5 text-3xl font-semibold">{formatSupportCount(data.newBusinessesToday)}</p>
            </div>
        </section>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {cards.map(card => {
                const content = <>
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.tone}`}>
                        <Icon icon={card.icon} className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <p className="mt-4 text-2xl font-semibold text-text-primary sm:text-3xl">{formatSupportCount(card.value)}</p>
                    <h2 className="mt-1 flex items-center gap-1 text-xs text-text-secondary sm:text-sm">
                        {card.label}
                        {card.href && <Icon icon="solar:alt-arrow-right-linear" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden="true" />}
                    </h2>
                </>;
                const className = "group rounded-2xl border border-border bg-surface p-4 transition sm:p-5";
                return card.href
                    ? <Link key={card.label} href={card.href} prefetch={false} className={`${className} hover:border-accent/40`}>{content}</Link>
                    : <section key={card.label} className={className}>{content}</section>;
            })}
        </div>

        <GrowthSection stats={growth} range={range} />

        <p className="mt-5 max-w-2xl text-xs leading-6 text-text-secondary">შეკვეთებში წაშლილი ჩანაწერები არ ითვლება. დაბეჭდილი ინვოისები ითვლის შეკვეთებს, რომლებსაც აღრიცხული ბეჭდვა აქვთ; განმეორებითი ბეჭდვების რაოდენობა ბაზაში ცალკე არ ინახება.</p>
    </div>;
}
