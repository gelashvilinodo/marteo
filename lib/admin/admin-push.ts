import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { notifyPlatformAdmin, type PushMessage } from "@/lib/push/web-push";

// ადმინის push-ები (გადახდები, შეცდომები, ახალი მოწყობილობა) მხოლოდ production-ში იგზავნება:
// ლოკალური dev და QA იმავე ბაზას და იმავე ტელეფონს იყენებს. ლოკალურად ჩასართავად: ADMIN_PUSH_LOCAL=1.
export function adminPushEnabled() {
    return process.env.NODE_ENV === "production" || process.env.ADMIN_PUSH_LOCAL === "1";
}

/** Never throws and never slows the caller: the push runs in the background. */
export async function sendAdminPush(prisma: PrismaClient, message: PushMessage) {
    if (!adminPushEnabled()) return false;
    await notifyPlatformAdmin(prisma, message).catch(() => console.error("Admin push failed"));
    return true;
}
