import { getAdminUser } from "@/lib/admin/authorization";
import { createPrismaClient } from "@/lib/prisma";
import { listAdminConversations } from "@/lib/support/support-chat";
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
