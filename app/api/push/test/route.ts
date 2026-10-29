import { getCurrentUser } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { reserveLimits } from "@/lib/security/rate-limit";
import { sendPushToUsers } from "@/lib/push/web-push";
import { supportFailure, supportJson, supportUnauthorized } from "@/lib/support/support-http";

export const dynamic = "force-dynamic";

// Sends a test notification to the signed-in person's own devices and reports
// what the push services answered, so a broken setup is visible at once.
async function post() {
    const user = await getCurrentUser();
    if (!user) return supportUnauthorized();
    const prisma = createPrismaClient();
    try {
        await reserveLimits(prisma, [{ scope: "push-test", identity: user.id, maximum: 5, seconds: 60 }]);
        const delivery = await sendPushToUsers(prisma, [user.id], {
            title: "MARTEO",
            body: "სატესტო შეტყობინება: შეტყობინებები მუშაობს ✓",
            url: "/dashboard",
            tag: "push-test",
        });
        return supportJson({ success: true, delivery });
    } catch (cause) {
        return supportFailure(cause);
    } finally { await prisma.$disconnect(); }
}

export const POST = guardMutation(post, "empty");
