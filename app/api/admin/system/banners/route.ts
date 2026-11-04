import { adminRoute } from "@/lib/admin/admin-route";
import { createBanner } from "@/lib/admin/system";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ prisma, admin, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return { message: await createBanner(prisma, admin.id, body) };
}, "json");
