import { notFound } from "next/navigation";
import { AdminAccessError } from "@/lib/admin/overview";
import { parseAdminPage } from "@/lib/admin/lists";
import { AUDIT_GROUPS, AUDIT_PAGE_SIZE, getAuditLogPage, type AuditGroup } from "@/lib/admin/system";
import { formatSupportCount } from "@/lib/support/support-config";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminFilters from "@/components/admin/AdminFilters";
import AuditHistory, { type AuditTarget } from "@/components/admin/AuditHistory";
import { BackLink } from "@/components/admin/AdminDetail";

export const metadata = { title: "ქმედებების ისტორია · ადმინ პანელი" };

const PERIODS = ["7", "30", "90"] as const;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = await searchParams;
    const page = parseAdminPage(params.page);
    const group = (Object.keys(AUDIT_GROUPS) as AuditGroup[]).find(key => key === one(params.group)) ?? "";
    const period = PERIODS.find(value => value === one(params.period)) ?? "";
    const { total, rows } = await getAuditLogPage(page, { group, period }).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    const targets: Record<string, AuditTarget> = {};
    for (const row of rows) {
        if (row.targetType === "BUSINESS") targets[row.id] = { label: row.targetName ?? "წაშლილი ბიზნესი", href: row.targetName ? `/admin/businesses/${row.targetId}` : null };
        if (row.targetType === "USER") targets[row.id] = { label: row.targetName ?? "წაშლილი მომხმარებელი", href: row.targetName ? `/admin/users/${row.targetId}` : null };
    }

    return <div className="mx-auto max-w-4xl">
        <BackLink href="/admin/system" label="სისტემა" />
        <h1 className="mt-3 text-2xl font-semibold text-text-primary">ადმინის ქმედებების ისტორია</h1>
        <p className="mt-1 text-sm text-text-secondary">{group || period ? "ნაპოვნია" : "სულ"} {formatSupportCount(total)} ჩანაწერი · ახლიდან ძველისკენ</p>

        <AdminFilters search={false} placeholder="" values={{ group, period }} selects={[
            { name: "group", label: "ყველა ქმედება", options: (Object.keys(AUDIT_GROUPS) as AuditGroup[]).map(key => ({ value: key, label: AUDIT_GROUPS[key].label })) },
            { name: "period", label: "ნებისმიერ დროს", options: PERIODS.map(value => ({ value, label: `ბოლო ${value} დღე` })) },
        ]} />

        <section className="mt-4 rounded-2xl border border-border bg-surface px-4 py-2 sm:px-5">
            <AuditHistory targets={targets} entries={rows.map(row => ({
                id: row.id, action: row.action, createdAt: row.createdAt.toISOString(), adminName: row.adminName, before: row.before, after: row.after,
            }))} />
        </section>
        <AdminPagination basePath="/admin/audit" page={page} pageSize={AUDIT_PAGE_SIZE} total={total} query={{ group, period }} />
    </div>;
}
