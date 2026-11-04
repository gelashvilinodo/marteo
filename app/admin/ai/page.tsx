import Link from "next/link";
import { Icon } from "@iconify/react";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { getAiUsageStats } from "@/lib/admin/ai-usage";
import { AI_MONTHLY_LIMITS } from "@/lib/ai/ai-quota";
import { formatSupportCount } from "@/lib/support/support-config";
import { Card } from "@/components/admin/GrowthSection";

export const metadata = { title: "მართეო AI · ადმინ პანელი" };

const KIND_LABELS: Record<string, string> = { CHAT: "კითხვები", PURCHASE_DRAFT: "ფაილიდან შესყიდვა", TITLE: "ჩათის სათაურები" };
const MONTHS = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];
const usd = (value: number) => `$${value < 10 ? value.toFixed(value < 1 ? 4 : 2) : value.toFixed(2)}`;
const tokens = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1000 ? `${Math.round(value / 1000)}K` : String(value);
const dayLabel = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

function Tile({ label, value, note, icon, tone }: { label: string; value: string; note?: string; icon: string; tone: string }) {
    return <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon icon={icon} className="h-5 w-5" aria-hidden="true" /></span>
        <p className="mt-4 text-2xl font-semibold text-text-primary sm:text-3xl">{value}</p>
        <h2 className="mt-1 text-xs text-text-secondary sm:text-sm">{label}</h2>
        {note && <p className="mt-0.5 text-[11px] text-text-secondary">{note}</p>}
    </div>;
}

export default async function AdminAiPage() {
    const stats = await getAiUsageStats().catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    const { month } = stats;
    const max = Math.max(...stats.days.map(day => day.cost), 0.000001);
    const total30 = stats.days.reduce((sum, day) => sum + day.cost, 0);

    return <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold text-text-primary">მართეო AI</h1>
        <p className="mt-1 text-sm text-text-secondary">ხარჯი და გამოყენება ამ თვეში (თბილისის დროით). ფასი სავარაუდოა, Claude Haiku 5.5-ის ტოკენების ფასით.</p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Tile label="ხარჯი ამ თვეში" value={usd(month.cost)} note={`გასულ თვეში ${usd(stats.lastMonthCost)}`} icon="solar:dollar-minimalistic-bold-duotone" tone="bg-danger/12 text-danger" />
            <Tile label="კითხვა და ფაილი" value={formatSupportCount(month.requests)} note={month.failed ? `${month.failed} შეცდომით დასრულდა` : undefined} icon="solar:chat-round-dots-bold-duotone" tone="bg-accent/12 text-accent" />
            <Tile label="ბიზნესი იყენებს" value={formatSupportCount(month.businesses)} note={month.requests ? `საშუალოდ ${usd(month.cost / Math.max(month.requests, 1))} ერთ კითხვაზე` : undefined} icon="solar:buildings-2-bold-duotone" tone="bg-violet-500/12 text-violet-500" />
            <Tile label="ტოკენები (შემავალი / გამავალი)" value={`${tokens(month.inputTokens)} / ${tokens(month.outputTokens)}`} icon="solar:cpu-bolt-bold-duotone" tone="bg-amber-500/12 text-amber-500" />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card title="ხარჯი დღეების მიხედვით, ბოლო 30 დღე">
                <figure className="m-0">
                    <figcaption className="text-sm text-text-secondary">სულ <b className="font-semibold text-text-primary">{usd(total30)}</b></figcaption>
                    <div className="mt-4 flex h-36 items-end gap-[2px]" aria-hidden="true">
                        {stats.days.map(day => <span key={day.day} title={`${dayLabel(day.day)}: ${usd(day.cost)} · ${day.requests} კითხვა`}
                            className={`block min-w-0 flex-1 rounded-t-[3px] ${day.cost ? "bg-accent" : "bg-border/60"}`}
                            style={{ height: day.cost ? `max(${(day.cost / max) * 100}%, 3px)` : 2 }} />)}
                    </div>
                    <div className="mt-1.5 flex justify-between text-[10px] text-text-secondary" aria-hidden="true">
                        {[0, 10, 20, stats.days.length - 1].map(index => <span key={index}>{dayLabel(stats.days[index].day)}</span>)}
                    </div>
                    <table className="sr-only">
                        <caption>AI ხარჯი დღეების მიხედვით</caption>
                        <thead><tr><th scope="col">დღე</th><th scope="col">ხარჯი</th><th scope="col">კითხვები</th></tr></thead>
                        <tbody>{stats.days.map(day => <tr key={day.day}><td>{day.day}</td><td>{usd(day.cost)}</td><td>{day.requests}</td></tr>)}</tbody>
                    </table>
                </figure>
            </Card>
            <Card title="რაზე იხარჯება">
                {stats.byKind.length === 0
                    ? <p className="text-sm text-text-secondary">ამ თვეში AI ჯერ არავის გამოუყენებია.</p>
                    : <ul className="flex flex-col divide-y divide-border">
                        {stats.byKind.map(row => <li key={row.kind} className="flex items-baseline justify-between gap-3 py-2.5 text-sm">
                            <span className="text-text-primary">{KIND_LABELS[row.kind] ?? row.kind}</span>
                            <span className="text-text-secondary"><b className="font-semibold text-text-primary">{usd(row.cost)}</b> · {formatSupportCount(row.requests)}</span>
                        </li>)}
                    </ul>}
                <p className="mt-3 text-xs leading-5 text-text-secondary">თვიური ლიმიტი: FREE {AI_MONTHLY_LIMITS.FREE}, START {AI_MONTHLY_LIMITS.START}, BUSINESS {AI_MONTHLY_LIMITS.BUSINESS}, PRO {AI_MONTHLY_LIMITS.PRO}. სათაურები ლიმიტში არ ითვლება.</p>
            </Card>
        </div>

        <section className="mt-4 rounded-2xl border border-border bg-surface">
            <h2 className="px-4 pt-4 text-sm font-semibold text-text-primary sm:px-5">ყველაზე მეტად იყენებენ ამ თვეში</h2>
            {stats.top.length === 0
                ? <p className="px-4 py-4 text-sm text-text-secondary sm:px-5">ჯერ არავინ.</p>
                : <ul className="mt-2 divide-y divide-border">
                    {stats.top.map(row => {
                        const share = row.limit ? Math.min(row.requests / row.limit, 1) : 1;
                        const body = <>
                            <div className="min-w-0 flex-1">
                                <p className="flex items-center gap-1.5 truncate text-sm font-medium text-text-primary">{row.name}
                                    {row.disabled && <span className="rounded-full bg-danger/12 px-1.5 text-[10px] font-medium text-danger">გამორთული</span>}</p>
                                <div className="mt-1.5 flex items-center gap-2">
                                    <span className="h-1.5 w-28 overflow-hidden rounded-full bg-background"><span className={`block h-full rounded-full ${share >= 1 ? "bg-danger" : share >= 0.8 ? "bg-warning" : "bg-accent"}`} style={{ width: `${share * 100}%` }} /></span>
                                    <span className="text-xs text-text-secondary">{formatSupportCount(row.requests)} / {formatSupportCount(row.limit)}</span>
                                </div>
                            </div>
                            <p className="shrink-0 text-sm font-semibold text-text-primary">{usd(row.cost)}</p>
                        </>;
                        return <li key={row.id ?? row.name}>{row.id
                            ? <Link href={`/admin/businesses/${row.id}`} prefetch={false} className="flex items-center gap-3 px-4 py-3 transition hover:bg-background sm:px-5">{body}</Link>
                            : <div className="flex items-center gap-3 px-4 py-3 sm:px-5">{body}</div>}</li>;
                    })}
                </ul>}
        </section>
        <p className="mt-3 text-xs leading-5 text-text-secondary">აქ მხოლოდ რაოდენობები და ტოკენებია: კითხვები და პასუხები არ ინახება და ადმინ პანელში არ ჩანს.</p>
    </div>;
}
