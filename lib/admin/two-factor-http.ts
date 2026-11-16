import "server-only";
import { NextResponse } from "next/server";
import { ADMIN_DEVICE_COOKIE, getAdminCandidate, getAdminDevice, type AdminUser } from "./authorization";
import { adminFailure } from "./action-http";
import type { TrustedDevice } from "./two-factor";
import { createPrismaClient } from "@/lib/prisma";
import { guardMutation } from "@/lib/security/mutation-request";

type Prisma = ReturnType<typeof createPrismaClient>;
type Result = { body: object; device?: TrustedDevice; clearDevice?: boolean };
type Context = { prisma: Prisma; admin: AdminUser; deviceId: string | null; request: Request };

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

/**
 * 2FA routes. "candidate": signed-in admin before the second step (setup, verify).
 * "trusted": admin on a trusted device (device list, backup codes, reset). Both pass the origin guard.
 */
export function twoFactorRoute(level: "candidate" | "trusted", handler: (context: Context) => Promise<Result>) {
    return guardMutation(async request => {
        const admin = await getAdminCandidate();
        if (!admin) return json({ success: false, message: "წვდომა აკრძალულია." }, 403);
        const device = await getAdminDevice(admin.id);
        if (level === "trusted" && !device) return json({ success: false, message: "ჯერ შეიყვანეთ კოდი." }, 403);
        const prisma = createPrismaClient();
        try {
            const result = await handler({ prisma, admin, deviceId: device?.id ?? null, request });
            const response = json({ success: true, ...result.body });
            if (result.device) {
                response.cookies.set(ADMIN_DEVICE_COOKIE, result.device.token, {
                    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
                    // „დამიმახსოვრე“ გარეშე cookie ბრაუზერის დახურვისას ქრება.
                    ...(result.device.remember ? { expires: result.device.expiresAt } : {}),
                });
            }
            if (result.clearDevice) response.cookies.set(ADMIN_DEVICE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
            return response;
        } catch (cause) {
            return adminFailure(cause);
        } finally { await prisma.$disconnect(); }
    }, "json");
}

export async function readBody(request: Request) {
    return await request.json().catch(() => ({})) as Record<string, unknown>;
}
