import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { ADMIN_PAGE_SIZE, getAdminPayments, parseAdminPage, parsePaymentFilters } from "@/lib/admin/lists";
import { PAID_PLANS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/admin/payment-period";
import { formatSupportCount, formatSupportDate } from "@/lib/support/support-config";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminFilters from "@/components/admin/AdminFilters";
import ExportButton from "@/components/admin/ExportButton";

export const metadata = { title: "გადახდები · ადმინ პანელი" };

const PERIOD_OPTIONS = [{ value: "7", label: "ბოლო 7 დღე" }, { value: "30", label: "ბოლო 30 დღე" }, { value: "90", label: "ბოლო 90 დღე" }, { value: "365", label: "ბოლო წელი" }];
const VOIDED_OPTIONS = [{ value: "include", label: "გაუქმებულებითაც" }, { value: "only", label: "მხოლოდ გაუქმებული" }];
const money = (value: number) => `${value.toLocaleString("ka-GE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₾`;

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams;
    const page = parseAdminPage(params.page);
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
