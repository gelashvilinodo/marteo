import { adminRoute } from "@/lib/admin/admin-route";
import { updateBusinessAi } from "@/lib/admin/ai-usage";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ businessId: string }> };

export async function PUT(request: Request, context: Context) {
    const { businessId } = await context.params;
    return adminRoute(async ({ prisma, admin, request: guarded }) => {
        const body = await guarded.json() as { disabled?: unknown; monthlyLimit?: unknown };
        return updateBusinessAi(prisma, admin.id, businessId, body);
    }, "json")(request);
}
