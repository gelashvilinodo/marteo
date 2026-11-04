import { getAdminUser } from "@/lib/admin/authorization";
import { adminFailure, adminJson } from "@/lib/admin/action-http";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";
import { addSmsPack, getBusinessSms } from "@/lib/sms/sms-admin";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ businessId: string }> };

export async function POST(request: Request, context: Context) {
    return guardMutation(async guarded => {
        const admin = await getAdminUser();
        if (!admin) return adminJson({ success: false, message: "წვდომა აკრძალულია." }, 403);
        const { businessId } = await context.params;
        const prisma = createPrismaClient();
        try {
            const body = await guarded.json() as { count?: unknown; note?: unknown };
            const message = await addSmsPack(prisma, admin.id, businessId, body.count, body.note);
            return adminJson({ success: true, message, sms: await getBusinessSms(prisma, businessId) });
        } catch (cause) {
            return adminFailure(cause);
        } finally { await prisma.$disconnect(); }
    }, "json")(request);
}
