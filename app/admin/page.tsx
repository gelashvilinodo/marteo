import { notFound } from "next/navigation";
import { AdminAccessError, getAdminOverview } from "@/lib/admin/overview";
import { getGrowthStats, parseGrowthRange } from "@/lib/admin/growth";
import { getRevenueStats } from "@/lib/admin/revenue";
import { getRiskSignals } from "@/lib/admin/risk-signals";
import { listRetention } from "@/lib/admin/retention";
import { createPrismaClient } from "@/lib/prisma";
import AdminOverview from "@/components/admin/AdminOverview";

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const range = parseGrowthRange((await searchParams).range);
    const [data, growth, revenue, risk] = await Promise.all([getAdminOverview(), getGrowthStats(range), getRevenueStats(), getRiskSignals("")]).catch(error => {
        if (error instanceof AdminAccessError) notFound();
        throw error;
    });
    // წაშლის ვადა გასული ბიზნესები: ადმინმა ხელით უნდა წაშალოს (/admin/retention).
    const prisma = createPrismaClient();
    const retentionDue = (await listRetention(prisma).finally(() => prisma.$disconnect())).filter(row => row.due).length;
    return <AdminOverview data={data} growth={growth} revenue={revenue} riskTotal={risk.total} retentionDue={retentionDue} range={range} />;
}
