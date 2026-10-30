import "server-only";
import { getAdminUser } from "./authorization";
import { AdminAccessError, getTbilisiDay } from "./overview";
import { createPgReader } from "@/lib/database/pg-reader";

// Aggregates only (counts and dates): the security page promises the team does
// not browse business records. The platform admin is left out of user counts.
export type GrowthRange = "30" | "90" | "all";

export function parseGrowthRange(value: string | string[] | undefined): GrowthRange {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw === "90" || raw === "all" ? raw : "30";
}

export type GrowthStats = {
    days: { day: string; users: number; businesses: number }[];
    funnel: { registered: number; verified: number; withBusiness: number; withOrder: number };
    activity: { total: number; ordered7: number; ordered30: number; active7: number; active30: number };
    plans: { plan: string; count: number }[];
    renewals: { id: string; name: string; plan: string; status: string; expiresAt: Date; overdue: boolean }[];
};

const CHART_DAYS = 30;

// Prisma stores UTC "timestamp without time zone"; days are counted in Tbilisi.
export async function getGrowthStats(range: GrowthRange): Promise<GrowthStats> {
    if (!await getAdminUser()) throw new AdminAccessError();
    const today = getTbilisiDay();
    const chartStart = new Date(today.start.getTime() - (CHART_DAYS - 1) * 86400000);
    const rangeStart = range === "all" ? new Date(0) : new Date(today.end.getTime() - Number(range) * 86400000);
    const now = new Date();
    const week = new Date(now.getTime() - 7 * 86400000);
    const month = new Date(now.getTime() - 30 * 86400000);
    const soon = new Date(now.getTime() + 7 * 86400000);
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            const userDays = await tx.$queryRaw<{ day: string; count: number }[]>`
                SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tbilisi')::date, 'YYYY-MM-DD') AS day, count(*)::int AS count
                FROM "User" WHERE "createdAt" >= ${chartStart} AND to_jsonb("User")->>'isPlatformAdmin' IS DISTINCT FROM 'true'
                GROUP BY 1
            `;
            const businessDays = await tx.$queryRaw<{ day: string; count: number }[]>`
                SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tbilisi')::date, 'YYYY-MM-DD') AS day, count(*)::int AS count
                FROM "Business" WHERE "createdAt" >= ${chartStart}
                GROUP BY 1
            `;
            const [funnel] = await tx.$queryRaw<GrowthStats["funnel"][]>`
                SELECT count(*)::int AS registered,
                    count(*) FILTER (WHERE u."emailVerifiedAt" IS NOT NULL AND u."phoneVerifiedAt" IS NOT NULL)::int AS verified,
                    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "BusinessMembership" m WHERE m."userId" = u.id))::int AS "withBusiness",
                    count(*) FILTER (WHERE EXISTS (
                        SELECT 1 FROM "BusinessMembership" m JOIN "Order" o ON o."businessId" = m."businessId"
                        WHERE m."userId" = u.id AND o."deletedAt" IS NULL
                    ))::int AS "withOrder"
                FROM "User" u
                WHERE u."createdAt" >= ${rangeStart} AND to_jsonb(u)->>'isPlatformAdmin' IS DISTINCT FROM 'true'
            `;
            const [activity] = await tx.$queryRaw<GrowthStats["activity"][]>`
                WITH signals AS (
                    SELECT b.id,
                        (SELECT max(o."createdAt") FROM "Order" o WHERE o."businessId" = b.id AND o."deletedAt" IS NULL) AS "lastOrder",
                        (SELECT max(se."createdAt") FROM "Session" se JOIN "BusinessMembership" m ON m."userId" = se."userId" WHERE m."businessId" = b.id) AS "lastLogin"
                    FROM "Business" b
                )
                SELECT count(*)::int AS total,
                    count(*) FILTER (WHERE "lastOrder" >= ${week})::int AS ordered7,
                    count(*) FILTER (WHERE "lastOrder" >= ${month})::int AS ordered30,
                    count(*) FILTER (WHERE "lastOrder" >= ${week} OR "lastLogin" >= ${week})::int AS active7,
                    count(*) FILTER (WHERE "lastOrder" >= ${month} OR "lastLogin" >= ${month})::int AS active30
                FROM signals
            `;
            const plans = await tx.$queryRaw<GrowthStats["plans"]>`
                SELECT coalesce(s.plan::text, 'NONE') AS plan, count(*)::int AS count
                FROM "Business" b LEFT JOIN "Subscription" s ON s."businessId" = b.id
                GROUP BY 1
            `;
            // Plans ending within a week, plus ones already past their date but still marked current.
            const renewals = await tx.$queryRaw<GrowthStats["renewals"]>`
                SELECT b.id, b.name, s.plan::text AS plan, s.status::text AS status, s."expiresAt", s."expiresAt" < ${now} AS overdue
                FROM "Subscription" s JOIN "Business" b ON b.id = s."businessId"
                WHERE s."expiresAt" IS NOT NULL AND s."expiresAt" <= ${soon} AND s.status IN ('ACTIVE', 'TRIALING', 'PAST_DUE')
                ORDER BY s."expiresAt"
                LIMIT 20
            `;

            const users = new Map(userDays.map(row => [row.day, row.count]));
            const businesses = new Map(businessDays.map(row => [row.day, row.count]));
            const days = Array.from({ length: CHART_DAYS }, (_, index) => {
                const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" })
                    .format(new Date(chartStart.getTime() + index * 86400000 + 12 * 3600000));
                return { day, users: users.get(day) ?? 0, businesses: businesses.get(day) ?? 0 };
            });
            const order = ["FREE", "START", "BUSINESS", "PRO", "NONE"];
            return {
                days,
                funnel: funnel ?? { registered: 0, verified: 0, withBusiness: 0, withOrder: 0 },
                activity: activity ?? { total: 0, ordered7: 0, ordered30: 0, active7: 0, active30: 0 },
                plans: order.map(plan => ({ plan, count: plans.find(row => row.plan === plan)?.count ?? 0 })),
                renewals,
            };
        });
    } finally { await db.$disconnect(); }
}
