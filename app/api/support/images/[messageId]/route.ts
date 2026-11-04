import { apiAccessDenied } from "@/lib/business/access";
import { getCurrentBusiness } from "@/lib/auth/current-business";
import { createPrismaClient } from "@/lib/prisma";
import { findSupportImage } from "@/lib/support/support-chat";
import { downloadSupportImage, supportImageResponse } from "@/lib/support/support-images";
import { supportFailure, supportJson } from "@/lib/support/support-http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ messageId: string }> };

export async function GET(_request: Request, context: Context) {
    const accessDenied = await apiAccessDenied("MEMBER", "edit", { allowLocked: true }); if (accessDenied) return accessDenied;
    const current = await getCurrentBusiness();
    const { messageId } = await context.params;
    const prisma = createPrismaClient();
    try {
        const image = await findSupportImage(prisma, messageId);
        // Another business's photo answers the same as a missing one.
        if (!image || !current || image.businessId !== current.businessId) return supportJson({ success: false, message: "ფოტო ვერ მოიძებნა." }, 404);
        return supportImageResponse(await downloadSupportImage(image.path));
    } catch (cause) {
        return supportFailure(cause);
    } finally { await prisma.$disconnect(); }
}
