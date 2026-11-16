import { readBody, twoFactorRoute } from "@/lib/admin/two-factor-http";
import { resetTwoFactor } from "@/lib/admin/two-factor";

export const dynamic = "force-dynamic";

export const POST = twoFactorRoute("trusted", async ({ prisma, admin, request }) => {
    const body = await readBody(request);
    await resetTwoFactor(prisma, admin.id, body.password, body.code, request);
    return { body: {}, clearDevice: true };
});
