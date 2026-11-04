import { getAdminUser } from "@/lib/admin/authorization";
import { adminFailure, adminJson } from "@/lib/admin/action-http";
import { deleteRetainedBusiness } from "@/lib/admin/retention";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ businessId: string }> };

// 12 თვე გადაუხდელი ბიზნესის წაშლა (მხოლოდ ადმინი, სახელის აკრეფით).
export async function DELETE(request: Request, context: Context) {
    return guardMutation(async guarded => {
        const admin = await getAdminUser();
        if (!admin) return adminJson({ success: false, message: "წვდომა აკრძალულია." }, 403);
        const { businessId } = await context.params;
        const prisma = createPrismaClient();
        try {
            const body = await guarded.json() as { confirmName?: unknown };
            return adminJson({ success: true, message: await deleteRetainedBusiness(prisma, admin.id, businessId, body.confirmName) });
        } catch (cause) {
            return adminFailure(cause);
        } finally { await prisma.$disconnect(); }
    }, "json")(request);
}
