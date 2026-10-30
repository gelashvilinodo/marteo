import Link from "next/link";
import { Icon } from "@iconify/react";
import type { GrowthRange, GrowthStats } from "@/lib/admin/growth";
import { formatSupportCount, formatSupportDate } from "@/lib/support/support-config";
import { SUBSCRIPTION_STATUS_LABELS } from "./AdminBadges";
import RegistrationsChart from "./RegistrationsChart";

const RANGES: { value: GrowthRange; label: string }[] = [
    { value: "30", label: "30 დღე" }, { value: "90", label: "90 დღე" }, { value: "all", label: "სულ" },
];

function percent(part: number, whole: number) {
    return whole ? Math.round((part / whole) * 100) : 0;
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
    return <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            {action}
        </div>
        <div className="mt-4">{children}</div>
    </section>;
}

// A horizontal bar whose label and value stay in text ink; the bar carries magnitude only.
function Bar({ label, value, max, note }: { label: string; value: number; max: number; note?: string }) {
    return <div>
        <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-text-primary">{label}</span>
            <span className="shrink-0 text-text-secondary"><b className="font-semibold text-text-primary">{formatSupportCount(value)}</b>{note ? ` · ${note}` : ""}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-accent" style={{ width: `${max ? Math.max((value / max) * 100, value ? 2 : 0) : 0}%` }} />
        </div>
    </div>;
}

export default function GrowthSection({ stats, range }: { stats: GrowthStats; range: GrowthRange }) {
    const { funnel, activity } = stats;
    const steps = [
        { label: "დარეგისტრირდა", value: funnel.registered },
        { label: "დაადასტურა ანგარიში", value: funnel.verified },
        { label: "შექმნა ბიზნესი", value: funnel.withBusiness },
        { label: "გააკეთა პირველი შეკვეთა", value: funnel.withOrder },
    ];
    const planMax = Math.max(1, ...stats.plans.map(row => row.count));

    return <div className="mt-8">
        <h2 className="text-lg font-semibold text-text-primary">ზრდა</h2>

        <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <Card title="რეგისტრაციები, ბოლო 30 დღე"><RegistrationsChart days={stats.days} /></Card>

            <Card title="ძაბრი: სად იკარგებიან მომხმარებლები" action={<nav aria-label="პერიოდი" className="flex gap-1 rounded-xl bg-background p-1">
                {RANGES.map(item => <Link key={item.value} href={item.value === "30" ? "/admin" : `/admin?range=${item.value}`} prefetch={false} scroll={false}
                    aria-current={range === item.value ? "page" : undefined}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${range === item.value ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}>{item.label}</Link>)}
            </nav>}>
                <div className="flex flex-col gap-4">
                    {steps.map((step, index) => <Bar key={step.label} label={`${index + 1}. ${step.label}`} value={step.value} max={funnel.registered}
                        note={index === 0 ? undefined : `${percent(step.value, funnel.registered)}%`} />)}
                </div>
                <p className="mt-4 text-xs leading-5 text-text-secondary">
                    {range === "all" ? "ყველა მომხმარებელი" : `ბოლო ${range} დღეში დარეგისტრირებულები`}. პროცენტი პირველ ნაბიჯთან მიმართებით.
                    {funnel.registered > 0 && steps[1].value < funnel.registered && ` ${funnel.registered - steps[1].value} ჯერ ვერიფიკაციას არ დაუსრულებია.`}
                </p>
            </Card>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card title="აქტიური ბიზნესები">
                <div className="grid grid-cols-2 gap-3">
                    {[{ label: "ბოლო 7 დღე", active: activity.active7, ordered: activity.ordered7 }, { label: "ბოლო 30 დღე", active: activity.active30, ordered: activity.ordered30 }].map(item =>
                        <div key={item.label} className="rounded-xl bg-background p-3">
                            <p className="text-xs text-text-secondary">{item.label}</p>
                            <p className="mt-1 text-2xl font-semibold text-text-primary">{formatSupportCount(item.active)}</p>
                            <p className="text-xs text-text-secondary">{percent(item.active, activity.total)}% · შეკვეთით {formatSupportCount(item.ordered)}</p>
                        </div>)}
                </div>
                <p className="mt-3 text-xs leading-5 text-text-secondary">აქტიურია ბიზნესი, რომლის წევრიც შევიდა ან რომელმაც შეკვეთა დაამატა. სულ {formatSupportCount(activity.total)} ბიზნესი.</p>
            </Card>

            <Card title="პაკეტები">
                <div className="flex flex-col gap-3">
                    {stats.plans.map(row => <Bar key={row.plan} label={row.plan === "NONE" ? "პაკეტის გარეშე" : row.plan} value={row.count} max={planMax}
                        note={`${percent(row.count, activity.total)}%`} />)}
                </div>
            </Card>

            <Card title="ვადის ამოწურვა 7 დღეში">
                {stats.renewals.length === 0
                    ? <p className="flex items-center gap-2 text-sm text-text-secondary"><Icon icon="solar:check-circle-linear" className="h-5 w-5 text-success" aria-hidden="true" />ამ კვირაში არცერთ პაკეტს არ ეწურება ვადა.</p>
                    : <ul className="-mx-2 flex flex-col">
                        {stats.renewals.map(row => <li key={row.id}>
                            <Link href={`/admin/businesses/${row.id}`} prefetch={false} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-background">
                                <Icon icon={row.overdue ? "solar:danger-triangle-bold" : "solar:hourglass-linear"} className={`h-4 w-4 shrink-0 ${row.overdue ? "text-danger" : "text-warning"}`} aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-text-primary">{row.name}</span>
                                    <span className="block truncate text-xs text-text-secondary">{row.plan} · {SUBSCRIPTION_STATUS_LABELS[row.status] ?? row.status} · {row.overdue ? "ვადა გავიდა" : "მთავრდება"} {formatSupportDate(row.expiresAt.toISOString())}</span>
                                </span>
                                <Icon icon="solar:alt-arrow-right-linear" className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
                            </Link>
                        </li>)}
                    </ul>}
            </Card>
        </div>
    </div>;
}
