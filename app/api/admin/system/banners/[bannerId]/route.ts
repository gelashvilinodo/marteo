import { adminRoute } from "@/lib/admin/admin-route";
import { cancelBanner } from "@/lib/admin/system";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ bannerId: string }> };

export async function DELETE(request: Request, context: Context) {
    const { bannerId } = await context.params;
    return adminRoute(async ({ prisma, admin }) => ({ message: await cancelBanner(prisma, admin.id, bannerId) }), "empty")(request);
}
