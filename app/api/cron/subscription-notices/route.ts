import { timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { deliverSubscriptionReminders } from "@/lib/notifications/sync";
import { createPrismaClient } from "@/lib/prisma";
import { deliverNoticeChannels } from "@/lib/subscription/notices";

export const dynamic = "force-dynamic";

function cronSecret() {
    try {
        const value = (getCloudflareContext().env as unknown as Record<string, unknown>).CRON_SECRET;
        if (typeof value === "string" && value) return value;
    } catch { /* Local development. */ }
    return process.env.CRON_SECRET ?? "";
}

function authorized(request: Request) {
    const secret = cronSecret();
    const given = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (secret.length < 16 || given.length !== secret.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

// საათობრივი cron (worker.mjs): გეგმის შეხსენებები ყველა ბიზნესზე და ჯერ გაუგზავნელი მეილი/პუში.
// მომხმარებლისთვის მიუწვდომელია: მხოლოდ CRON_SECRET-ით.
export async function POST(request: Request) {
    if (!authorized(request)) return Response.json({ success: false }, { status: 401 });
    const prisma = createPrismaClient();
    try {
        await deliverSubscriptionReminders(prisma, null);
        let sent = 0;
        for (let batch = 0; batch < 5; batch++) {
            const count = await deliverNoticeChannels(prisma);
            sent += count;
            if (count < 200) break;
        }
        return Response.json({ success: true, sent });
    } catch (error) {
        console.error("Subscription notices failed", error instanceof Error ? error.name : "UnknownError");
        return Response.json({ success: false }, { status: 500 });
    } finally {
        await prisma.$disconnect();
    }
}
