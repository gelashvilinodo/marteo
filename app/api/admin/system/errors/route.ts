import { adminRoute } from "@/lib/admin/admin-route";
import { resolveErrors } from "@/lib/admin/system";

export const dynamic = "force-dynamic";

// Marks one error group (or all open ones) resolved.
export const POST = adminRoute(async ({ prisma, admin, request }) => {
    const body = await request.json() as { id?: unknown; all?: unknown };
    return { message: await resolveErrors(prisma, admin.id, body) };
}, "json");
