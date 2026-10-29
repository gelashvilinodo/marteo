import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { ADMIN_PAGE_SIZE, getAdminBusinesses, parseAdminPage } from "@/lib/admin/lists";
import { BUSINESS_MODES } from "@/lib/business/business-mode";
import AdminPagination from "@/components/admin/AdminPagination";

const dateFormat = new Intl.DateTimeFormat("ka-GE", { timeZone: "Asia/Tbilisi", year: "numeric", month: "2-digit", day: "2-digit" });

export default async function AdminBusinessesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const page = parseAdminPage((await searchParams).page);
    const { total, rows } = await getAdminBusinesses(page).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    return <>
        <h1 className="text-2xl font-semibold text-text-primary">ბიზნესები</h1>
        <p className="mt-2 text-sm text-text-secondary">სულ {total.toLocaleString("ka-GE")} ბიზნესი · ახლიდან ძველისკენ</p>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border text-xs text-text-secondary">
                    <tr>{["სახელი", "ტიპი", "მფლობელი", "წევრები", "შეკვეთები", "პაკეტი", "შექმნილია"].map(h => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-border text-text-primary">
                    {rows.map(row => <tr key={row.id}>
                        <td className="max-w-[220px] truncate px-4 py-3 font-medium" title={row.name}>{row.name}</td>
                        <td className="px-4 py-3">{BUSINESS_MODES.find(mode => mode.value === row.mode)?.label ?? row.mode}</td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-text-secondary" title={row.ownerEmail ?? undefined}>{row.ownerEmail ?? "—"}</td>
                        <td className="px-4 py-3">{row.members.toLocaleString("ka-GE")}</td>
                        <td className="px-4 py-3">{row.orders.toLocaleString("ka-GE")}</td>
                        <td className="px-4 py-3">{row.plan ? `${row.plan} · ${row.subscriptionStatus}` : "—"}</td>
                        <td className="px-4 py-3 text-text-secondary">{dateFormat.format(row.createdAt)}</td>
                    </tr>)}
                    {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-text-secondary">ბიზნესები ვერ მოიძებნა.</td></tr>}
                </tbody>
            </table>
        </div>
        <AdminPagination basePath="/admin/businesses" page={page} pageSize={ADMIN_PAGE_SIZE} total={total} />
    </>;
}
