import { adminRoute } from "@/lib/admin/admin-route";
import { createAdminInvite } from "@/lib/admin/admin-team";

export const dynamic = "force-dynamic";

export const POST = adminRoute(async ({ prisma, admin, request }) => {
    const body = await request.json().catch(() => ({})) as { email?: unknown; code?: unknown };
    return { message: await createAdminInvite(prisma, admin, body, request) };
}, "json");
