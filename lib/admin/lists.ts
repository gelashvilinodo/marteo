import "server-only";
import { getAdminUser } from "./authorization";
import { AdminAccessError } from "./overview";
import { createPgReader } from "@/lib/database/pg-reader";

export const ADMIN_PAGE_SIZE = 50;

export function parseAdminPage(value: string | string[] | undefined) {
    const page = Number(Array.isArray(value) ? value[0] : value);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export type AdminBusinessRow = {
    id: string; name: string; mode: string; category: string; createdAt: Date;
    ownerEmail: string | null; members: number; orders: number;
    plan: string | null; subscriptionStatus: string | null;
};

export async function getAdminBusinesses(page: number) {
    if (!await getAdminUser()) throw new AdminAccessError();
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            const [{ total }] = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "Business"`;
            const rows = await tx.$queryRaw<AdminBusinessRow[]>`
                SELECT b.id, b.name, b.mode::text AS mode, b.category, b."createdAt",
                    (SELECT u.email FROM "BusinessMembership" m JOIN "User" u ON u.id = m."userId"
                        WHERE m."businessId" = b.id AND m.role = 'OWNER' ORDER BY m."createdAt" LIMIT 1) AS "ownerEmail",
                    (SELECT count(*)::int FROM "BusinessMembership" m WHERE m."businessId" = b.id) AS members,
                    (SELECT count(*)::int FROM "Order" o WHERE o."businessId" = b.id AND o."deletedAt" IS NULL) AS orders,
                    s.plan::text AS plan, s.status::text AS "subscriptionStatus"
                FROM "Business" b LEFT JOIN "Subscription" s ON s."businessId" = b.id
                ORDER BY b."createdAt" DESC, b.id
                LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}
            `;
            return { total, rows };
        });
    } finally { await db.$disconnect(); }
}

export type AdminUserRow = {
    id: string; email: string; phone: string; firstName: string | null; lastName: string | null;
    status: string; createdAt: Date; emailVerified: boolean; phoneVerified: boolean; businesses: number;
};

export async function getAdminUsers(page: number) {
    if (!await getAdminUser()) throw new AdminAccessError();
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            const [{ total }] = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "User"`;
            // Explicit column list: never select password or other secrets.
            const rows = await tx.$queryRaw<AdminUserRow[]>`
                SELECT u.id, u.email, u.phone, u."firstName", u."lastName", u.status::text AS status, u."createdAt",
                    u."emailVerifiedAt" IS NOT NULL AS "emailVerified", u."phoneVerifiedAt" IS NOT NULL AS "phoneVerified",
                    (SELECT count(*)::int FROM "BusinessMembership" m WHERE m."userId" = u.id) AS businesses
                FROM "User" u
                ORDER BY u."createdAt" DESC, u.id
                LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}
            `;
            return { total, rows };
        });
    } finally { await db.$disconnect(); }
}
