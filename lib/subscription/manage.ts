import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { enforceTeamLimits } from "@/lib/business/team-manage";
import { priceForBusiness } from "./billing";
import { quotePlanChange, type CurrentPeriod } from "./plan-change";
import { planStateFrom } from "./plan-state";
import { isPaidTier, PLAN_ADJECTIVES, type PaidTier } from "./plans";
import { applyPlanMode } from "./server";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

export class PlanActionError extends Error {
    constructor(message: string, public status = 422) {
        super(message);
        this.name = "PlanActionError";
    }
}

const subscriptionSelect = { plan: true, status: true, expiresAt: true, currentPeriodStart: true, cancelAtPeriodEnd: true, startedAt: true } as const;

type SubscriptionRow = Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelect }>;

const view = (row: { plan: string; status: string; expiresAt: Date | null; cancelAtPeriodEnd?: boolean }) =>
    ({ plan: row.plan, status: row.status, expiresAt: row.expiresAt?.toISOString() ?? null, cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false });

// მფლობელის ქმედება ადმინის ისტორიაში ჩანს (adminId ცარიელია, ავტორი კი ცვლილებაშია).
function audit(tx: Tx, businessId: string, userId: string, before: SubscriptionRow, after: SubscriptionRow) {
    return tx.adminAuditLog.create({
        data: {
            adminId: null, action: "subscription-user", targetType: "BUSINESS", targetId: businessId,
            before: view(before) as Prisma.InputJsonValue,
            after: { ...view(after), byUserId: userId } as Prisma.InputJsonValue,
        },
    });
}

async function lockSubscription(tx: Tx, businessId: string) {
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
    const row = await tx.subscription.findUnique({ where: { businessId }, select: subscriptionSelect });
    if (!row) throw new PlanActionError("ბიზნესს გეგმა არ აქვს.", 409);
    return row;
}

// მიმდინარე პერიოდი ნაშთის გამოსათვლელად: გადახდილი თანხა ბოლო გადახდიდან,
// ან, თუ გეგმა ხელით ჩაირთო, ამ ბიზნესის თვიური ფასი.
export async function readCurrentPeriod(db: Db, userId: string, businessId: string, row: SubscriptionRow | null, now = new Date()): Promise<CurrentPeriod> {
    const state = planStateFrom(row, now);
    const tier = state.tier;
    if (!row || !tier || tier === "TRIAL") return { tier, paid: 0, periodStart: null, expiresAt: row?.expiresAt ?? null };
    const payment = await db.subscriptionPayment.findFirst({
        where: { businessId, voidedAt: null, periodStart: { lte: now }, periodEnd: { gt: now } },
        orderBy: { paidAt: "desc" },
        select: { amount: true, months: true },
    });
    const paid = payment
        ? Number(payment.amount) / Math.max(1, payment.months)
        : (await priceForBusiness(db, userId, businessId))[tier].price;
    return { tier, paid, periodStart: row.currentPeriodStart ?? row.startedAt, expiresAt: row.expiresAt };
}

export async function quoteForBusiness(db: Db, userId: string, businessId: string, target: PaidTier, now = new Date()) {
    const row = await db.subscription.findUnique({ where: { businessId }, select: subscriptionSelect });
    const [current, prices] = await Promise.all([
        readCurrentPeriod(db, userId, businessId, row, now),
        priceForBusiness(db, userId, businessId),
    ]);
    return { quote: quotePlanChange(current, target, prices[target].price, now), price: prices[target], current };
}

// გაუქმება: გეგმა გადახდილი პერიოდის ბოლომდე მოქმედებს, მერე ბიზნესი მხოლოდ ნახვის რეჟიმში გადადის.
export async function cancelPlan(prisma: PrismaClient, userId: string, businessId: string) {
    return prisma.$transaction(async tx => {
        const before = await lockSubscription(tx, businessId);
        const state = planStateFrom(before);
        if (!state.tier || state.tier === "TRIAL") throw new PlanActionError("გასაუქმებელი ფასიანი გეგმა არ არის.", 409);
        if (before.cancelAtPeriodEnd) throw new PlanActionError("გეგმა უკვე გაუქმებულია.", 409);
        const after = await tx.subscription.update({
            where: { businessId }, data: { cancelAtPeriodEnd: true, canceledAt: new Date() }, select: subscriptionSelect,
        });
        await audit(tx, businessId, userId, before, after);
        return after.expiresAt
            ? "გეგმა გაუქმდა. ის გადახდილი პერიოდის ბოლომდე მოქმედებს."
            : "გეგმა გაუქმდა.";
    });
}

// ვადის ბოლომდე გაუქმება შეიძლება, დამატებითი გადახდის გარეშე.
export async function resumePlan(prisma: PrismaClient, userId: string, businessId: string) {
    return prisma.$transaction(async tx => {
        const before = await lockSubscription(tx, businessId);
        if (!before.cancelAtPeriodEnd || planStateFrom(before).locked) throw new PlanActionError("გეგმა გაუქმებული არ არის.", 409);
        const after = await tx.subscription.update({
            where: { businessId }, data: { cancelAtPeriodEnd: false, canceledAt: null }, select: subscriptionSelect,
        });
        await audit(tx, businessId, userId, before, after);
        return "გეგმა გაგრძელდა. შემდეგი გადახდა ჩვეულებრივ შესრულდება.";
    });
}

// დაბალ გეგმაზე გადასვლა დღესვე: არაფერს იხდის, ნაშთი ახალი გეგმის დღეებად იქცევა.
// უფრო ძვირ გეგმაზე გადასვლა გადახდით ხდება (გადახდის გვერდი).
export async function downgradePlan(prisma: PrismaClient, userId: string, businessId: string, target: unknown) {
    if (!isPaidTier(target)) throw new PlanActionError("გეგმა არასწორია.");
    return prisma.$transaction(async tx => {
        const before = await lockSubscription(tx, businessId);
        const now = new Date();
        const current = await readCurrentPeriod(tx, userId, businessId, before, now);
        if (!current.tier || current.tier === "TRIAL") throw new PlanActionError("ახალი გეგმის ჩასართავად გადახდაა საჭირო.", 409);
        if (current.tier === target) throw new PlanActionError("ეს უკვე შენი გეგმაა.", 409);
        // უვადო გეგმა (ადმინის ჩართული) ნაშთს არ ითვლის: უბრალოდ გეგმა იცვლება.
        const quote = before.expiresAt
            ? quotePlanChange(current, target, (await priceForBusiness(tx, userId, businessId))[target].price, now)
            : null;
        if (quote && quote.kind !== "downgrade") throw new PlanActionError("უფრო ძვირ გეგმაზე გადასასვლელად გადახდაა საჭირო.", 409);
        const after = await tx.subscription.update({
            where: { businessId },
            data: {
                plan: target, status: "ACTIVE", currentPeriodStart: now, cancelAtPeriodEnd: false, canceledAt: null,
                ...(quote ? { expiresAt: new Date(quote.expiresAt) } : {}),
            },
            select: subscriptionSelect,
        });
        await audit(tx, businessId, userId, before, after);
        await applyPlanMode(tx, businessId, target);
        await enforceTeamLimits(tx, businessId);
        return quote
            ? `გადახვედი ${PLAN_ADJECTIVES[target]} გეგმაზე. ნაშთი ${quote.days} დღეს ფარავს.`
            : `გადახვედი ${PLAN_ADJECTIVES[target]} გეგმაზე.`;
    });
}
