import { guardMutation } from "@/lib/security/mutation-request";
import { deleteNotificationsRoute } from "@/lib/notifications/delete-route";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Context) {
    const { id } = await params;
    return guardMutation(() => deleteNotificationsRoute(id), "empty")(request);
}
