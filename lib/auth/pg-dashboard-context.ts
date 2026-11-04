import type { BusinessMode } from "@/lib/business/business-mode";
import "server-only";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { createPgReader } from "@/lib/database/pg-reader";
import { ACTIVE_BUSINESS_COOKIE } from "./active-business";

type Row = {
    expiresAt: Date; status: string; id: string; email: string;
    firstName: string | null; lastName: string | null; phone: string | null; seenTours: string[];
    businessMode: BusinessMode | null; businessId: string | null; businessName: string | null; logoUrl: string | null;
    role: string | null; permissions: string[] | null; readOnly: boolean | null; membershipStatus: string | null;
};

// React cache deduplicates only within this render/request, never across users.
export const getPgDashboardContext = cache(async () => {
    const cookieStore = await cookies();
    const token = cookieStore.get("marteo_session")?.value;
    if (!token) return null;
    const preferred = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value ?? "";
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const client = createPgReader();
    try {
        const [row] = await client.$queryRaw<Row[]>`
            SELECT s."expiresAt", u.status::text AS status, u.id, u.email,
                u."firstName", u."lastName", u.phone, u."seenTours",
                m."businessId", b.name AS "businessName", b."logoUrl", b.mode AS "businessMode",
                m.role::text AS role, m.permissions::text[] AS permissions, m."readOnly", m.status::text AS "membershipStatus"
            FROM "Session" s JOIN "User" u ON u.id = s."userId"
            LEFT JOIN LATERAL (
                SELECT "businessId", role, permissions, "readOnly", "status" FROM "BusinessMembership"
                WHERE "userId" = u.id AND "status" = 'ACTIVE'
                ORDER BY ("businessId" = ${preferred}) DESC, "createdAt" ASC, "businessId" ASC LIMIT 1
            ) m ON true
            LEFT JOIN "Business" b ON b.id = m."businessId"
            WHERE s."tokenHash" = ${tokenHash} LIMIT 1
        `;
        if (!row) return null;
        if (row.expiresAt <= new Date()) {
            await client.$queryRaw`DELETE FROM "Session" WHERE "tokenHash" = ${tokenHash}`;
            return null;
        }
        if (row.status !== "ACTIVE") return null;
        return {
            user: { id: row.id, email: row.email, firstName: row.firstName,
                lastName: row.lastName, phone: row.phone, seenTours: row.seenTours, status: "ACTIVE" as const },
            membership: row.businessId && row.businessName !== null ? {
                businessId: row.businessId,
                access: { role: row.role ?? "MEMBER", permissions: row.permissions ?? [],
                    readOnly: row.readOnly ?? true, status: row.membershipStatus ?? "FROZEN" },
                business: { mode: row.businessMode ?? "IMPORT", id: row.businessId, name: row.businessName, logoUrl: row.logoUrl },
            } : null,
        };
    } finally { await client.$disconnect(); }
});
