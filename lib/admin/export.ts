import "server-only";
import { sql } from "@prisma/client-runtime-utils";
import { getAdminUser } from "./authorization";
import { AdminAccessError } from "./overview";
import { businessWhere, userWhere, type AdminBusinessFilters, type AdminUserFilters } from "./lists";
import { USER_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS } from "@/components/admin/AdminBadges";
import { BUSINESS_MODES } from "@/lib/business/business-mode";
import { createPgReader } from "@/lib/database/pg-reader";
import { createPrismaClient } from "@/lib/prisma";

// The browser builds the .xlsx (as imports do), so the Worker only returns rows.
// A hard cap keeps one request bounded; the platform is far below it.
const EXPORT_LIMIT = 10000;

const tbilisi = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" });
const day = (value: Date | null) => value ? tbilisi.format(value) : "";
const yes = (value: boolean) => value ? "კი" : "არა";

type Row = Record<string, string | number>;

export type ExportSheet = { sheet: string; rows: Row[]; widths: number[] };

async function logExport(adminId: string, kind: "users" | "businesses", filters: object, count: number) {
    const prisma = createPrismaClient();
    try {
        await prisma.adminAuditLog.create({
            data: { adminId, action: `export-${kind}`, targetType: "PLATFORM", targetId: kind, after: { filters: { ...filters }, rows: count } },
        });
    } finally { await prisma.$disconnect(); }
}

export async function exportUsers(filters: AdminUserFilters) {
    const admin = await getAdminUser();
    if (!admin) throw new AdminAccessError();
    const db = createPgReader();
    const rows = await db.$queryRaw<{
        firstName: string | null; lastName: string | null; email: string; phone: string; status: string;
        emailVerified: boolean; phoneVerified: boolean; businesses: string | null; createdAt: Date; lastLoginAt: Date | null;
    }[]>(sql`
        SELECT u."firstName", u."lastName", u.email, u.phone, u.status::text AS status,
            u."emailVerifiedAt" IS NOT NULL AS "emailVerified", u."phoneVerifiedAt" IS NOT NULL AS "phoneVerified",
            (SELECT string_agg(b.name, ', ' ORDER BY m."createdAt") FROM "BusinessMembership" m JOIN "Business" b ON b.id = m."businessId" WHERE m."userId" = u.id) AS businesses,
            u."createdAt", (SELECT max(se."createdAt") FROM "Session" se WHERE se."userId" = u.id) AS "lastLoginAt"
        FROM "User" u WHERE ${userWhere(filters)}
        ORDER BY u."createdAt" DESC, u.id
        LIMIT ${EXPORT_LIMIT}
    `).finally(() => db.$disconnect());
    const data = rows.map(row => ({
        "სახელი": row.firstName ?? "",
        "გვარი": row.lastName ?? "",
        "ელფოსტა": row.email,
        "ტელეფონი": row.phone,
        "სტატუსი": USER_STATUS_LABELS[row.status] ?? row.status,
        "ელფოსტა დადასტურებული": yes(row.emailVerified),
        "ტელეფონი დადასტურებული": yes(row.phoneVerified),
        "ბიზნესები": row.businesses ?? "",
        "რეგისტრაცია": day(row.createdAt),
        "ბოლო შესვლა": day(row.lastLoginAt),
    }));
    await logExport(admin.id, "users", filters, data.length);
    return { sheet: "მომხმარებლები", rows: data, widths: [16, 18, 30, 16, 16, 12, 12, 30, 12, 12] } satisfies ExportSheet;
}

export async function exportBusinesses(filters: AdminBusinessFilters) {
    const admin = await getAdminUser();
    if (!admin) throw new AdminAccessError();
    const db = createPgReader();
    // Counts only, matching the admin pages' privacy promise: no order or customer contents.
    const rows = await db.$queryRaw<{
        name: string; mode: string; phone: string | null; email: string | null; ownerName: string | null; ownerEmail: string | null; ownerPhone: string | null;
        members: number; orders: number; customers: number; products: number; plan: string | null; subscriptionStatus: string | null;
        expiresAt: Date | null; createdAt: Date; lastOrderAt: Date | null;
    }[]>(sql`
        SELECT b.name, b.mode::text AS mode, b.phone, b.email,
            o.name AS "ownerName", o.email AS "ownerEmail", o.phone AS "ownerPhone",
            (SELECT count(*)::int FROM "BusinessMembership" m WHERE m."businessId" = b.id) AS members,
            (SELECT count(*)::int FROM "Order" x WHERE x."businessId" = b.id AND x."deletedAt" IS NULL) AS orders,
            (SELECT count(*)::int FROM "Customer" c WHERE c."businessId" = b.id) AS customers,
            (SELECT count(*)::int FROM "Product" p WHERE p."businessId" = b.id) AS products,
            s.plan::text AS plan, s.status::text AS "subscriptionStatus", s."expiresAt", b."createdAt",
            (SELECT max(x."createdAt") FROM "Order" x WHERE x."businessId" = b.id AND x."deletedAt" IS NULL) AS "lastOrderAt"
        FROM "Business" b
        LEFT JOIN "Subscription" s ON s."businessId" = b.id
        LEFT JOIN LATERAL (
            SELECT concat_ws(' ', u."firstName", u."lastName") AS name, u.email, u.phone
            FROM "BusinessMembership" m JOIN "User" u ON u.id = m."userId"
            WHERE m."businessId" = b.id AND m.role = 'OWNER' ORDER BY m."createdAt" LIMIT 1
        ) o ON true
        WHERE ${businessWhere(filters)}
        ORDER BY b."createdAt" DESC, b.id
        LIMIT ${EXPORT_LIMIT}
    `).finally(() => db.$disconnect());
    const data = rows.map(row => ({
        "სახელი": row.name,
        "ტიპი": BUSINESS_MODES.find(mode => mode.value === row.mode)?.label ?? row.mode,
        "ტელეფონი": row.phone ?? "",
        "ელფოსტა": row.email ?? "",
        "მფლობელი": row.ownerName ?? "",
        "მფლობელის ელფოსტა": row.ownerEmail ?? "",
        "მფლობელის ტელეფონი": row.ownerPhone ?? "",
        "წევრები": row.members,
        "შეკვეთები": row.orders,
        "კლიენტები": row.customers,
        "პროდუქტები": row.products,
        "პაკეტი": row.plan ?? "პაკეტის გარეშე",
        "პაკეტის სტატუსი": row.subscriptionStatus ? SUBSCRIPTION_STATUS_LABELS[row.subscriptionStatus] ?? row.subscriptionStatus : "",
        "პაკეტის ვადა": day(row.expiresAt),
        "შეიქმნა": day(row.createdAt),
        "ბოლო შეკვეთა": day(row.lastOrderAt),
    }));
    await logExport(admin.id, "businesses", filters, data.length);
    return { sheet: "ბიზნესები", rows: data, widths: [24, 12, 16, 26, 20, 28, 16, 9, 10, 10, 11, 14, 14, 13, 12, 13] } satisfies ExportSheet;
}
