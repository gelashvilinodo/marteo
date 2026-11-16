import { deliverAdminAlerts } from "@/lib/admin/admin-alerts";
import { createPrismaClient } from "@/lib/prisma";
import { isCronRequest } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";

// საათში ერთხელ (worker.mjs): ახალი შეცდომები, ჩავარდნილი სამუშაოები და გაჭედილი გადახდები ადმინს ერთი push-ით.
// მომხმარებლისთვის მიუწვდომელია: მხოლოდ CRON_SECRET-ით.
export async function POST(request: Request) {
    if (!isCronRequest(request)) return Response.json({ success: false }, { status: 401 });
    const prisma = createPrismaClient();
    try {
        const { summary, pushed } = await deliverAdminAlerts(prisma);
        const sent = summary.newErrors.length + summary.failedJobs.length + summary.stuckPayments;
        return Response.json({ success: true, sent, pushed, summary });
    } catch (error) {
        console.error("Admin alerts failed", error instanceof Error ? error.name : "UnknownError");
        return Response.json({ success: false }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
