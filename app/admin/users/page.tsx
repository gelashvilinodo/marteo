import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { ADMIN_PAGE_SIZE, getAdminUsers, parseAdminPage } from "@/lib/admin/lists";
import AdminPagination from "@/components/admin/AdminPagination";

const dateFormat = new Intl.DateTimeFormat("ka-GE", { timeZone: "Asia/Tbilisi", year: "numeric", month: "2-digit", day: "2-digit" });
const statusLabels: Record<string, string> = { ACTIVE: "აქტიური", PENDING_VERIFICATION: "დასადასტურებელი", SUSPENDED: "შეჩერებული" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const page = parseAdminPage((await searchParams).page);
    const { total, rows } = await getAdminUsers(page).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    return <>
        <h1 className="text-2xl font-semibold text-text-primary">მომხმარებლები</h1>
        <p className="mt-2 text-sm text-text-secondary">სულ {total.toLocaleString("ka-GE")} მომხმარებელი · ახლიდან ძველისკენ</p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border text-xs text-text-secondary">
                    <tr>{["სახელი", "ელფოსტა", "ტელეფონი", "სტატუსი", "დადასტურება", "ბიზნესები", "რეგისტრაცია"].map(h => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border text-text-primary">
                    {rows.map(row => <tr key={row.id}>
                        <td className="max-w-[200px] truncate px-4 py-3 font-medium">{[row.firstName, row.lastName].filter(Boolean).join(" ") || "—"}</td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-text-secondary" title={row.email}>{row.email}</td>
                        <td className="px-4 py-3 text-text-secondary">{row.phone}</td>
                        <td className="px-4 py-3">{statusLabels[row.status] ?? row.status}</td>
                        <td className="px-4 py-3 text-text-secondary">ელფოსტა {row.emailVerified ? "✓" : "✗"} · ტელ. {row.phoneVerified ? "✓" : "✗"}</td>
                        <td className="px-4 py-3">{row.businesses.toLocaleString("ka-GE")}</td>
                        <td className="px-4 py-3 text-text-secondary">{dateFormat.format(row.createdAt)}</td>
                    </tr>)}
                    {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-text-secondary">მომხმარებლები ვერ მოიძებნა.</td></tr>}
                </tbody>
            </table>
        </div>
        <AdminPagination basePath="/admin/users" page={page} pageSize={ADMIN_PAGE_SIZE} total={total} />
    </>;
}
