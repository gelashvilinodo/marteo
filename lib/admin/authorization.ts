import "server-only";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { createPgReader } from "@/lib/database/pg-reader";

export type AdminUser = { id: string; email: string; firstName: string | null; lastName: string | null };

// Request-local only: never trust a client prop, business role or cached session role.
// JSON extraction denies access even before the additive migration is installed.
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
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
