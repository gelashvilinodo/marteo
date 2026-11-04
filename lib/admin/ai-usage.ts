import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { sql } from "@prisma/client-runtime-utils";
import { getAdminUser } from "./authorization";
import { AdminAccessError } from "./overview";
import { AdminActionError } from "./actions";
import { createPgReader } from "@/lib/database/pg-reader";
import { AI_MONTHLY_LIMITS, tbilisiMonthStart } from "@/lib/ai/ai-quota";
import { getAiQuota } from "@/lib/ai/ai-usage";

// Token counts and estimated cost only: questions and answers are never stored here.
export type AiUsageStats = {
    month: { cost: number; requests: number; failed: number; titles: number; inputTokens: number; outputTokens: number; businesses: number };
    lastMonthCost: number;
    byKind: { kind: string; requests: number; cost: number }[];
    days: { day: string; cost: number; requests: number }[];
    top: { id: string | null; name: string; requests: number; cost: number; limit: number; disabled: boolean }[];
};

const DAYS = 30;

// Same rule as readPlan: an ended or unpaid plan counts as FREE; a running trial has its own limit.
const effectiveLimit = sql`coalesce(b."aiMonthlyLimit", CASE
    WHEN s.status = 'TRIALING' AND (s."expiresAt" IS NULL OR s."expiresAt" > now() AT TIME ZONE 'UTC') THEN ${AI_MONTHLY_LIMITS.TRIAL}::int
    WHEN s.status = 'ACTIVE' AND (s."expiresAt" IS NULL OR s."expiresAt" > now() AT TIME ZONE 'UTC') THEN
        CASE s.plan::text WHEN 'START' THEN ${AI_MONTHLY_LIMITS.START}::int WHEN 'BUSINESS' THEN ${AI_MONTHLY_LIMITS.BUSINESS}::int
            WHEN 'PRO' THEN ${AI_MONTHLY_LIMITS.PRO}::int ELSE ${AI_MONTHLY_LIMITS.FREE}::int END
    ELSE ${AI_MONTHLY_LIMITS.FREE}::int END)`;

export async function getAiUsageStats(): Promise<AiUsageStats> {
    if (!await getAdminUser()) throw new AdminAccessError();
    const now = new Date();
    const monthStart = tbilisiMonthStart(now);
    const lastMonthStart = tbilisiMonthStart(new Date(monthStart.getTime() - 86400000));
    const chartStart = new Date(new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" }).format(now)}T00:00:00+04:00`).getTime() - (DAYS - 1) * 86400000);
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            const [month] = await tx.$queryRaw<AiUsageStats["month"][]>`
                SELECT coalesce(sum("costUsd"), 0)::float AS cost,
                    count(*) FILTER (WHERE counted)::int AS requests,
                    count(*) FILTER (WHERE failed)::int AS failed,
                    count(*) FILTER (WHERE kind = 'TITLE')::int AS titles,
                    coalesce(sum("inputTokens" + "cacheReadTokens" + "cacheWriteTokens"), 0)::float AS "inputTokens",
                    coalesce(sum("outputTokens"), 0)::float AS "outputTokens",
                    count(DISTINCT "businessId")::int AS businesses
                FROM "AiUsage" WHERE "createdAt" >= ${monthStart}
            `;
            const [{ cost: lastMonthCost }] = await tx.$queryRaw<{ cost: number }[]>`
                SELECT coalesce(sum("costUsd"), 0)::float AS cost FROM "AiUsage" WHERE "createdAt" >= ${lastMonthStart} AND "createdAt" < ${monthStart}
            `;
            const byKind = await tx.$queryRaw<AiUsageStats["byKind"]>`
                SELECT kind::text AS kind, count(*)::int AS requests, coalesce(sum("costUsd"), 0)::float AS cost
                FROM "AiUsage" WHERE "createdAt" >= ${monthStart} GROUP BY 1 ORDER BY 3 DESC
            `;
            const daily = await tx.$queryRaw<AiUsageStats["days"]>`
                SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tbilisi')::date, 'YYYY-MM-DD') AS day,
                    coalesce(sum("costUsd"), 0)::float AS cost, count(*) FILTER (WHERE counted)::int AS requests
                FROM "AiUsage" WHERE "createdAt" >= ${chartStart} GROUP BY 1
            `;
            const top = await tx.$queryRaw<AiUsageStats["top"]>(sql`
                SELECT u."businessId" AS id, coalesce(b.name, max(u."businessName")) AS name,
                    count(*) FILTER (WHERE u.counted)::int AS requests, coalesce(sum(u."costUsd"), 0)::float AS cost,
                    ${effectiveLimit}::int AS limit, coalesce(b."aiDisabled", false) AS disabled
                FROM "AiUsage" u
                LEFT JOIN "Business" b ON b.id = u."businessId"
                LEFT JOIN "Subscription" s ON s."businessId" = b.id
                WHERE u."createdAt" >= ${monthStart}
                GROUP BY u."businessId", b.id, s.id
                ORDER BY cost DESC
                LIMIT 20
            `);
            const byDay = new Map(daily.map(row => [row.day, row]));
            const days = Array.from({ length: DAYS }, (_, index) => {
                const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi" }).format(new Date(chartStart.getTime() + index * 86400000 + 12 * 3600000));
                return { day, cost: byDay.get(day)?.cost ?? 0, requests: byDay.get(day)?.requests ?? 0 };
            });
            return { month, lastMonthCost, byKind, days, top };
        });
    } finally { await db.$disconnect(); }
}

export type BusinessAiView = {
    used: number; limit: number; planLimit: number; custom: boolean; disabled: boolean; plan: string;
    monthCost: number; totalCost: number; lastUsedAt: string | null;
};

export async function getBusinessAi(prisma: PrismaClient | Prisma.TransactionClient, businessId: string): Promise<BusinessAiView> {
    const now = new Date();
    const [quota, month, total] = await Promise.all([
        getAiQuota(prisma, businessId, now),
        prisma.aiUsage.aggregate({ where: { businessId, createdAt: { gte: tbilisiMonthStart(now) } }, _sum: { costUsd: true } }),
        prisma.aiUsage.aggregate({ where: { businessId }, _sum: { costUsd: true }, _max: { createdAt: true } }),
    ]);
    return {
        used: quota.used, limit: quota.limit, custom: quota.custom, disabled: quota.disabled, plan: quota.plan,
        planLimit: AI_MONTHLY_LIMITS[quota.plan as keyof typeof AI_MONTHLY_LIMITS] ?? AI_MONTHLY_LIMITS.FREE,
        monthCost: Number(month._sum.costUsd ?? 0), totalCost: Number(total._sum.costUsd ?? 0),
        lastUsedAt: total._max.createdAt?.toISOString() ?? null,
    };
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function updateBusinessAi(prisma: PrismaClient, adminId: string, businessId: unknown, input: { disabled?: unknown; monthlyLimit?: unknown }) {
    if (typeof businessId !== "string" || !ID.test(businessId)) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
    if (typeof input.disabled !== "boolean") throw new AdminActionError("მნიშვნელობა არასწორია.");
    let monthlyLimit: number | null = null;
    if (input.monthlyLimit !== null && input.monthlyLimit !== "" && input.monthlyLimit !== undefined) {
        monthlyLimit = Number(input.monthlyLimit);
        if (!Number.isInteger(monthlyLimit) || monthlyLimit < 0 || monthlyLimit > 100000) throw new AdminActionError("ლიმიტი 0-დან 100000-მდე მთელი რიცხვი უნდა იყოს.");
    }
    return prisma.$transaction(async tx => {
        const before = await tx.business.findUnique({ where: { id: businessId }, select: { aiDisabled: true, aiMonthlyLimit: true } });
        if (!before) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
        if (before.aiDisabled === input.disabled && before.aiMonthlyLimit === monthlyLimit) throw new AdminActionError("ცვლილება არ არის.", 409);
        await tx.business.update({ where: { id: businessId }, data: { aiDisabled: input.disabled as boolean, aiMonthlyLimit: monthlyLimit } });
        await tx.adminAuditLog.create({
            data: {
                adminId, action: "ai-settings", targetType: "BUSINESS", targetId: businessId,
                before: { disabled: before.aiDisabled, monthlyLimit: before.aiMonthlyLimit },
                after: { disabled: input.disabled as boolean, monthlyLimit },
            },
        });
        return { message: input.disabled ? "მართეო AI ამ ბიზნესისთვის გამოირთო." : "AI-ის პარამეტრები შეინახა.", ai: await getBusinessAi(tx, businessId) };
    });
}
