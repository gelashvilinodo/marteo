import { readBody, twoFactorRoute } from "@/lib/admin/two-factor-http";
import { verifySecondStep } from "@/lib/admin/two-factor";

export const dynamic = "force-dynamic";

export const POST = twoFactorRoute("candidate", async ({ prisma, admin, request }) => {
    const body = await readBody(request);
    const { device, backupLeft } = await verifySecondStep(prisma, admin, body.code, body.remember !== false, request);
    return { body: { backupLeft }, device };
});
