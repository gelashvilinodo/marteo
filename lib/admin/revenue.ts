import "server-only";
import { getAdminUser } from "./authorization";
import { AdminAccessError } from "./overview";
import { createPgReader } from "@/lib/database/pg-reader";

// Our own billing data (manually recorded payments), not business records. Voided payments never count.
export type RevenueStats = {
    mrr: number; paying: number; total: number;
    months: { month: string; amount: number; payments: number }[];
    lapsed: { id: string | null; name: string; plan: string; endedAt: Date }[];
    lapsedCount: number;
};

const MONTHS = 12;
const LAPSE_DAYS = 30;

const tbilisiMonth = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi", year: "numeric", month: "2-digit" }).format(date);

export async function getRevenueStats(): Promise<RevenueStats> {
    if (!await getAdminUser()) throw new AdminAccessError();
    const now = new Date();
    const lapseStart = new Date(now.getTime() - LAPSE_DAYS * 86400000);
    const [year, month] = tbilisiMonth(now).split("-").map(Number);
    const firstMonth = new Date(`${new Date(Date.UTC(year, month - MONTHS, 1)).toISOString().slice(0, 7)}-01T00:00:00+04:00`);
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            // MRR: each payment spread evenly over its months, counted while its period runs.
            const [current] = await tx.$queryRaw<{ mrr: number; paying: number }[]>`
                SELECT coalesce(sum(amount / months), 0)::float AS mrr, count(DISTINCT "businessId")::int AS paying
                FROM "SubscriptionPayment"
                WHERE "voidedAt" IS NULL AND "periodStart" <= ${now} AND "periodEnd" > ${now}
            `;
            const [{ total }] = await tx.$queryRaw<{ total: number }[]>`
                SELECT coalesce(sum(amount), 0)::float AS total FROM "SubscriptionPayment" WHERE "voidedAt" IS NULL
            `;
            const monthly = await tx.$queryRaw<{ month: string; amount: number; payments: number }[]>`
                SELECT to_char("paidAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tbilisi', 'YYYY-MM') AS month,
                    sum(amount)::float AS amount, count(*)::int AS payments
                FROM "SubscriptionPayment"
                WHERE "voidedAt" IS NULL AND "paidAt" >= ${firstMonth}
                GROUP BY 1
            `;
            // Lapsed: the last paid period ended in the past 30 days and nothing paid runs now.
            const lapsed = await tx.$queryRaw<(RevenueStats["lapsed"][number] & { count: number })[]>`
                WITH last AS (
                    SELECT DISTINCT ON (coalesce("businessId", id)) "businessId" AS id, "businessName" AS name, plan::text AS plan, "periodEnd" AS "endedAt"
                    FROM "SubscriptionPayment" WHERE "voidedAt" IS NULL
                    ORDER BY coalesce("businessId", id), "periodEnd" DESC
                )
                SELECT l.id, coalesce(b.name, l.name) AS name, l.plan, l."endedAt", count(*) OVER ()::int AS count
                FROM last l LEFT JOIN "Business" b ON b.id = l.id
                WHERE l."endedAt" > ${lapseStart} AND l."endedAt" <= ${now}
                ORDER BY l."endedAt" DESC
                LIMIT 10
            `;
            const byMonth = new Map(monthly.map(row => [row.month, row]));
            const months = Array.from({ length: MONTHS }, (_, index) => {
                const key = new Date(Date.UTC(year, month - MONTHS + index, 1)).toISOString().slice(0, 7);
                return { month: key, amount: byMonth.get(key)?.amount ?? 0, payments: byMonth.get(key)?.payments ?? 0 };
            });
            return {
                mrr: current?.mrr ?? 0, paying: current?.paying ?? 0, total, months,
                lapsed: lapsed.map(row => ({ id: row.id, name: row.name, plan: row.plan, endedAt: row.endedAt })),
                lapsedCount: lapsed[0]?.count ?? 0,
            };
        });
    } finally { await db.$disconnect(); }
}
