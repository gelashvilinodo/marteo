import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { reserveLimits } from "@/lib/security/rate-limit";
import { getBusinessThread, postBusinessMessage, readSupportText } from "@/lib/support/support-chat";
import { supportFailure, supportJson, supportUnauthorized } from "@/lib/support/support-http";
import { runInBackground, sendPushToUsers } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";

async function currentMember() {
    const user = await getCurrentUser();
    const membership = user ? await getCurrentBusiness() : null;
    return user && membership ? { user, businessId: membership.businessId } : null;
}

export async function GET() {
    const member = await currentMember();
    if (!member) return supportUnauthorized();
    const prisma = createPrismaClient();
    try {
        return supportJson({ success: true, thread: await getBusinessThread(prisma, member.businessId) });
    } catch (cause) {
        return supportFailure(cause);
    } finally { await prisma.$disconnect(); }
}

async function post(request: Request) {
    const member = await currentMember();
    if (!member) return supportUnauthorized();
    const text = await request.json().then(readSupportText).catch(supportFailure);
    if (text instanceof Response) return text;
    const prisma = createPrismaClient();
    try {
        await reserveLimits(prisma, [{ scope: "support-message", identity: member.user.id, maximum: 20, seconds: 60 }]);
        const result = await postBusinessMessage(prisma, member.businessId, member.user.id, text);
        const admin = await prisma.user.findFirst({ where: { isPlatformAdmin: true, status: "ACTIVE" }, select: { id: true } });
        // The admin's own business chat must not notify the admin.
        if (admin && admin.id !== member.user.id) {
            const pushClient = createPrismaClient();
            await runInBackground(sendPushToUsers(pushClient, [admin.id], {
                title: result.businessName,
                body: text.length > 160 ? `${text.slice(0, 157)}…` : text,
                url: `/admin/support/${result.conversationId}`,
                tag: `support-${result.conversationId}`,
            }).finally(() => pushClient.$disconnect()));
        }
        return supportJson({ success: true, thread: result.thread }, 201);
    } catch (cause) {
        return supportFailure(cause);
    } finally { await prisma.$disconnect(); }
}

export const POST = guardMutation(post, "json");
