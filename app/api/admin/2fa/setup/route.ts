import { readBody, twoFactorRoute } from "@/lib/admin/two-factor-http";
import { startSetup } from "@/lib/admin/two-factor";

export const dynamic = "force-dynamic";

export const POST = twoFactorRoute("candidate", async ({ prisma, admin, request }) => {
    const body = await readBody(request);
    return { body: await startSetup(prisma, admin, body.password, request) };
});
