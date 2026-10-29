import { getAdminUser } from "@/lib/admin/authorization";
import { createPrismaClient } from "@/lib/prisma";
import { ensureConversation, listAdminConversations } from "@/lib/support/support-chat";
import { guardMutation } from "@/lib/security/mutation-request";
import { supportFailure, supportForbidden, supportJson } from "@/lib/support/support-http";

export const dynamic = "force-dynamic";

export async function GET() {
    if (!await getAdminUser()) return supportForbidden();
    const prisma = createPrismaClient();
    try {
        return supportJson({ success: true, ...await listAdminConversations(prisma) });
    } catch (cause) {
        return supportFailure(cause);
    } finally { await prisma.$disconnect(); }
}

async function post(request: Request) {
    if (!await getAdminUser()) return supportForbidden();
    const prisma = createPrismaClient();
    try {
        const body = await request.json() as { businessId?: unknown };
        return supportJson({ success: true, conversationId: await ensureConversation(prisma, body.businessId) });
    } catch (cause) {
        return supportFailure(cause);
    } finally { await prisma.$disconnect(); }
}

export const POST = guardMutation(post, "json");
