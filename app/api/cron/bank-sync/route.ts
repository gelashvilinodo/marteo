import { createPrismaClient } from "@/lib/prisma";
import { isCronRequest } from "@/lib/security/cron-auth";
import { syncPendingBankPayments } from "@/lib/subscription/bank";

export const dynamic = "force-dynamic";

// 5-წუთიანი cron (worker.mjs): ბანკის პასუხგაუცემელი გადახდების გადამოწმება, რომ დაკარგული callback-ის გამო
// გეგმის ჩართვა საათობრივ cron-ს არ დაელოდოს. მხოლოდ CRON_SECRET-ით.
export async function POST(request: Request) {
    if (!isCronRequest(request)) return Response.json({ success: false }, { status: 401 });
    const prisma = createPrismaClient();
    try {
        const synced = await syncPendingBankPayments(prisma);
        return Response.json({ success: true, synced });
    } catch (error) {
        console.error("Bank sync failed", error instanceof Error ? error.name : "UnknownError");
        return Response.json({ success: false }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
