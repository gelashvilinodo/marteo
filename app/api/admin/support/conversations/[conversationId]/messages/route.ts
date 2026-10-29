import { getAdminUser } from "@/lib/admin/authorization";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { getAdminThread, postAdminMessage, readSupportText } from "@/lib/support/support-chat";
import { supportFailure, supportForbidden, supportJson } from "@/lib/support/support-http";
import { runInBackground, sendPushToUsers } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ conversationId: string }> };

export async function GET(_request: Request, context: Context) {
    if (!await getAdminUser()) return supportForbidden();
    const { conversationId } = await context.params;
    const prisma = createPrismaClient();
    try {
        return supportJson({ success: true, thread: await getAdminThread(prisma, conversationId) });
    } catch (cause) {
        return supportFailure(cause);
    } finally { await prisma.$disconnect(); }
}

export async function POST(request: Request, context: Context) {
    return guardMutation(async guarded => {
        const admin = await getAdminUser();
        if (!admin) return supportForbidden();
        const { conversationId } = await context.params;
        const text = await guarded.json().then(readSupportText).catch(supportFailure);
        if (text instanceof Response) return text;
        const prisma = createPrismaClient();
        try {
            const thread = await postAdminMessage(prisma, conversationId, admin.id, text);
            // Business members who enabled notifications get the reply on their device.
            const members = await prisma.businessMembership.findMany({
                where: { business: { supportConversation: { id: conversationId } }, userId: { not: admin.id } },
                select: { userId: true },
            });
            const pushClient = createPrismaClient();
            await runInBackground(sendPushToUsers(pushClient, members.map(member => member.userId), {
                title: "MARTEO მხარდაჭერა",
                body: text.length > 160 ? `${text.slice(0, 157)}…` : text,
                url: "/dashboard/help",
                tag: "support-reply",
            }).finally(() => pushClient.$disconnect()));
            return supportJson({ success: true, thread }, 201);
        } catch (cause) {
            return supportFailure(cause);
        } finally { await prisma.$disconnect(); }
    }, "json")(request);
}
