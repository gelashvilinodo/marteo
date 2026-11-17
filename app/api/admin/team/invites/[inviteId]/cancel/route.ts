import { adminRoute } from "@/lib/admin/admin-route";
import { cancelAdminInvite } from "@/lib/admin/admin-team";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ inviteId: string }> };

export async function POST(request: Request, context: Context) {
    const { inviteId } = await context.params;
    return adminRoute(async ({ prisma, admin }) => ({ message: await cancelAdminInvite(prisma, admin, inviteId) }), "empty")(request);
}
