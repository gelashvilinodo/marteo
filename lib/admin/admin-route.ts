import "server-only";
import { getAdminUser, type AdminUser } from "./authorization";
import { adminFailure, adminJson } from "./action-http";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";

type Prisma = ReturnType<typeof createPrismaClient>;
type Handler = (context: { prisma: Prisma; admin: AdminUser; request: Request }) => Promise<unknown>;

// Admin check, one Prisma client per request, JSON errors; mutations also pass the origin guard.
export function adminRoute(handler: Handler, kind: "read" | "json" | "empty" = "read") {
    const run = async (request: Request) => {
        const admin = await getAdminUser();
        if (!admin) return adminJson({ success: false, message: "წვდომა აკრძალულია." }, 403);
        const prisma = createPrismaClient();
        try {
            return adminJson({ success: true, ...(await handler({ prisma, admin, request }) as object) });
        } catch (cause) {
            return adminFailure(cause);
        } finally { await prisma.$disconnect(); }
    };
    return kind === "read" ? run : guardMutation(run, kind);
}
