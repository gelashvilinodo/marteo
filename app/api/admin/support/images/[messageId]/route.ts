import { getAdminUser } from "@/lib/admin/authorization";
import { createPrismaClient } from "@/lib/prisma";
import { findSupportImage } from "@/lib/support/support-chat";
import { downloadSupportImage, supportImageResponse } from "@/lib/support/support-images";
import { supportFailure, supportForbidden, supportJson } from "@/lib/support/support-http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ messageId: string }> };

export async function GET(_request: Request, context: Context) {
    if (!await getAdminUser()) return supportForbidden();
    const { messageId } = await context.params;
    const prisma = createPrismaClient();
    try {
        const image = await findSupportImage(prisma, messageId);
        if (!image) return supportJson({ success: false, message: "ფოტო ვერ მოიძებნა." }, 404);
        return supportImageResponse(await downloadSupportImage(image.path));
    } catch (cause) {
        return supportFailure(cause);
    } finally { await prisma.$disconnect(); }
}
