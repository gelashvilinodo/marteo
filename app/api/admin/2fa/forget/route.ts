import { twoFactorRoute } from "@/lib/admin/two-factor-http";
import { forgetCurrentDevice } from "@/lib/admin/two-factor";

export const dynamic = "force-dynamic";

export const POST = twoFactorRoute("trusted", async ({ prisma, admin, deviceId }) => {
    await forgetCurrentDevice(prisma, admin.id, deviceId!);
    return { body: {}, clearDevice: true };
});
