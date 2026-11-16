import { readBody, twoFactorRoute } from "@/lib/admin/two-factor-http";
import { regenerateBackupCodes } from "@/lib/admin/two-factor";

export const dynamic = "force-dynamic";

export const POST = twoFactorRoute("trusted", async ({ prisma, admin, request }) => {
    const body = await readBody(request);
    return { body: { backupCodes: await regenerateBackupCodes(prisma, admin.id, body.code, request) } };
});
