import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { countBusinessUnread } from "@/lib/support/support-chat";
import { supportFailure, supportJson, supportUnauthorized } from "@/lib/support/support-http";

export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    const membership = user ? await getCurrentBusiness() : null;
    if (!membership) return supportUnauthorized();
    const prisma = createPrismaClient();
    try {
        return supportJson({ success: true, unread: await countBusinessUnread(prisma, membership.businessId) });
    } catch (cause) {
        return supportFailure(cause);
    } finally { await prisma.$disconnect(); }
}
