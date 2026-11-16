import { readBody, twoFactorRoute } from "@/lib/admin/two-factor-http";
import { enableTwoFactor } from "@/lib/admin/two-factor";

export const dynamic = "force-dynamic";

export const POST = twoFactorRoute("candidate", async ({ prisma, admin, request }) => {
    const body = await readBody(request);
    const { backupCodes, device } = await enableTwoFactor(prisma, admin, body.code, body.remember !== false, request);
    return { body: { backupCodes }, device };
});
