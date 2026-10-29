import { getAdminUser } from "@/lib/admin/authorization";
import { runUserAction } from "@/lib/admin/actions";
import { adminFailure, adminJson } from "@/lib/admin/action-http";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userId: string }> };

export async function POST(request: Request, context: Context) {
    return guardMutation(async guarded => {
        const admin = await getAdminUser();
        if (!admin) return adminJson({ success: false, message: "წვდომა აკრძალულია." }, 403);
        const { userId } = await context.params;
        const prisma = createPrismaClient();
        try {
            const body = await guarded.json() as { action?: unknown };
            return adminJson({ success: true, message: await runUserAction(prisma, admin.id, userId, body.action) });
        } catch (cause) {
            return adminFailure(cause);
        } finally { await prisma.$disconnect(); }
    }, "json")(request);
}
