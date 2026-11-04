import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { AdminActionError } from "./actions";

// გადაუხდელი ბიზნესის მონაცემები 12 თვე ინახება. წაშლას ადმინი ხელით ადასტურებს (ავტომატური წაშლა არ არის);
// მფლობელები 30 და 7 დღით ადრე გაფრთხილებას იღებენ (deliverRetentionWarnings, საათობრივი cron).
export const RETENTION_MONTHS = 12;
export const RETENTION_WARNING_DAYS = [30, 7] as const;
// სიაში ჩანს ბიზნესი, რომელსაც წაშლამდე ამდენი დღე ან ნაკლები დარჩა.
export const RETENTION_LIST_DAYS = 90;

type Db = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;

// დაბლოკილია, თუ მოქმედი საცდელი ან ფასიანი გეგმა არ აქვს. დაბლოკვის დღე: ვადის ბოლო,
// ხოლო გეგმა თუ არასდროს ჰქონია (მაგ. დამატებითი ბიზნესი გადახდამდე) — ბიზნესის შექმნა.
const LOCKED = Prisma.sql`NOT (
    (s.status = 'TRIALING' AND s."expiresAt" > now() AT TIME ZONE 'UTC')
    OR (s.status = 'ACTIVE' AND s.plan <> 'FREE' AND (s."expiresAt" IS NULL OR s."expiresAt" > now() AT TIME ZONE 'UTC'))
)`;
const LOCKED_SINCE = Prisma.sql`coalesce(CASE WHEN s.plan = 'FREE' AND s.status = 'ACTIVE' THEN NULL ELSE s."expiresAt" END, b."createdAt")`;
const DELETE_AT = Prisma.sql`(${LOCKED_SINCE} + make_interval(months => ${RETENTION_MONTHS}::int))`;

export type RetentionBusiness = {
    id: string; name: string; plan: string; status: string; lockedSince: Date; deleteAt: Date;
    owners: string; orders: number; customers: number;
    // ვადა გავიდა (წაშლა შეიძლება), დარჩენილი დღეები და გადაუხდელი თვეები.
    due: boolean; daysLeft: number; monthsUnpaid: number;
};

export async function listRetention(db: Db, now = new Date()): Promise<RetentionBusiness[]> {
    return db.$queryRaw<RetentionBusiness[]>`
        SELECT b.id, b.name, s.plan::text AS plan, s.status::text AS status,
            ${LOCKED_SINCE} AS "lockedSince", ${DELETE_AT} AS "deleteAt",
            coalesce((SELECT string_agg(u.email, ', ' ORDER BY m."createdAt") FROM "BusinessMembership" m JOIN "User" u ON u.id = m."userId"
                WHERE m."businessId" = b.id AND m.role = 'OWNER'), '') AS owners,
            (SELECT count(*)::int FROM "Order" o WHERE o."businessId" = b.id AND o."deletedAt" IS NULL) AS orders,
            (SELECT count(*)::int FROM "Customer" c WHERE c."businessId" = b.id) AS customers,
            ${DELETE_AT} <= ${now} AS due,
            ceil(extract(epoch FROM ${DELETE_AT} - ${now}::timestamp) / 86400)::int AS "daysLeft",
            floor(extract(epoch FROM ${now}::timestamp - ${LOCKED_SINCE}) / 2592000)::int AS "monthsUnpaid"
        FROM "Business" b JOIN "Subscription" s ON s."businessId" = b.id
        WHERE ${LOCKED} AND ${DELETE_AT} <= ${new Date(now.getTime() + RETENTION_LIST_DAYS * 86_400_000)}
        ORDER BY ${DELETE_AT} ASC
    `;
}

// 30 და 7 დღით ადრე: მფლობელებს შეტყობინება (აპი + მეილი + პუში); თითო ეტაპზე ერთხელ.
export async function deliverRetentionWarnings(db: Db, now = new Date()) {
    for (const days of RETENTION_WARNING_DAYS) {
        await db.$executeRaw`
            INSERT INTO "Notification" (id, "userId", "businessId", kind, title, body, "actionLabel", "actionUrl", "dedupeKey", "deliverAt", "createdAt")
            SELECT gen_random_uuid()::text, m."userId", b.id, 'RENEWAL_REMINDER'::"NotificationKind",
                ${`მონაცემები ${days} დღეში წაიშლება`},
                'ბიზნესი „' || b.name || '“ ' || ${RETENTION_MONTHS - 1} || ' თვეზე მეტია გადაუხდელია. თუ '
                    || to_char((${DELETE_AT} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tbilisi', 'DD.MM.YYYY')
                    || '-მდე გეგმას არ აირჩევ, ბიზნესი და მისი მონაცემები წაიშლება.',
                'გეგმის არჩევა', '/dashboard/plans',
                ${`retention:${days}:`} || b.id || ':' || to_char(${LOCKED_SINCE}, 'YYYYMMDD') || ':' || m."userId",
                ${now}, ${now}
            FROM "Business" b JOIN "Subscription" s ON s."businessId" = b.id
            JOIN "BusinessMembership" m ON m."businessId" = b.id AND m.role = 'OWNER' AND m.status = 'ACTIVE'
            WHERE ${LOCKED} AND ${DELETE_AT} > ${now} AND ${DELETE_AT} <= ${new Date(now.getTime() + days * 86_400_000)}
            ON CONFLICT ("dedupeKey") DO NOTHING
        `;
    }
}

// წაშლა მხოლოდ მაშინ, როცა 12 თვე გავიდა და ადმინმა ბიზნესის სახელი ზუსტად აკრიფა.
// ყველაფერი (შეკვეთები, მარაგი, მომხმარებლები...) კასკადურად იშლება; ადმინის ისტორია და წევრების შეტყობინება რჩება.
export async function deleteRetainedBusiness(prisma: PrismaClient, adminId: string, businessId: unknown, confirmName: unknown) {
    if (typeof businessId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(businessId)) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
    return prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
        const [row] = await tx.$queryRaw<{ name: string; deleteAt: Date; locked: boolean; plan: string; status: string }[]>`
            SELECT b.name, ${DELETE_AT} AS "deleteAt", ${LOCKED} AS locked, s.plan::text AS plan, s.status::text AS status
            FROM "Business" b JOIN "Subscription" s ON s."businessId" = b.id WHERE b.id = ${businessId}
        `;
        if (!row) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
        if (!row.locked || row.deleteAt > new Date()) throw new AdminActionError("ამ ბიზნესის წაშლის დრო ჯერ არ დამდგარა.", 409);
        if (typeof confirmName !== "string" || confirmName.trim() !== row.name.trim()) throw new AdminActionError("დასადასტურებლად ზუსტად აკრიფე ბიზნესის სახელი.");
        const members = await tx.businessMembership.findMany({ where: { businessId }, select: { userId: true } });
        await tx.business.delete({ where: { id: businessId } });
        await tx.adminAuditLog.create({
            data: { adminId, action: "business-delete", targetType: "BUSINESS", targetId: businessId, before: { name: row.name, plan: row.plan, status: row.status }, after: { reason: "retention" } },
        });
        // შეტყობინება ბიზნესზე არ მიება, რომ წაშლას გადაურჩეს.
        for (const member of members) {
            await tx.notification.create({
                data: {
                    userId: member.userId, kind: "ANNOUNCEMENT", title: "ბიზნესი წაიშალა",
                    body: `ბიზნესი „${row.name}“ ${RETENTION_MONTHS} თვე გადაუხდელი იყო და მისი მონაცემები წაიშალა.`,
                    dedupeKey: `business-retention-deleted:${businessId}:${member.userId}`,
                },
            });
        }
        return `ბიზნესი „${row.name}“ წაიშალა.`;
    });
}
