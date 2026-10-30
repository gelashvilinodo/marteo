import Link from "next/link";
import { Icon } from "@iconify/react";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { ADMIN_PAGE_SIZE, getAdminBusinesses, parseAdminPage, parseBusinessFilters } from "@/lib/admin/lists";
import { BUSINESS_MODES } from "@/lib/business/business-mode";
import { formatSupportCount, formatSupportDate } from "@/lib/support/support-config";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminFilters from "@/components/admin/AdminFilters";
import ExportButton from "@/components/admin/ExportButton";

const PLAN_OPTIONS = [
    { value: "FREE", label: "FREE" }, { value: "START", label: "START" },
    { value: "BUSINESS", label: "BUSINESS" }, { value: "PRO", label: "PRO" }, { value: "NONE", label: "პაკეტის გარეშე" },
];
const PERIOD_OPTIONS = [{ value: "7", label: "ბოლო 7 დღე" }, { value: "30", label: "ბოლო 30 დღე" }, { value: "90", label: "ბოლო 90 დღე" }];

export default async function AdminBusinessesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams;
    const page = parseAdminPage(params.page);
    const filters = parseBusinessFilters(params);
    const { total, rows } = await getAdminBusinesses(page, filters).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    const filtered = Object.values(filters).some(Boolean);
    const modeLabel = (mode: string) => BUSINESS_MODES.find(item => item.value === mode)?.label ?? mode;

    return <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h1 className="text-2xl font-semibold text-text-primary">ბიზნესები</h1>
                <p className="mt-1 text-sm text-text-secondary">{filtered ? "ნაპოვნია" : "სულ"} {formatSupportCount(total)} ბიზნესი · ახლიდან ძველისკენ</p>
            </div>
            {total > 0 && <ExportButton kind="businesses" filename="marteo-businesses" />}
        </div>

        <AdminFilters placeholder="სახელი, მეილი ან ტელეფონი (ბიზნესის ან წევრის)" values={filters} selects={[
            { name: "mode", label: "ყველა ტიპი", options: BUSINESS_MODES.map(mode => ({ value: mode.value, label: mode.label })) },
            { name: "plan", label: "ყველა პაკეტი", options: PLAN_OPTIONS },
            { name: "period", label: "ნებისმიერ დროს", options: PERIOD_OPTIONS },
        ]} />

        {rows.length === 0 && <p className="mt-4 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-text-secondary">ბიზნესები ვერ მოიძებნა.</p>}

        <ul className="mt-4 flex flex-col gap-2 md:hidden">
            {rows.map(row => <li key={row.id}>
                <Link href={`/admin/businesses/${row.id}`} prefetch={false} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition active:bg-background">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-primary">{row.name}</p>
                        <p className="mt-0.5 truncate text-xs text-text-secondary">{row.ownerEmail ?? "მფლობელი არ ჰყავს"}</p>
                        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-secondary">
                            <span>{modeLabel(row.mode)}</span>
                            <span>{row.plan ?? "პაკეტის გარეშე"}</span>
                            <span>{formatSupportCount(row.orders)} შეკვეთა</span>
                            <span>{formatSupportDate(row.createdAt.toISOString())}</span>
                        </p>
                    </div>
                    <Icon icon="solar:alt-arrow-right-linear" className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
                </Link>
            </li>)}
        </ul>

        {rows.length > 0 && <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
            <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-border text-xs text-text-secondary">
                    <tr>{["სახელი", "ტიპი", "მფლობელი", "წევრები", "შეკვეთები", "პაკეტი", "შექმნილია"].map(h => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border text-text-primary">
                    {rows.map(row => <tr key={row.id} className="transition hover:bg-background">
                        <td className="max-w-[220px] px-4 py-3 font-medium">
                            <Link href={`/admin/businesses/${row.id}`} prefetch={false} className="block truncate hover:text-accent" title={row.name}>{row.name}</Link>
                        </td>
                        <td className="px-4 py-3">{modeLabel(row.mode)}</td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-text-secondary" title={row.ownerEmail ?? undefined}>{row.ownerEmail ?? "-"}</td>
                        <td className="px-4 py-3">{formatSupportCount(row.members)}</td>
                        <td className="px-4 py-3">{formatSupportCount(row.orders)}</td>
                        <td className="px-4 py-3">{row.plan ? `${row.plan} · ${row.subscriptionStatus}` : "-"}</td>
                        <td className="px-4 py-3 text-text-secondary">{formatSupportDate(row.createdAt.toISOString())}</td>
                    </tr>)}
                </tbody>
            </table>
        </div>}
        <AdminPagination basePath="/admin/businesses" page={page} pageSize={ADMIN_PAGE_SIZE} total={total} query={filters} />
    </div>;
}
