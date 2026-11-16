import { adminRoute } from "@/lib/admin/admin-route";
import { adminDeleteUser } from "@/lib/admin/user-delete";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userId: string }> };

export async function POST(request: Request, context: Context) {
    const { userId } = await context.params;
    return adminRoute(async ({ prisma, admin, request: guarded }) => {
        const body = await guarded.json() as { confirmEmail?: unknown; code?: unknown };
        return { message: await adminDeleteUser(prisma, admin.id, userId, body, guarded) };
    }, "json")(request);
}
