import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { ADMIN_PAGE_SIZE, getAdminBankAttempts, getAdminPayments, getBankAlerts, parseAdminPage, parseBankFilters, parsePaymentFilters } from "@/lib/admin/lists";
import { BANK_KIND_LABELS, bankBadge, bankStatusText } from "@/lib/admin/bank-labels";
import { PAID_PLANS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/admin/payment-period";
import { formatSupportCount, formatSupportDate } from "@/lib/support/support-config";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminFilters from "@/components/admin/AdminFilters";
import ExportButton from "@/components/admin/ExportButton";

export const metadata = { title: "გადახდები · ადმინ პანელი" };

const PERIOD_OPTIONS = [{ value: "7", label: "ბოლო 7 დღე" }, { value: "30", label: "ბოლო 30 დღე" }, { value: "90", label: "ბოლო 90 დღე" }, { value: "365", label: "ბოლო წელი" }];
const VOIDED_OPTIONS = [{ value: "include", label: "გაუქმებულებითაც" }, { value: "only", label: "მხოლოდ გაუქმებული" }];
const money = (value: number) => `${value.toLocaleString("ka-GE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₾`;

const BANK_STATUS_OPTIONS = [
    { value: "STUCK", label: "გაჭედილი (30 წთ+)" }, { value: "PENDING", label: "მოლოდინში" }, { value: "COMPLETED", label: "წარმატებული" },
    { value: "REJECTED", label: "უარყოფილი" }, { value: "REFUNDED", label: "დაბრუნებული" },
];
const BANK_KIND_OPTIONS = [{ value: "CHECKOUT", label: "გადახდა ბარათით" }, { value: "RENEWAL", label: "ავტოგანახლება" }];

type SearchParams = Record<string, string | string[] | undefined>;

function Tabs({ view, alerts }: { view: "recorded" | "bank"; alerts: { stuck: number; failedRenewals: number } }) {
    const problems = alerts.stuck + alerts.failedRenewals;
    const tab = (active: boolean) => `flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition ${active ? "bg-accent text-white" : "text-text-secondary hover:bg-surface"}`;
    return <div className="mt-4 flex flex-col gap-3">
        <nav aria-label="გადახდების ხედი" className="flex gap-1 rounded-2xl border border-border bg-background p-1 sm:self-start">
            <Link href="/admin/payments" prefetch={false} aria-current={view === "recorded" ? "page" : undefined} className={tab(view === "recorded")}>აღრიცხული</Link>
            <Link href="/admin/payments?view=bank" prefetch={false} aria-current={view === "bank" ? "page" : undefined} className={tab(view === "bank")}>
                ბარათის მცდელობები
                {problems > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">{problems}</span>}
            </Link>
        </nav>
        {problems > 0 && <div className="flex flex-wrap gap-2 text-sm">
            {alerts.stuck > 0 && <Link href="/admin/payments?view=bank&status=STUCK" prefetch={false} className="rounded-xl bg-amber-500/12 px-3 py-2 text-amber-700 dark:text-amber-400">
                {alerts.stuck} გადახდას ბანკი 30 წუთზე მეტია არ პასუხობს
            </Link>}
            {alerts.failedRenewals > 0 && <Link href="/admin/payments?view=bank&status=REJECTED&kind=RENEWAL&period=7" prefetch={false} className="rounded-xl bg-danger/10 px-3 py-2 text-danger">
                {alerts.failedRenewals} ავტოგანახლება ჩავარდა ბოლო 7 დღეში
            </Link>}
        </div>}
    </div>;
}

async function BankView({ params, page }: { params: SearchParams; page: number }) {
    const filters = parseBankFilters(params);
    const { total, rows, now } = await getAdminBankAttempts(page, filters);
    return <>
        <AdminFilters placeholder="ბიზნესი ან ბარათის ციფრები" values={{ ...filters, view: "bank" }} selects={[
            { name: "status", label: "ყველა სტატუსი", options: BANK_STATUS_OPTIONS },
            { name: "kind", label: "ყველა ტიპი", options: BANK_KIND_OPTIONS },
            { name: "period", label: "ნებისმიერ დროს", options: PERIOD_OPTIONS },
        ]} />
        <p className="mt-3 text-sm text-text-secondary">{formatSupportCount(total)} მცდელობა · ახლიდან ძველისკენ. დაბრუნება და ბანკთან შემოწმება ბიზნესის გვერდზეა.</p>
        {rows.length === 0 && <p className="mt-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-text-secondary">
            ბარათით გადახდის მცდელობა ვერ მოიძებნა.
        </p>}
        {rows.length > 0 && <ul className="mt-3 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {rows.map(row => {
                const badge = bankBadge({ status: row.status, refundedAt: row.refundedAt?.toISOString() ?? null, bankStatus: row.bankStatus, createdAt: row.createdAt.toISOString() }, now);
                const raw = bankStatusText(row.bankStatus);
                const body = <>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-primary">{row.businessName ?? "წაშლილი ბიზნესი"}</p>
                        <p className="mt-0.5 truncate text-xs text-text-secondary">
                            {formatSupportDate(row.createdAt.toISOString())} · {BANK_KIND_LABELS[row.kind] ?? row.kind} · {row.plan}{row.cardMask ? ` · ${row.cardMask}` : ""}{raw ? ` · ${raw}` : ""}
                        </p>
                    </div>
                    <div className="shrink-0 text-right">
                        <p className={`text-sm font-semibold ${row.refundedAt ? "text-text-secondary line-through" : "text-text-primary"}`}>{money(row.amount)}</p>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${badge.tone}`}>{badge.label}</span>
                    </div>
                </>;
                return <li key={row.id}>{row.businessId
                    ? <Link href={`/admin/businesses/${row.businessId}`} prefetch={false} className="flex items-center gap-3 px-4 py-3 transition hover:bg-background">{body}</Link>
                    : <div className="flex items-center gap-3 px-4 py-3">{body}</div>}</li>;
            })}
        </ul>}
        <AdminPagination basePath="/admin/payments" page={page} pageSize={ADMIN_PAGE_SIZE} total={total} query={{ ...filters, view: "bank" }} />
    </>;
}

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const page = parseAdminPage(params.page);
    const view = params.view === "bank" ? "bank" : "recorded";
    const alerts = await getBankAlerts().catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    if (view === "bank") return <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold text-text-primary">გადახდები</h1>
        <Tabs view="bank" alerts={alerts} />
        <BankView params={params} page={page} />
    </div>;
    const filters = parsePaymentFilters(params);
    const { total, amount, rows } = await getAdminPayments(page, filters).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });

    return <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h1 className="text-2xl font-semibold text-text-primary">გადახდები</h1>
                <p className="mt-1 text-sm text-text-secondary">{formatSupportCount(total)} გადახდა · სულ <b className="font-semibold text-text-primary">{money(amount)}</b> · ახლიდან ძველისკენ</p>
            </div>
            {total > 0 && <ExportButton kind="payments" filename="marteo-payments" />}
        </div>
        <Tabs view="recorded" alerts={alerts} />

        <AdminFilters placeholder="ბიზნესი ან შენიშვნა" values={filters} selects={[
            { name: "plan", label: "ყველა პაკეტი", options: PAID_PLANS.map(plan => ({ value: plan, label: plan })) },
            { name: "method", label: "ყველა მეთოდი", options: PAYMENT_METHODS.map(method => ({ value: method, label: PAYMENT_METHOD_LABELS[method] })) },
            { name: "period", label: "ნებისმიერ დროს", options: PERIOD_OPTIONS },
            { name: "voided", label: "აქტიური გადახდები", options: VOIDED_OPTIONS },
        ]} />

        {rows.length === 0 && <p className="mt-4 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-text-secondary">
            გადახდები ვერ მოიძებნა. გადახდა ბიზნესის გვერდიდან ემატება.
        </p>}

        {rows.length > 0 && <ul className="mt-4 flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {rows.map(row => {
                const body = <>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-primary">{row.businessName}{row.businessId ? "" : " (წაშლილი)"}</p>
                        <p className="mt-0.5 truncate text-xs text-text-secondary">
                            {formatSupportDate(row.paidAt.toISOString())} · {row.plan} · {row.months} თვე · {PAYMENT_METHOD_LABELS[row.method] ?? row.method} · {formatSupportDate(row.periodEnd.toISOString())}-მდე
                        </p>
                        {row.note && <p className="truncate text-xs text-text-secondary">{row.note}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                        <p className={`text-sm font-semibold ${row.voidedAt ? "text-text-secondary line-through" : "text-text-primary"}`}>{money(row.amount)}</p>
                        {row.voidedAt && <p className="text-[11px] text-danger">გაუქმებული</p>}
                    </div>
                </>;
                return <li key={row.id}>{row.businessId
                    ? <Link href={`/admin/businesses/${row.businessId}`} prefetch={false} className="flex items-center gap-3 px-4 py-3 transition hover:bg-background">{body}</Link>
                    : <div className="flex items-center gap-3 px-4 py-3">{body}</div>}</li>;
            })}
        </ul>}
        <AdminPagination basePath="/admin/payments" page={page} pageSize={ADMIN_PAGE_SIZE} total={total} query={filters} />
    </div>;
}
