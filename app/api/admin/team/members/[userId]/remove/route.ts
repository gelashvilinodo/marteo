import { adminRoute } from "@/lib/admin/admin-route";
import { removeAdmin } from "@/lib/admin/admin-team";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userId: string }> };

export async function POST(request: Request, context: Context) {
    const { userId } = await context.params;
    return adminRoute(async ({ prisma, admin, request: guarded }) => {
        const body = await guarded.json().catch(() => ({})) as { code?: unknown };
        return { message: await removeAdmin(prisma, admin, userId, body, guarded) };
    }, "json")(request);
}
