import Link from "next/link";
import { Icon } from "@iconify/react";
import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { ADMIN_PAGE_SIZE, getAdminUsers, parseAdminPage, parseUserFilters } from "@/lib/admin/lists";
import { formatSupportCount, formatSupportDate } from "@/lib/support/support-config";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminFilters from "@/components/admin/AdminFilters";
import { USER_STATUS_LABELS, UserStatusBadge } from "@/components/admin/AdminBadges";

const PERIOD_OPTIONS = [{ value: "7", label: "ბოლო 7 დღე" }, { value: "30", label: "ბოლო 30 დღე" }, { value: "90", label: "ბოლო 90 დღე" }];

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams;
    const page = parseAdminPage(params.page);
    const filters = parseUserFilters(params);
    const { total, rows } = await getAdminUsers(page, filters).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    const filtered = Object.values(filters).some(Boolean);
    const name = (row: { firstName: string | null; lastName: string | null }) => [row.firstName, row.lastName].filter(Boolean).join(" ") || "უსახელო";
    const verified = (ok: boolean) => <Icon icon={ok ? "solar:check-circle-bold" : "solar:close-circle-bold"} className={`h-4 w-4 ${ok ? "text-success" : "text-danger"}`} aria-label={ok ? "დადასტურებულია" : "არ არის დადასტურებული"} />;

    return <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold text-text-primary">მომხმარებლები</h1>
        <p className="mt-1 text-sm text-text-secondary">{filtered ? "ნაპოვნია" : "სულ"} {formatSupportCount(total)} მომხმარებელი · ახლიდან ძველისკენ</p>

        <AdminFilters placeholder="სახელი, მეილი, ტელეფონი ან ბიზნესი" values={filters} selects={[
            { name: "status", label: "ყველა სტატუსი", options: Object.entries(USER_STATUS_LABELS).map(([value, label]) => ({ value, label })) },
            { name: "verification", label: "დადასტურება", options: [{ value: "unverified", label: "დაუდასტურებელი" }, { value: "verified", label: "სრულად დადასტურებული" }] },
            { name: "business", label: "ბიზნესი", options: [{ value: "with", label: "ბიზნესით" }, { value: "without", label: "ბიზნესის გარეშე" }] },
            { name: "period", label: "ნებისმიერ დროს", options: PERIOD_OPTIONS },
        ]} />

        {rows.length === 0 && <p className="mt-4 rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-text-secondary">მომხმარებლები ვერ მოიძებნა.</p>}

        <ul className="mt-4 flex flex-col gap-2 md:hidden">
            {rows.map(row => <li key={row.id}>
                <Link href={`/admin/users/${row.id}`} prefetch={false} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition active:bg-background">
                    <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-text-primary">{name(row)}</span><UserStatusBadge status={row.status} /></p>
                        <p className="mt-0.5 truncate text-xs text-text-secondary">{row.email}</p>
                        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                            <span>{row.phone}</span>
                            <span className="flex items-center gap-1">მეილი {verified(row.emailVerified)}</span>
                            <span className="flex items-center gap-1">ტელ. {verified(row.phoneVerified)}</span>
                            <span>{formatSupportDate(row.createdAt.toISOString())}</span>
                        </p>
                    </div>
                    <Icon icon="solar:alt-arrow-right-linear" className="h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
                </Link>
            </li>)}
        </ul>

        {rows.length > 0 && <div className="mt-4 hidden overflow-hidden rounded-2xl border border-border bg-surface md:block">
            <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs text-text-secondary">
                    <tr>{["სახელი", "ელფოსტა", "ტელეფონი", "სტატუსი", "მეილი", "ტელ.", "ბიზნესები", "რეგისტრაცია"].map(h => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border text-text-primary">
                    {rows.map(row => <tr key={row.id} className="transition hover:bg-background">
                        <td className="max-w-[200px] px-4 py-3 font-medium">
                            <Link href={`/admin/users/${row.id}`} prefetch={false} className="block truncate hover:text-accent">{name(row)}</Link>
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-text-secondary" title={row.email}>{row.email}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{row.phone}</td>
                        <td className="px-4 py-3"><UserStatusBadge status={row.status} /></td>
                        <td className="px-4 py-3">{verified(row.emailVerified)}</td>
                        <td className="px-4 py-3">{verified(row.phoneVerified)}</td>
                        <td className="px-4 py-3">{formatSupportCount(row.businesses)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{formatSupportDate(row.createdAt.toISOString())}</td>
                    </tr>)}
                </tbody>
            </table>
        </div>}
        <AdminPagination basePath="/admin/users" page={page} pageSize={ADMIN_PAGE_SIZE} total={total} query={filters} />
    </div>;
}
