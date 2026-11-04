import Link from "next/link";
import { Icon } from "@iconify/react";
import type { RevenueStats } from "@/lib/admin/revenue";
import { formatSupportCount, formatSupportDate } from "@/lib/support/support-config";
import { Card } from "./GrowthSection";

const MONTHS = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];
const monthLabel = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];
const money = (value: number, digits = 0) => `${value.toLocaleString("ka-GE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ₾`;

function Tile({ label, value, note, icon, tone }: { label: string; value: string; note?: string; icon: string; tone: string }) {
    return <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon icon={icon} className="h-5 w-5" aria-hidden="true" /></span>
        <p className="mt-4 text-2xl font-semibold text-text-primary sm:text-3xl">{value}</p>
        <h3 className="mt-1 text-xs text-text-secondary sm:text-sm">{label}</h3>
        {note && <p className="mt-0.5 text-[11px] text-text-secondary">{note}</p>}
    </div>;
}

export default function RevenueSection({ stats }: { stats: RevenueStats }) {
    const thisMonth = stats.months.at(-1)!;
    const lastMonth = stats.months.at(-2)!;
    const max = Math.max(1, ...stats.months.map(row => row.amount));
    const yearTotal = stats.months.reduce((sum, row) => sum + row.amount, 0);
    const churnBase = stats.paying + stats.lapsedCount;

    return <div className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-text-primary">შემოსავალი</h2>
            <Link href="/admin/payments" prefetch={false} className="flex items-center gap-1 text-sm text-accent hover:underline">ყველა გადახდა <Icon icon="solar:alt-arrow-right-linear" className="h-4 w-4" aria-hidden="true" /></Link>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Tile label="თვიური შემოსავალი (MRR)" value={money(stats.mrr)} note={stats.paying ? `საშუალოდ ${money(stats.mrr / stats.paying)} ერთ ბიზნესზე` : undefined}
                icon="solar:graph-new-up-bold-duotone" tone="bg-success/12 text-success" />
            <Tile label="ფასიანი ბიზნესი ახლა" value={formatSupportCount(stats.paying)} icon="solar:crown-bold-duotone" tone="bg-accent/12 text-accent" />
            <Tile label="ამ თვეში შემოსული" value={money(thisMonth.amount)} note={`გასულ თვეში ${money(lastMonth.amount)}`}
                icon="solar:wallet-money-bold-duotone" tone="bg-violet-500/12 text-violet-500" />
            <Tile label="სულ შემოსული" value={money(stats.total)} icon="solar:safe-square-bold-duotone" tone="bg-amber-500/12 text-amber-500" />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card title="შემოსავალი თვეების მიხედვით">
                <figure className="m-0">
                    <figcaption className="text-sm text-text-secondary">ბოლო 12 თვე: <b className="font-semibold text-text-primary">{money(yearTotal)}</b></figcaption>
                    <div className="mt-4 flex h-40 items-end gap-1.5" aria-hidden="true">
                        {stats.months.map(row => <div key={row.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${monthLabel(row.month)}: ${money(row.amount, 2)} · ${row.payments} გადახდა`}>
                            {row.amount > 0 && <span className="text-[9px] text-text-secondary">{Math.round(row.amount)}</span>}
                            <span className={`block w-full rounded-t-[4px] ${row.amount ? "bg-success" : "bg-border/60"}`} style={{ height: row.amount ? `max(${(row.amount / max) * 85}%, 3px)` : 2 }} />
                        </div>)}
                    </div>
                    <div className="mt-1.5 flex gap-1.5 text-[10px] text-text-secondary" aria-hidden="true">
                        {stats.months.map(row => <span key={row.month} className="min-w-0 flex-1 text-center">{monthLabel(row.month)}</span>)}
                    </div>
                    <table className="sr-only">
                        <caption>შემოსავალი თვეების მიხედვით</caption>
                        <thead><tr><th scope="col">თვე</th><th scope="col">თანხა</th><th scope="col">გადახდები</th></tr></thead>
                        <tbody>{stats.months.map(row => <tr key={row.month}><td>{row.month}</td><td>{money(row.amount, 2)}</td><td>{row.payments}</td></tr>)}</tbody>
                    </table>
                </figure>
            </Card>

            <Card title="შეწყვიტეს გადახდა, ბოლო 30 დღე" action={churnBase > 0 ? <span className="text-xs text-text-secondary">{Math.round((stats.lapsedCount / churnBase) * 100)}% churn</span> : undefined}>
                {stats.lapsed.length === 0
                    ? <p className="flex items-center gap-2 text-sm text-text-secondary"><Icon icon="solar:check-circle-linear" className="h-5 w-5 text-success" aria-hidden="true" />ბოლო 30 დღეში ფასიანი პაკეტი არავის შეუწყვეტია.</p>
                    : <ul className="-mx-2 flex flex-col">
                        {stats.lapsed.map(row => {
                            const content = <>
                                <Icon icon="solar:user-cross-rounded-linear" className="h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-text-primary">{row.name}</span>
                                    <span className="block truncate text-xs text-text-secondary">{row.plan} · დასრულდა {formatSupportDate(row.endedAt.toISOString())}{row.id ? "" : " · ბიზნესი წაიშალა"}</span>
                                </span>
                            </>;
                            return <li key={`${row.id}:${row.endedAt.toISOString()}`}>{row.id
                                ? <Link href={`/admin/businesses/${row.id}`} prefetch={false} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-background">{content}<Icon icon="solar:alt-arrow-right-linear" className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" /></Link>
                                : <div className="flex items-center gap-3 px-2 py-2">{content}</div>}</li>;
                        })}
                    </ul>}
                {stats.lapsedCount > stats.lapsed.length && <p className="mt-2 text-xs text-text-secondary">და კიდევ {stats.lapsedCount - stats.lapsed.length}.</p>}
            </Card>
        </div>
        <p className="mt-3 text-xs leading-5 text-text-secondary">მხოლოდ ადმინ პანელში აღრიცხული გადახდები; გაუქმებული არ ითვლება. MRR ყოველ გადახდას მის თვეებზე თანაბრად ანაწილებს.</p>
    </div>;
}
