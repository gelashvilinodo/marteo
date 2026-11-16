import "server-only";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { createPgReader } from "@/lib/database/pg-reader";

export type AdminUser = { id: string; email: string; firstName: string | null; lastName: string | null };

export const ADMIN_DEVICE_COOKIE = "marteo_admin_device";

export const hashDeviceToken = (token: string) => createHash("sha256").update(`marteo-admin-device:${token}`).digest("hex");

/**
 * Signed in as a platform admin, before the second step. Only the /admin-login page, its 2FA routes and the
 * "admin panel" link in the dashboard use this; everything else in the admin panel needs getAdminUser().
 */
// Request-local only: never trust a client prop, business role or cached session role.
// JSON extraction denies access even before the additive migration is installed.
export const getAdminCandidate = cache(async (): Promise<AdminUser | null> => {
    const token = (await cookies()).get("marteo_session")?.value;
    if (!token) return null;
    const db = createPgReader();
    try {
        const [user] = await db.$queryRaw<AdminUser[]>`
            SELECT u.id, u.email, u."firstName", u."lastName" FROM "Session" s JOIN "User" u ON u.id = s."userId"
            WHERE s."tokenHash" = ${createHash("sha256").update(token).digest("hex")}
              AND s."expiresAt" > ${new Date()} AND u.status = 'ACTIVE'
              AND to_jsonb(u)->>'isPlatformAdmin' = 'true'
            LIMIT 1
        `;
        return user ?? null;
    } finally { await db.$disconnect(); }
});

/** The trusted-device row of this browser, if it belongs to this admin and is still valid. */
export const getAdminDevice = cache(async (userId: string): Promise<{ id: string } | null> => {
    const token = (await cookies()).get(ADMIN_DEVICE_COOKIE)?.value;
    if (!token || token.length > 128) return null;
    const db = createPgReader();
    try {
        // Server clock in SQL: a JS Date would be sent in local time by pg during local development.
        const [device] = await db.$queryRaw<{ id: string }[]>`
            SELECT d.id FROM "AdminTrustedDevice" d JOIN "AdminSecurity" a ON a."userId" = d."userId"
            WHERE d."tokenHash" = ${hashDeviceToken(token)} AND d."userId" = ${userId}
              AND d."revokedAt" IS NULL AND d."expiresAt" > (now() AT TIME ZONE 'UTC')
              AND a."totpEnabledAt" IS NOT NULL
            LIMIT 1
        `;
        return device ?? null;
    } finally { await db.$disconnect(); }
});

/** A platform admin who also passed the second step on this device. */
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
    const candidate = await getAdminCandidate();
    if (!candidate) return null;
    return await getAdminDevice(candidate.id) ? candidate : null;
});
