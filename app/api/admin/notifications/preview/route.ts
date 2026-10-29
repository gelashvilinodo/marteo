import { guardMutation } from "@/lib/security/mutation-request";
import { countAudience, parseAudience, parseTbilisiDateTime } from "@/lib/notifications/admin";
import { adminJson, adminRoute } from "@/lib/notifications/admin-route";

export const dynamic = "force-dynamic";

export const POST = guardMutation(request => adminRoute("preview", async () => {
    const body = await request.json() as Record<string, unknown>;
    return adminJson({ recipients: await countAudience(parseAudience(body.audience), parseTbilisiDateTime(body.deliverAt)) });
}));
