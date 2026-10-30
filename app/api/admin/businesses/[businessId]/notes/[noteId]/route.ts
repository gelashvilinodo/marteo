import { adminRoute } from "@/lib/admin/admin-route";
import { deleteNote } from "@/lib/admin/support-tools";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ businessId: string; noteId: string }> };

export async function DELETE(request: Request, context: Context) {
    const { businessId, noteId } = await context.params;
    return adminRoute(async ({ prisma }) => ({ notes: await deleteNote(prisma, businessId, noteId) }), "empty")(request);
}
