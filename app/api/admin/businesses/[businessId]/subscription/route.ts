import { getAdminUser } from "@/lib/admin/authorization";
import { updateSubscription } from "@/lib/admin/actions";
import { adminFailure, adminJson } from "@/lib/admin/action-http";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ businessId: string }> };

export async function PUT(request: Request, context: Context) {
    return guardMutation(async guarded => {
        const admin = await getAdminUser();
        if (!admin) return adminJson({ success: false, message: "წვდომა აკრძალულია." }, 403);
        const { businessId } = await context.params;
        const prisma = createPrismaClient();
        try {
            const body = await guarded.json() as { plan?: unknown; status?: unknown; expiresAt?: unknown };
            return adminJson({ success: true, message: await updateSubscription(prisma, admin.id, businessId, body) });
        } catch (cause) {
            return adminFailure(cause);
        } finally { await prisma.$disconnect(); }
    }, "json")(request);
}
