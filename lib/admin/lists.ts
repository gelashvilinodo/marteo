import "server-only";
import { getAdminUser } from "./authorization";
import { AdminAccessError } from "./overview";
import { createPgReader } from "@/lib/database/pg-reader";
import { join, sql, type Sql } from "@prisma/client-runtime-utils";

export const ADMIN_PAGE_SIZE = 50;

export function parseAdminPage(value: string | string[] | undefined) {
    const page = Number(Array.isArray(value) ? value[0] : value);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string) {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

function pick<T extends string>(value: string, allowed: readonly T[]): T | "" {
    return (allowed as readonly string[]).includes(value) ? value as T : "";
}

// User text goes through bind parameters; LIKE wildcards are escaped so "%" or "_" match literally.
function likePattern(query: string) {
    return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

const PERIODS = ["7", "30", "90"] as const;

function since(period: string) {
    return new Date(Date.now() - Number(period) * 86400000);
}

export type AdminBusinessFilters = {
    q: string;
    mode: "" | "IMPORT" | "MANUFACTURING" | "HYBRID";
    plan: "" | "FREE" | "START" | "BUSINESS" | "PRO" | "NONE";
    period: "" | typeof PERIODS[number];
};

export function parseBusinessFilters(params: Params): AdminBusinessFilters {
    return {
        q: one(params, "q").slice(0, 100),
        mode: pick(one(params, "mode"), ["IMPORT", "MANUFACTURING", "HYBRID"] as const),
        plan: pick(one(params, "plan"), ["FREE", "START", "BUSINESS", "PRO", "NONE"] as const),
        period: pick(one(params, "period"), PERIODS),
    };
}

function businessWhere(filters: AdminBusinessFilters): Sql {
    const clauses: Sql[] = [sql`true`];
    if (filters.q) {
        const pattern = likePattern(filters.q);
        const digits = filters.q.replace(/\D/g, "");
        const search = [
            sql`b.name ILIKE ${pattern}`,
            sql`b.email ILIKE ${pattern}`,
            sql`EXISTS (SELECT 1 FROM "BusinessMembership" m JOIN "User" u ON u.id = m."userId" WHERE m."businessId" = b.id AND (u.email ILIKE ${pattern} OR concat_ws(' ', u."firstName", u."lastName") ILIKE ${pattern}))`,
        ];
        if (digits.length >= 4) {
            const phone = `%${digits}%`;
            search.push(sql`regexp_replace(coalesce(b.phone, ''), '\\D', '', 'g') LIKE ${phone}`);
            search.push(sql`EXISTS (SELECT 1 FROM "BusinessMembership" m JOIN "User" u ON u.id = m."userId" WHERE m."businessId" = b.id AND regexp_replace(u.phone, '\\D', '', 'g') LIKE ${phone})`);
        }
        clauses.push(sql`(${join(search, " OR ")})`);
    }
    if (filters.mode) clauses.push(sql`b.mode::text = ${filters.mode}`);
    if (filters.plan === "NONE") clauses.push(sql`s.id IS NULL`);
    else if (filters.plan) clauses.push(sql`s.plan::text = ${filters.plan}`);
    if (filters.period) clauses.push(sql`b."createdAt" >= ${since(filters.period)}`);
    return join(clauses, " AND ");
}

export type AdminBusinessRow = {
    id: string; name: string; mode: string; category: string; createdAt: Date;
    ownerEmail: string | null; members: number; orders: number;
    plan: string | null; subscriptionStatus: string | null;
};

export async function getAdminBusinesses(page: number, filters: AdminBusinessFilters) {
    if (!await getAdminUser()) throw new AdminAccessError();
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            const where = businessWhere(filters);
            const [{ total }] = await tx.$queryRaw<{ total: number }[]>(sql`SELECT count(*)::int AS total FROM "Business" b LEFT JOIN "Subscription" s ON s."businessId" = b.id WHERE ${where}`);
            const rows = await tx.$queryRaw<AdminBusinessRow[]>(sql`
                SELECT b.id, b.name, b.mode::text AS mode, b.category, b."createdAt",
                    (SELECT u.email FROM "BusinessMembership" m JOIN "User" u ON u.id = m."userId"
                        WHERE m."businessId" = b.id AND m.role = 'OWNER' ORDER BY m."createdAt" LIMIT 1) AS "ownerEmail",
                    (SELECT count(*)::int FROM "BusinessMembership" m WHERE m."businessId" = b.id) AS members,
                    (SELECT count(*)::int FROM "Order" o WHERE o."businessId" = b.id AND o."deletedAt" IS NULL) AS orders,
                    s.plan::text AS plan, s.status::text AS "subscriptionStatus"
                FROM "Business" b LEFT JOIN "Subscription" s ON s."businessId" = b.id
                WHERE ${where}
                ORDER BY b."createdAt" DESC, b.id
                LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}
            `);
            return { total, rows };
        });
    } finally { await db.$disconnect(); }
}

export type AdminUserFilters = {
    q: string;
    status: "" | "ACTIVE" | "PENDING_VERIFICATION" | "SUSPENDED";
    verification: "" | "unverified" | "verified";
    business: "" | "with" | "without";
    period: "" | typeof PERIODS[number];
};

export function parseUserFilters(params: Params): AdminUserFilters {
    return {
        q: one(params, "q").slice(0, 100),
        status: pick(one(params, "status"), ["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED"] as const),
        verification: pick(one(params, "verification"), ["unverified", "verified"] as const),
        business: pick(one(params, "business"), ["with", "without"] as const),
        period: pick(one(params, "period"), PERIODS),
    };
}

function userWhere(filters: AdminUserFilters): Sql {
    const clauses: Sql[] = [sql`true`];
    if (filters.q) {
        const pattern = likePattern(filters.q);
        const digits = filters.q.replace(/\D/g, "");
        const search = [
            sql`u.email ILIKE ${pattern}`,
            sql`concat_ws(' ', u."firstName", u."lastName") ILIKE ${pattern}`,
            sql`EXISTS (SELECT 1 FROM "BusinessMembership" m JOIN "Business" b ON b.id = m."businessId" WHERE m."userId" = u.id AND b.name ILIKE ${pattern})`,
        ];
        if (digits.length >= 4) search.push(sql`regexp_replace(u.phone, '\\D', '', 'g') LIKE ${`%${digits}%`}`);
        clauses.push(sql`(${join(search, " OR ")})`);
    }
    if (filters.status) clauses.push(sql`u.status::text = ${filters.status}`);
    if (filters.verification === "unverified") clauses.push(sql`(u."emailVerifiedAt" IS NULL OR u."phoneVerifiedAt" IS NULL)`);
    if (filters.verification === "verified") clauses.push(sql`(u."emailVerifiedAt" IS NOT NULL AND u."phoneVerifiedAt" IS NOT NULL)`);
    if (filters.business === "with") clauses.push(sql`EXISTS (SELECT 1 FROM "BusinessMembership" m WHERE m."userId" = u.id)`);
    if (filters.business === "without") clauses.push(sql`NOT EXISTS (SELECT 1 FROM "BusinessMembership" m WHERE m."userId" = u.id)`);
    if (filters.period) clauses.push(sql`u."createdAt" >= ${since(filters.period)}`);
    return join(clauses, " AND ");
}

export type AdminUserRow = {
    id: string; email: string; phone: string; firstName: string | null; lastName: string | null;
    status: string; createdAt: Date; emailVerified: boolean; phoneVerified: boolean; businesses: number;
};

export async function getAdminUsers(page: number, filters: AdminUserFilters) {
    if (!await getAdminUser()) throw new AdminAccessError();
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            const where = userWhere(filters);
            const [{ total }] = await tx.$queryRaw<{ total: number }[]>(sql`SELECT count(*)::int AS total FROM "User" u WHERE ${where}`);
            // Explicit column list: never select password or other secrets.
            const rows = await tx.$queryRaw<AdminUserRow[]>(sql`
                SELECT u.id, u.email, u.phone, u."firstName", u."lastName", u.status::text AS status, u."createdAt",
                    u."emailVerifiedAt" IS NOT NULL AS "emailVerified", u."phoneVerifiedAt" IS NOT NULL AS "phoneVerified",
                    (SELECT count(*)::int FROM "BusinessMembership" m WHERE m."userId" = u.id) AS businesses
                FROM "User" u
                WHERE ${where}
                ORDER BY u."createdAt" DESC, u.id
                LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}
            `);
            return { total, rows };
        });
    } finally { await db.$disconnect(); }
}
