import "server-only";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { createPgReader } from "@/lib/database/pg-reader";

type Row = {
    expiresAt: Date; status: string; id: string; email: string;
    firstName: string | null; lastName: string | null; phone: string | null;
    businessId: string | null; businessName: string | null; logoUrl: string | null;
};

// React cache deduplicates only within this render/request, never across users.
export const getPgDashboardContext = cache(async () => {
    const token = (await cookies()).get("marteo_session")?.value;
    if (!token) return null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const client = createPgReader();
    try {
        const [row] = await client.$queryRaw<Row[]>`
            SELECT s."expiresAt", u.status::text AS status, u.id, u.email,
                u."firstName", u."lastName", u.phone,
                m."businessId", b.name AS "businessName", b."logoUrl"
            FROM "Session" s JOIN "User" u ON u.id = s."userId"
            LEFT JOIN LATERAL (
                SELECT "businessId" FROM "BusinessMembership"
                WHERE "userId" = u.id ORDER BY "createdAt" ASC LIMIT 1
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
                lastName: row.lastName, phone: row.phone, status: "ACTIVE" as const },
            membership: row.businessId && row.businessName !== null ? {
                businessId: row.businessId,
                business: { id: row.businessId, name: row.businessName, logoUrl: row.logoUrl },
            } : null,
        };
    } finally { await client.$disconnect(); }
});
