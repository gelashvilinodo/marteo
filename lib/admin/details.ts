import "server-only";
import { getAdminUser } from "./authorization";
import { AdminAccessError } from "./overview";
import { createPgReader } from "@/lib/database/pg-reader";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

// Aggregates only: the security page promises the team does not browse a
// business's orders, customers or finances, so no record contents are read.
export type AdminBusinessDetail = {
    id: string; name: string; mode: string; category: string; logoUrl: string | null;
    phone: string | null; email: string | null; address: string | null; website: string | null; description: string | null;
    createdAt: Date;
    plan: string | null; subscriptionStatus: string | null; subscriptionStartedAt: Date | null; subscriptionExpiresAt: Date | null;
    orders: number; ordersLast30: number; customers: number; products: number; invoices: number;
    lastOrderAt: Date | null; lastLoginAt: Date | null;
    conversationId: string | null; conversationStatus: string | null; lastSupportMessageAt: Date | null;
    members: {
        userId: string; role: string; firstName: string | null; lastName: string | null; email: string; phone: string;
        status: string; avatarUrl: string | null; emailVerified: boolean; phoneVerified: boolean; lastLoginAt: Date | null; joinedAt: Date;
    }[];
};

export async function getAdminBusinessDetail(id: string): Promise<AdminBusinessDetail | null> {
    if (!await getAdminUser()) throw new AdminAccessError();
    if (!ID.test(id)) return null;
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            const since = new Date(Date.now() - 30 * 86400000);
            const [business] = await tx.$queryRaw<Omit<AdminBusinessDetail, "members">[]>`
                SELECT b.id, b.name, b.mode::text AS mode, b.category, b."logoUrl", b.phone, b.email, b.address, b.website, b.description, b."createdAt",
                    s.plan::text AS plan, s.status::text AS "subscriptionStatus", s."startedAt" AS "subscriptionStartedAt", s."expiresAt" AS "subscriptionExpiresAt",
                    (SELECT count(*)::int FROM "Order" o WHERE o."businessId" = b.id AND o."deletedAt" IS NULL) AS orders,
                    (SELECT count(*)::int FROM "Order" o WHERE o."businessId" = b.id AND o."deletedAt" IS NULL AND o."createdAt" >= ${since}) AS "ordersLast30",
                    (SELECT count(*)::int FROM "Customer" c WHERE c."businessId" = b.id) AS customers,
                    (SELECT count(*)::int FROM "Product" p WHERE p."businessId" = b.id) AS products,
                    (SELECT count(*)::int FROM "Order" o WHERE o."businessId" = b.id AND o."deletedAt" IS NULL AND o."invoicePrintedAt" IS NOT NULL) AS invoices,
                    (SELECT max(o."createdAt") FROM "Order" o WHERE o."businessId" = b.id AND o."deletedAt" IS NULL) AS "lastOrderAt",
                    (SELECT max(se."createdAt") FROM "Session" se JOIN "BusinessMembership" m ON m."userId" = se."userId" WHERE m."businessId" = b.id) AS "lastLoginAt",
                    c.id AS "conversationId", c.status::text AS "conversationStatus", c."lastMessageAt" AS "lastSupportMessageAt"
                FROM "Business" b
                LEFT JOIN "Subscription" s ON s."businessId" = b.id
                LEFT JOIN "SupportConversation" c ON c."businessId" = b.id
                WHERE b.id = ${id}
            `;
            if (!business) return null;
            const members = await tx.$queryRaw<AdminBusinessDetail["members"]>`
                SELECT u.id AS "userId", m.role::text AS role, u."firstName", u."lastName", u.email, u.phone, u.status::text AS status, u."avatarUrl",
                    u."emailVerifiedAt" IS NOT NULL AS "emailVerified", u."phoneVerifiedAt" IS NOT NULL AS "phoneVerified",
                    (SELECT max(se."createdAt") FROM "Session" se WHERE se."userId" = u.id) AS "lastLoginAt", m."createdAt" AS "joinedAt"
                FROM "BusinessMembership" m JOIN "User" u ON u.id = m."userId"
                WHERE m."businessId" = ${id}
                ORDER BY CASE m.role WHEN 'OWNER' THEN 0 WHEN 'ADMIN' THEN 1 ELSE 2 END, m."createdAt"
            `;
            return { ...business, members };
        });
    } finally { await db.$disconnect(); }
}

export type AdminUserDetail = {
    id: string; firstName: string | null; lastName: string | null; email: string; phone: string; avatarUrl: string | null;
    status: string; isPlatformAdmin: boolean; createdAt: Date; emailVerifiedAt: Date | null; phoneVerifiedAt: Date | null;
    lastLoginAt: Date | null; activeSessions: number;
    businesses: { id: string; name: string; logoUrl: string | null; mode: string; role: string; plan: string | null; joinedAt: Date }[];
};

export async function getAdminUserDetail(id: string): Promise<AdminUserDetail | null> {
    if (!await getAdminUser()) throw new AdminAccessError();
    if (!ID.test(id)) return null;
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            // Explicit column list: never select password or other secrets.
            const [user] = await tx.$queryRaw<Omit<AdminUserDetail, "businesses">[]>`
                SELECT u.id, u."firstName", u."lastName", u.email, u.phone, u."avatarUrl", u.status::text AS status,
                    to_jsonb(u)->>'isPlatformAdmin' = 'true' AS "isPlatformAdmin", u."createdAt", u."emailVerifiedAt", u."phoneVerifiedAt",
                    (SELECT max(se."createdAt") FROM "Session" se WHERE se."userId" = u.id) AS "lastLoginAt",
                    (SELECT count(*)::int FROM "Session" se WHERE se."userId" = u.id AND se."expiresAt" > ${new Date()}) AS "activeSessions"
                FROM "User" u WHERE u.id = ${id}
            `;
            if (!user) return null;
            const businesses = await tx.$queryRaw<AdminUserDetail["businesses"]>`
                SELECT b.id, b.name, b."logoUrl", b.mode::text AS mode, m.role::text AS role, s.plan::text AS plan, m."createdAt" AS "joinedAt"
                FROM "BusinessMembership" m JOIN "Business" b ON b.id = m."businessId"
                LEFT JOIN "Subscription" s ON s."businessId" = b.id
                WHERE m."userId" = ${id}
                ORDER BY m."createdAt"
            `;
            return { ...user, businesses };
        });
    } finally { await db.$disconnect(); }
}
