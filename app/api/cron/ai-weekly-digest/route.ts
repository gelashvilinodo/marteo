import { deliverWeeklyDigests } from "@/lib/ai/weekly-digest-job";
import { createPrismaClient } from "@/lib/prisma";
import { isCronRequest } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";

// ორშაბათს დილით (worker.mjs): AI-ის კვირის მიმოხილვა ყველა მფლობელს, ჩათში და პუშით.
// მომხმარებლისთვის მიუწვდომელია: მხოლოდ CRON_SECRET-ით.
export async function POST(request: Request) {
    if (!isCronRequest(request)) return Response.json({ success: false }, { status: 401 });
    const prisma = createPrismaClient();
    try {
        return Response.json({ success: true, sent: await deliverWeeklyDigests(prisma) });
    } catch (error) {
        console.error("AI weekly digests failed", error instanceof Error ? error.name : "UnknownError");
        return Response.json({ success: false }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
