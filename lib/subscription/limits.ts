import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { featureMessage } from "./plan-access";
import { LOCK_MESSAGES, planAllows, planStateFrom, type PlanState } from "./plan-state";
import { FEATURE_MIN_TIER, PLAN_LIMITS, type PaidTier, type PlanFeature } from "./plans";

type Db = PrismaClient | Prisma.TransactionClient;

// გეგმის უარი სერვისის შიგნიდან (არა წვდომის ფენიდან). როუტი მას იმავე 402 ფორმით აბრუნებს,
// რომ კლიენტმა გეგმის ფანჯარა გახსნას.
export class PlanLimitError extends Error {
    constructor(
        message: string,
        public code: "PLAN_LOCKED" | "PLAN_FEATURE" | "PLAN_LIMIT",
        public feature: PlanFeature | null = null,
        public requiredTier: PaidTier | null = null,
    ) {
        super(message);
        this.name = "PlanLimitError";
    }

    toResponse() {
        return Response.json(
            { success: false, error: this.message, message: this.message, code: this.code, feature: this.feature, requiredTier: this.requiredTier },
            { status: 402, headers: { "Cache-Control": "private, no-store" } },
        );
    }
}

export const usagePeriodSelect = { plan: true, status: true, expiresAt: true, currentPeriodStart: true, cancelAtPeriodEnd: true, startedAt: true } as const;

// მიმდინარე პერიოდი ლიმიტებისთვის: გადახდის თარიღიდან (საცდელში — საცდელის დასაწყისიდან).
export async function readUsagePeriod(db: Db, businessId: string, now = new Date()) {
    const row = await db.subscription.findUnique({ where: { businessId }, select: usagePeriodSelect });
    const plan = planStateFrom(row, now);
    const start = row?.currentPeriodStart ?? row?.startedAt ?? now;
    return { plan, start, end: row?.expiresAt ?? null };
}

export function requireFeature(plan: PlanState, feature: PlanFeature) {
    if (plan.locked) throw new PlanLimitError(LOCK_MESSAGES[plan.lockReason ?? "NO_PLAN"], "PLAN_LOCKED");
    if (!planAllows(plan, feature)) throw new PlanLimitError(featureMessage(feature), "PLAN_FEATURE", feature, FEATURE_MIN_TIER[feature]);
}

// შემდეგი გეგმა, რომელიც ლიმიტს ზრდის.
const NEXT: Partial<Record<string, PaidTier>> = { TRIAL: "BUSINESS", START: "BUSINESS", BUSINESS: "PRO" };

export async function countPeriodOrders(db: Db, businessId: string, since: Date) {
    // წაშლილი შეკვეთაც ითვლება (ადგილს არ ათავისუფლებს); იმპორტირებული ძველი შეკვეთები — არა.
    return db.order.count({ where: { businessId, imported: false, createdAt: { gte: since } } });
}

// ახალი შეკვეთის წინ, ბიზნესის ჩაკეტილი სტრიქონის ქვეშ (ერთდროული შეკვეთები ლიმიტს ერთად ვერ გადალახავს).
export async function assertOrderAllowed(tx: Prisma.TransactionClient, businessId: string, items: readonly { source: string; imageUrl: string | null }[]) {
    const { plan, start } = await readUsagePeriod(tx, businessId);
    if (plan.locked) throw new PlanLimitError(LOCK_MESSAGES[plan.lockReason ?? "NO_PLAN"], "PLAN_LOCKED");
    if (items.some(item => item.source !== "MANUAL")) requireFeature(plan, "stock");
    if (items.some(item => item.imageUrl)) requireFeature(plan, "orderPhotos");
    const limit = plan.tier ? PLAN_LIMITS[plan.tier].ordersPerPeriod : null;
    if (limit === null) return;
    const used = await countPeriodOrders(tx, businessId, start);
    if (used >= limit) {
        const next = plan.tier ? NEXT[plan.tier] ?? null : null;
        throw new PlanLimitError(
            `ამ პერიოდის შეკვეთების ლიმიტი ამოიწურა (${used}/${limit}). მეტი შეკვეთისთვის გადადი უფრო დიდ გეგმაზე.`,
            "PLAN_LIMIT", null, next,
        );
    }
}
