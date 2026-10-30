import { adminRoute } from "@/lib/admin/admin-route";
import { createNote } from "@/lib/admin/support-tools";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ businessId: string }> };

export async function POST(request: Request, context: Context) {
    const { businessId } = await context.params;
    return adminRoute(async ({ prisma, admin, request: guarded }) => {
        const body = await guarded.json() as { body?: unknown };
        return { notes: await createNote(prisma, admin.id, businessId, body.body) };
    }, "json")(request);
}
