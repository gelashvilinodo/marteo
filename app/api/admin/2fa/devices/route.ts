import { readBody, twoFactorRoute } from "@/lib/admin/two-factor-http";
import { listDevices, revokeDevices } from "@/lib/admin/two-factor";

export const dynamic = "force-dynamic";

export const POST = twoFactorRoute("trusted", async ({ prisma, admin, deviceId, request }) => {
    const body = await readBody(request);
    const message = await revokeDevices(prisma, admin.id, deviceId!, body.deviceId);
    return { body: { message, devices: await listDevices(prisma, admin.id, deviceId) } };
});
