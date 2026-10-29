import { guardMutation } from "@/lib/security/mutation-request";
import { createCampaign, parseCampaignInput } from "@/lib/notifications/admin";
import { adminJson, adminRoute } from "@/lib/notifications/admin-route";

export const dynamic = "force-dynamic";

export const POST = guardMutation(request => adminRoute("create", async () => {
    const id = await createCampaign(parseCampaignInput(await request.json() as Record<string, unknown>));
    return adminJson({ id }, 201);
}));
