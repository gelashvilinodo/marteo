import "server-only";
import { sql } from "@prisma/client-runtime-utils";
import { getAdminUser } from "./authorization";
import { AdminAccessError } from "./overview";
import { createPgReader } from "@/lib/database/pg-reader";
import { AI_MONTHLY_LIMITS } from "@/lib/ai/ai-quota";
import { planStateFrom } from "@/lib/subscription/plan-state";
import { EXPIRING_DAYS, INACTIVE_DAYS, LAPSED_DAYS, ONBOARDING_DAYS, RISK_KIND_KEYS, type RiskKind, type RiskSignal } from "./risk-signals-config";

export * from "./risk-signals-config";

// Businesses that may need a message from us. Computed from plan, dates and counts only, never from business records.
export type RiskBusiness = {
    id: string; name: string; plan: string; storedPlan: string | null; status: string | null; expiresAt: Date | null;
    createdAt: Date; lastOrderAt: Date | null; conversationId: string | null; signals: RiskSignal[];
};

type Row = {
    id: string; name: string; createdAt: Date; aiDisabled: boolean; aiMonthlyLimit: number | null;
    storedPlan: string | null; status: string | null; expiresAt: Date | null; canceledAt: Date | null;
    lastOrderAt: Date | null; aiUsed: number; conversationId: string | null;
};

const DAY = 86400000;
const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));
const ago = (days: number) => days === 0 ? "დღეს" : `${days} დღის წინ`;

// მოქმედი გეგმა იმავე წესით, რითაც მომხმარებელს ეკეტება (საცდელი = TRIAL, დაბლოკილი = FREE).
function effectivePlan(row: Row, now: Date) {
    if (!row.storedPlan || !row.status) return "FREE";
    return planStateFrom({ plan: row.storedPlan, status: row.status, expiresAt: row.expiresAt }, now).tier ?? "FREE";
}

function classify(row: Row, now: Date): RiskSignal[] {
    const signals: RiskSignal[] = [];
    const plan = effectivePlan(row, now);
    const paidStored = row.storedPlan !== null && row.storedPlan !== "FREE" && !row.canceledAt;
    const trial = row.status === "TRIALING";
    if (paidStored && row.expiresAt) {
        const ended = row.expiresAt <= now;
        if (ended && row.expiresAt.getTime() > now.getTime() - LAPSED_DAYS * DAY && row.status !== "CANCELED")
            signals.push({ kind: "lapsed", detail: `${trial ? "საცდელი" : row.storedPlan} დასრულდა ${ago(daysBetween(row.expiresAt, now))}` });
        if (!ended && (row.status === "ACTIVE" || trial) && row.expiresAt.getTime() <= now.getTime() + EXPIRING_DAYS * DAY) {
            const left = Math.ceil((row.expiresAt.getTime() - now.getTime()) / DAY);
            signals.push({ kind: "expiring", detail: `${trial ? "საცდელი" : row.storedPlan} იწურება ${left <= 1 ? "24 საათში" : `${left} დღეში`}` });
        }
    }
    const limit = row.aiMonthlyLimit ?? AI_MONTHLY_LIMITS[plan as keyof typeof AI_MONTHLY_LIMITS] ?? AI_MONTHLY_LIMITS.FREE;
    if (!row.aiDisabled && limit > 0 && row.aiUsed >= limit) signals.push({ kind: "ai-limit", detail: `${plan === "TRIAL" ? "საცდელში" : "ამ პერიოდში"} ${row.aiUsed}/${limit}` });
    const age = daysBetween(row.createdAt, now);
    const onboarding = !row.lastOrderAt && age >= ONBOARDING_DAYS.from && age <= ONBOARDING_DAYS.to;
    if (onboarding) signals.push({ kind: "onboarding", detail: `დარეგისტრირდა ${ago(age)}` });
    const lastActivity = row.lastOrderAt ?? row.createdAt;
    if (!onboarding && plan !== "FREE" && daysBetween(lastActivity, now) >= INACTIVE_DAYS)
        signals.push({ kind: "inactive", detail: row.lastOrderAt ? `ბოლო შეკვეთა ${ago(daysBetween(row.lastOrderAt, now))}` : "შეკვეთა ჯერ არ აქვს" });
    return signals.sort((a, b) => RISK_KIND_KEYS.indexOf(a.kind) - RISK_KIND_KEYS.indexOf(b.kind));
}

async function readRows(businessId: string | null) {
    const db = createPgReader();
    try {
        return await db.withReadTransaction(tx => tx.$queryRaw<Row[]>`
            SELECT b.id, b.name, b."createdAt", b."aiDisabled", b."aiMonthlyLimit",
                s.plan::text AS "storedPlan", s.status::text AS status, s."expiresAt", s."canceledAt",
                (SELECT max(o."createdAt") FROM "Order" o WHERE o."businessId" = b.id AND o."deletedAt" IS NULL) AS "lastOrderAt",
                -- კითხვები გადახდის პერიოდში; საცდელში ფაილიდან შესყიდვაც კითხვად ითვლება.
                (SELECT count(*) FROM "AiUsage" a WHERE a."businessId" = b.id AND a.counted
                    AND (a.kind = 'CHAT' OR s.status = 'TRIALING')
                    AND a."createdAt" >= coalesce(s."currentPeriodStart", s."startedAt", b."createdAt"))::int AS "aiUsed",
                c.id AS "conversationId"
            FROM "Business" b
            LEFT JOIN "Subscription" s ON s."businessId" = b.id
            LEFT JOIN "SupportConversation" c ON c."businessId" = b.id
            WHERE ${businessId === null ? sql`TRUE` : sql`b.id = ${businessId}`}
        `);
    } finally { await db.$disconnect(); }
}

function toBusiness(row: Row, now: Date, signals: RiskSignal[]): RiskBusiness {
    return {
        id: row.id, name: row.name, plan: effectivePlan(row, now), storedPlan: row.storedPlan, status: row.status, expiresAt: row.expiresAt,
        createdAt: row.createdAt, lastOrderAt: row.lastOrderAt, conversationId: row.conversationId, signals,
    };
}

export async function getRiskSignals(kind: RiskKind | "") {
    if (!await getAdminUser()) throw new AdminAccessError();
    const now = new Date();
    const flagged = (await readRows(null))
        .map(row => toBusiness(row, now, classify(row, now)))
        .filter(business => business.signals.length > 0);
    const counts = Object.fromEntries(RISK_KIND_KEYS.map(key => [key, 0])) as Record<RiskKind, number>;
    for (const business of flagged) for (const signal of business.signals) counts[signal.kind]++;
    const rank = (business: RiskBusiness) => RISK_KIND_KEYS.indexOf(business.signals[0].kind);
    const businesses = flagged
        .filter(business => !kind || business.signals.some(signal => signal.kind === kind))
        .sort((a, b) => rank(a) - rank(b) || (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0) || a.name.localeCompare(b.name));
    return { total: flagged.length, counts, businesses };
}

/** Signals for one business, for the support chat's side panel. The caller checks admin access. */
export async function getBusinessRiskSignals(businessId: string) {
    const now = new Date();
    const [row] = await readRows(businessId);
    return row ? toBusiness(row, now, classify(row, now)) : null;
}
