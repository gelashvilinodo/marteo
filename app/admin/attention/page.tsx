import Link from "next/link";
import { Icon } from "@iconify/react";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { EXPIRING_DAYS, INACTIVE_DAYS, LAPSED_DAYS, ONBOARDING_DAYS, RISK_KIND_KEYS, RISK_KINDS, getRiskSignals, type RiskKind } from "@/lib/admin/risk-signals";
import { formatSupportCount, formatSupportDate } from "@/lib/support/support-config";
import OpenSupportChatButton from "@/components/admin/OpenSupportChatButton";

export const metadata = { title: "ყურადღება · ადმინ პანელი" };

const RULES: Record<RiskKind, string> = {
    lapsed: `ფასიანი პაკეტის ან საცდელის ვადა გავიდა ბოლო ${LAPSED_DAYS} დღეში და ახალი გადახდა არ აღრიცხულა.`,
    expiring: `ფასიანი პაკეტი ან საცდელი ${EXPIRING_DAYS} დღეში იწურება.`,
    "ai-limit": "ამ თვის AI ლიმიტი ბოლომდე გამოიყენა. შეიძლება უფრო დიდი პაკეტი სჭირდეს.",
    inactive: `ფასიანი პაკეტი აქვს, მაგრამ ${INACTIVE_DAYS} დღეზე მეტია ახალი შეკვეთა არ შეუქმნია.`,
    onboarding: `დარეგისტრირდა ${ONBOARDING_DAYS.from}-${ONBOARDING_DAYS.to} დღის წინ და ჯერ ერთი შეკვეთაც არ აქვს.`,
};

export default async function AdminAttentionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const raw = (await searchParams).kind;
    const kind = typeof raw === "string" && (RISK_KIND_KEYS as string[]).includes(raw) ? raw as RiskKind : "";
    const data = await getRiskSignals(kind).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });

    return <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold text-text-primary">ყურადღება</h1>
        <p className="mt-1 text-sm text-text-secondary">ბიზნესები, რომლებსაც შეიძლება ჩვენგან წერილი ან დახმარება სჭირდებოდეს. გამოითვლება მხოლოდ პაკეტიდან, თარიღებიდან და რაოდენობებიდან.</p>

        <nav aria-label="სიგნალის ფილტრი" className="mt-6 flex flex-wrap gap-2">
            <Link href="/admin/attention" prefetch={false} scroll={false} aria-current={!kind ? "page" : undefined}
                className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${!kind ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-text-secondary hover:text-text-primary"}`}>
                ყველა <span className="font-semibold">{formatSupportCount(data.total)}</span>
            </Link>
            {RISK_KIND_KEYS.map(key => <Link key={key} href={`/admin/attention?kind=${key}`} prefetch={false} scroll={false} aria-current={kind === key ? "page" : undefined}
                className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${kind === key ? "border-accent bg-accent/10 text-accent" : "border-border bg-surface text-text-secondary hover:text-text-primary"}`}>
                <Icon icon={RISK_KINDS[key].icon} className="h-4 w-4" aria-hidden="true" />{RISK_KINDS[key].label} <span className="font-semibold">{formatSupportCount(data.counts[key])}</span>
            </Link>)}
        </nav>
        {kind && <p className="mt-3 text-xs text-text-secondary">{RULES[kind]}</p>}

        <section className="mt-4 rounded-2xl border border-border bg-surface">
            {data.businesses.length === 0
                ? <p className="flex items-center gap-2 px-4 py-5 text-sm text-text-secondary sm:px-5"><Icon icon="solar:check-circle-linear" className="h-5 w-5 text-success" aria-hidden="true" />ამ ეტაპზე ყურადღების მომთხოვნი ბიზნესი არ არის.</p>
                : <ul className="divide-y divide-border">
                    {data.businesses.map(business => <li key={business.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                        <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <Link href={`/admin/businesses/${business.id}`} prefetch={false} className="truncate text-sm font-semibold text-text-primary hover:text-accent">{business.name}</Link>
                                <span className="rounded-full bg-background px-1.5 text-[10px] font-medium text-text-secondary">{business.plan}</span>
                            </p>
                            <ul className="mt-1.5 flex flex-wrap gap-1.5">
                                {business.signals.map(signal => <li key={signal.kind} className={`flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-medium ${RISK_KINDS[signal.kind].tone}`}>
                                    <Icon icon={RISK_KINDS[signal.kind].icon} className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{RISK_KINDS[signal.kind].label}: {signal.detail}</span>
                                </li>)}
                            </ul>
                            <p className="mt-1 text-[11px] text-text-secondary">
                                რეგისტრაცია {formatSupportDate(business.createdAt.toISOString())} · ბოლო შეკვეთა {business.lastOrderAt ? formatSupportDate(business.lastOrderAt.toISOString()) : "არ აქვს"}
                            </p>
                        </div>
                        <OpenSupportChatButton businessId={business.id} conversationId={business.conversationId} compact />
                    </li>)}
                </ul>}
        </section>
    </div>;
}
