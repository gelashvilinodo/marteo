import { guardMutation } from "@/lib/security/mutation-request";
import { cancelCampaign, parseCampaignInput, updateCampaign } from "@/lib/notifications/admin";
import { adminJson, adminRoute } from "@/lib/notifications/admin-route";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
    const { id } = await params;
    return guardMutation(req => adminRoute("update", async () => {
        await updateCampaign(id, parseCampaignInput(await req.json() as Record<string, unknown>));
        return adminJson({ ok: true });
    }))(request);
}

export async function DELETE(request: Request, { params }: Context) {
    const { id } = await params;
    return guardMutation(() => adminRoute("cancel", async () => {
        await cancelCampaign(id);
        return adminJson({ ok: true });
    }), "empty")(request);
}
