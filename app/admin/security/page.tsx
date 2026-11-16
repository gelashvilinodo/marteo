import { notFound } from "next/navigation";
import { getAdminDevice, getAdminUser } from "@/lib/admin/authorization";
import { getTwoFactorState, listDevices } from "@/lib/admin/two-factor";
import { getAuditLog } from "@/lib/admin/actions";
import AdminSecurityPanel from "@/components/admin/AdminSecurityPanel";
import AuditHistory from "@/components/admin/AuditHistory";
import { Panel } from "@/components/admin/AdminDetail";
import { createPrismaClient } from "@/lib/prisma";

export const metadata = { title: "უსაფრთხოება · ადმინ პანელი" };

export default async function AdminSecurityPage() {
    const admin = await getAdminUser();
    if (!admin) notFound();
    const device = await getAdminDevice(admin.id);
    const prisma = createPrismaClient();
    const [devices, state, history] = await Promise.all([
        listDevices(prisma, admin.id, device?.id ?? null), getTwoFactorState(prisma, admin.id), getAuditLog(prisma, "USER", admin.id),
    ]).finally(() => prisma.$disconnect());

    return <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold text-text-primary">უსაფრთხოება</h1>
        <p className="mt-1 text-sm text-text-secondary">ადმინ პანელი ორეტაპიანი შესვლით არის დაცული: ახალ მოწყობილობაზე პაროლის შემდეგ კოდის აპის კოდიც საჭიროა. ბიზნესის წაშლა და თანხის დაბრუნება ყოველთვის კოდს ითხოვს.</p>
        <div className="mt-5"><AdminSecurityPanel initialDevices={devices} backupLeft={state.backupLeft} /></div>
        <div className="mt-4">
            <Panel title="ბოლო მოქმედებები"><AuditHistory entries={history.filter(entry => entry.action.startsWith("admin-")).slice(0, 20)} /></Panel>
        </div>
    </div>;
}
