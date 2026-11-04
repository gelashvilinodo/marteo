import { apiAccessDenied } from "@/lib/business/access";
import { getCurrentUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { reserveLimits } from "@/lib/security/rate-limit";
import { getBusinessThread, postBusinessMessage } from "@/lib/support/support-chat";
import { guardSupportPost, readSupportMessage } from "@/lib/support/support-images";
import { SUPPORT_IMAGE_LABEL } from "@/lib/support/support-config";
import { supportFailure, supportJson, supportUnauthorized } from "@/lib/support/support-http";
import { notifyPlatformAdmin } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";

async function currentMember() {
    const user = await getCurrentUser();
    const membership = user ? await getCurrentBusiness() : null;
    return user && membership ? { user, businessId: membership.businessId } : null;
}

export async function GET() {
    const accessDenied = await apiAccessDenied("MEMBER", "edit", { allowLocked: true }); if (accessDenied) return accessDenied;
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
    const accessDenied = await apiAccessDenied("MEMBER", "edit", { allowLocked: true }); if (accessDenied) return accessDenied;
    const member = await currentMember();
    if (!member) return supportUnauthorized();
    const input = await readSupportMessage(request).catch(supportFailure);
    if (input instanceof Response) return input;
    const text = input.text || SUPPORT_IMAGE_LABEL;
    const prisma = createPrismaClient();
    try {
        await reserveLimits(prisma, [
            { scope: "support-message", identity: member.user.id, maximum: 20, seconds: 60 },
            ...input.image ? [{ scope: "support-image", identity: member.user.id, maximum: 30, seconds: 3600 }] : [],
        ]);
        const result = await postBusinessMessage(prisma, member.businessId, member.user.id, input.text, input.image);
        await notifyPlatformAdmin(prisma, {
            title: result.businessName,
            body: text.length > 160 ? `${text.slice(0, 157)}…` : text,
            url: `/admin/support/${result.conversationId}`,
            tag: `support-${result.conversationId}`,
        }, member.user.id);
        return supportJson({ success: true, thread: result.thread }, 201);
    } catch (cause) {
        return supportFailure(cause);
    } finally { await prisma.$disconnect(); }
}

export const POST = guardSupportPost(post);
