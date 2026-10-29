import { guardMutation } from "@/lib/security/mutation-request";
import { updateWelcomeTemplate } from "@/lib/notifications/admin";
import { adminJson, adminRoute } from "@/lib/notifications/admin-route";

export const dynamic = "force-dynamic";

export const PUT = guardMutation(request => adminRoute("welcome", async () => {
    await updateWelcomeTemplate(await request.json() as Record<string, unknown>);
    return adminJson({ ok: true });
}));
