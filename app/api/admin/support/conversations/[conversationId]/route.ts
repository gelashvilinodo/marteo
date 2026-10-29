import { getAdminUser } from "@/lib/admin/authorization";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { setConversationStatus } from "@/lib/support/support-chat";
import { supportFailure, supportForbidden, supportJson } from "@/lib/support/support-http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ conversationId: string }> };

export async function PATCH(request: Request, context: Context) {
    return guardMutation(async guarded => {
        if (!await getAdminUser()) return supportForbidden();
        const { conversationId } = await context.params;
        const prisma = createPrismaClient();
        try {
            const body = await guarded.json() as { status?: unknown };
            return supportJson({ success: true, status: await setConversationStatus(prisma, conversationId, body.status) });
        } catch (cause) {
            return supportFailure(cause);
        } finally { await prisma.$disconnect(); }
    }, "json")(request);
}
