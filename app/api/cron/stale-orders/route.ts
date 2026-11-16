import { deliverStaleOrderPushes } from "@/lib/orders/stale-order-push";
import { createPrismaClient } from "@/lib/prisma";
import { isCronRequest } from "@/lib/security/cron-auth";

export const dynamic = "force-dynamic";

// დღეში ერთხელ (worker.mjs): 7+ დღის დაუსრულებელი შეკვეთების პუში, თითო შეკვეთაზე ერთხელ.
// მომხმარებლისთვის მიუწვდომელია: მხოლოდ CRON_SECRET-ით.
export async function POST(request: Request) {
    if (!isCronRequest(request)) return Response.json({ success: false }, { status: 401 });
    const prisma = createPrismaClient();
    try {
        return Response.json({ success: true, sent: await deliverStaleOrderPushes(prisma) });
    } catch (error) {
        console.error("Stale order pushes failed", error instanceof Error ? error.name : "UnknownError");
        return Response.json({ success: false }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
