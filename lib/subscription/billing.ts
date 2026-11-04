import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getAiQuota } from "@/lib/ai/ai-usage";
import { getSmsUsage, type SmsUsage } from "@/lib/sms/order-sms";
import { readUsagePeriod } from "./limits";
import { planStateFrom, type PlanState } from "./plan-state";
import { discountedPrice, PLAN_LIMITS, PLAN_PRICES, type PaidTier } from "./plans";

type Db = PrismaClient | Prisma.TransactionClient;

export type TierPrice = { tier: PaidTier; price: number; full: number; discounted: boolean };

// დამატებითი ბიზნესი -25%: სრულ ფასს იხდის მომხმარებლის ყველაზე ძვირი აქტიური ბიზნეს/PRO გეგმა,
// დანარჩენი ფასდაკლებულია. თუ ეს ბიზნესი ყველაზე ძვირ გეგმას იღებს, ის ხდება სრულფასიანი.
export async function priceForBusiness(db: Db, userId: string, businessId: string): Promise<Record<PaidTier, TierPrice>> {
    const others = await db.subscription.findMany({
        where: {
            businessId: { not: businessId },
            business: { memberships: { some: { userId, role: "OWNER", status: "ACTIVE" } } },
        },
        select: { plan: true, status: true, expiresAt: true },
    });
    const anchor = Math.max(0, ...others
        .map(row => planStateFrom(row).tier)
        .filter((tier): tier is "BUSINESS" | "PRO" => tier === "BUSINESS" || tier === "PRO")
        .map(tier => PLAN_PRICES[tier]));
    const price = (tier: PaidTier): TierPrice => {
        const discounted = anchor > 0 && PLAN_PRICES[tier] <= anchor;
        return { tier, full: PLAN_PRICES[tier], price: discounted ? discountedPrice(tier) : PLAN_PRICES[tier], discounted };
    };
    return { START: price("START"), BUSINESS: price("BUSINESS"), PRO: price("PRO") };
}

export type BillingPayment = { id: string; plan: string; amount: string; paidAt: string; periodStart: string; periodEnd: string; method: string };

export type BillingOverview = {
    plan: PlanState;
    // ლიმიტების მიმდინარე თვიური პერიოდი (გეგმის ვადა შეიძლება უფრო გრძელი იყოს).
    period: { start: string; end: string | null };
    usage: {
        orders: { used: number; limit: number | null };
        ai: { used: number; limit: number };
        // null: ულიმიტო; shared: საცდელში ფაილი კითხვებში ითვლება.
        aiFiles: { used: number; limit: number | null; shared: boolean };
        sms: SmsUsage;
        team: { coOwners: number; staff: number; coOwnersLimit: number; staffLimit: number };
    };
    payments: BillingPayment[];
    prices: Record<PaidTier, TierPrice>;
};

export async function getBillingOverview(db: Db, userId: string, businessId: string): Promise<BillingOverview> {
    const now = new Date();
    const row = await db.subscription.findUnique({
        where: { businessId },
        select: { plan: true, status: true, expiresAt: true, currentPeriodStart: true, cancelAtPeriodEnd: true, startedAt: true },
    });
    const plan = planStateFrom(row, now);
    const limits = plan.tier ? PLAN_LIMITS[plan.tier] : null;
    const period = await readUsagePeriod(db, businessId, now);
    const periodStart = period.start;
    const [orders, ai, owners, staff, payments, prices, sms] = await Promise.all([
        db.order.count({ where: { businessId, imported: false, createdAt: { gte: periodStart } } }),
        getAiQuota(db, businessId, now),
        db.businessMembership.count({ where: { businessId, status: "ACTIVE", role: "OWNER" } }),
        db.businessMembership.count({ where: { businessId, status: "ACTIVE", role: { in: ["ADMIN", "MEMBER"] } } }),
        db.subscriptionPayment.findMany({
            where: { businessId, voidedAt: null },
            orderBy: { paidAt: "desc" },
            take: 24,
            select: { id: true, plan: true, amount: true, paidAt: true, periodStart: true, periodEnd: true, method: true },
        }),
        priceForBusiness(db, userId, businessId),
        getSmsUsage(db, businessId, now),
    ]);
    return {
        plan,
        period: { start: period.start.toISOString(), end: period.end?.toISOString() ?? null },
        usage: {
            orders: { used: orders, limit: limits ? limits.ordersPerPeriod : 0 },
            ai: { used: ai.used, limit: ai.limit },
            aiFiles: ai.files,
            sms,
            team: { coOwners: Math.max(0, owners - 1), staff, coOwnersLimit: limits?.coOwners ?? 0, staffLimit: limits?.staff ?? 0 },
        },
        payments: payments.map(payment => ({
            id: payment.id, plan: payment.plan, amount: payment.amount.toFixed(2), method: payment.method,
            paidAt: payment.paidAt.toISOString(), periodStart: payment.periodStart.toISOString(), periodEnd: payment.periodEnd.toISOString(),
        })),
        prices,
    };
}
