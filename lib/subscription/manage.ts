import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { enforceTeamLimits } from "@/lib/business/team-manage";
import { priceForBusiness } from "./billing";
import { currentMonthlyPeriod } from "./period";
import { quotePlanChange, type CurrentPeriod } from "./plan-change";
import { planStateFrom } from "./plan-state";
import { INTERVAL_ADJECTIVES, INTERVAL_LABELS, isBillingInterval, isPaidTier, periodPrice, PLAN_ADJECTIVES, PLAN_LIMITS, type BillingInterval, type PaidTier } from "./plans";
import { applyPlanMode } from "./server";
import { notifyOwners } from "./notices";
import { formatDay } from "@/components/plans/billing-format";

type Tx = Prisma.TransactionClient;
type Db = PrismaClient | Tx;

export class PlanActionError extends Error {
    constructor(message: string, public status = 422) {
        super(message);
        this.name = "PlanActionError";
    }
}

const subscriptionSelect = { plan: true, status: true, expiresAt: true, currentPeriodStart: true, cancelAtPeriodEnd: true, billingInterval: true, startedAt: true } as const;

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

// მიმდინარე პერიოდი ნაშთის გამოსათვლელად. თუ გადახდა ჩაწერილია, ნაშთი მთელი გადახდილი თანხიდან
// და მისი პერიოდიდან ითვლება (მაგ. წელი ან 3 თვე ერთად). თუ გეგმა ხელით ჩაირთო გადახდის გარეშე,
// ნაშთი მხოლოდ მიმდინარე თვისაა, ამ ბიზნესის თვიური ფასით.
export async function readCurrentPeriod(db: Db, userId: string, businessId: string, row: SubscriptionRow | null, now = new Date()): Promise<CurrentPeriod> {
    const state = planStateFrom(row, now);
    const tier = state.tier;
    const interval = state.interval;
    if (!row || !tier || tier === "TRIAL") return { tier, interval, paid: 0, periodStart: null, expiresAt: row?.expiresAt ?? null };
    const payment = await db.subscriptionPayment.findFirst({
        where: { businessId, voidedAt: null, plan: tier, periodStart: { lte: now }, periodEnd: { gt: now } },
        orderBy: { paidAt: "desc" },
        select: { amount: true, periodStart: true, periodEnd: true },
    });
    if (payment) return { tier, interval, paid: Number(payment.amount), periodStart: payment.periodStart, expiresAt: payment.periodEnd };
    const month = currentMonthlyPeriod(row.currentPeriodStart ?? row.startedAt, row.expiresAt, now);
    return { tier, interval: "MONTHLY", paid: (await priceForBusiness(db, userId, businessId))[tier].price, periodStart: month.start, expiresAt: row.expiresAt ? month.end : null };
}

export async function quoteForBusiness(db: Db, userId: string, businessId: string, target: PaidTier, interval: BillingInterval = "MONTHLY", now = new Date()) {
    const row = await db.subscription.findUnique({ where: { businessId }, select: subscriptionSelect });
    const [current, prices] = await Promise.all([
        readCurrentPeriod(db, userId, businessId, row, now),
        priceForBusiness(db, userId, businessId),
    ]);
    const amount = periodPrice(prices[target].price, interval);
    return { quote: quotePlanChange(current, target, interval, amount, now), price: prices[target], amount, current };
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
        await notifyOwners(tx, {
            businessId, kind: "PLAN_CHANGED", key: `canceled:${businessId}:${Date.now()}`,
            title: "გეგმა გაუქმდა",
            body: after.expiresAt
                ? `თქვენი გეგმა ${formatDay(after.expiresAt.toISOString())}-მდე ჩვეულებრივ იმუშავებს, შემდეგ კი ბიზნესი მხოლოდ ნახვის რეჟიმში გადავა. თუ გადაიფიქრებთ, ვადის ამოწურვამდე მისი აღდგენა ნებისმიერ დროს შეგიძლიათ.`
                : "თქვენი გეგმა გაუქმდა. ყველა მონაცემი უსაფრთხოდ არის შენახული.",
        });
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
        await notifyOwners(tx, {
            businessId, kind: "PLAN_CHANGED", key: `resumed:${businessId}:${Date.now()}`,
            title: "გეგმა აღდგა", body: "გვიხარია, რომ ჩვენთან რჩებით! თქვენი გეგმა ჩვეულებრივ გაგრძელდება.",
        });
        return "გეგმა გაგრძელდა. შემდეგი გადახდა ჩვეულებრივ შესრულდება.";
    });
}

export type DowngradeMember = { id: string; name: string; isYou: boolean };
export type DowngradeContext = { mode: string; coOwners: DowngradeMember[]; staff: DowngradeMember[] };

// დაწევის ფანჯრისთვის: აქტიური თანამფლობელები (დამფუძნებლის გარდა) და თანამშრომლები, მიმართულება.
export async function readDowngradeContext(db: Db, businessId: string, userId: string): Promise<DowngradeContext> {
    const [business, members] = await Promise.all([
        db.business.findUnique({ where: { id: businessId }, select: { mode: true } }),
        db.businessMembership.findMany({
            where: { businessId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, role: true, status: true, userId: true, user: { select: { firstName: true, lastName: true, email: true } } },
        }),
    ]);
    const founderId = members.find(member => member.role === "OWNER")?.id;
    const view = (member: typeof members[number]): DowngradeMember => ({
        id: member.id, isYou: member.userId === userId,
        name: [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") || member.user.email,
    });
    const active = members.filter(member => member.status === "ACTIVE" && member.id !== founderId);
    return {
        mode: business?.mode ?? "IMPORT",
        coOwners: active.filter(member => member.role === "OWNER").map(view),
        staff: active.filter(member => member.role !== "OWNER").map(view),
    };
}

type DowngradeOptions = { keep?: unknown; mode?: unknown; interval?: unknown };

// ლიმიტს გადაცილებული გუნდიდან მფლობელი ირჩევს, ვინ დარჩეს; დანარჩენი იყინება (არ იშლება)
// და გეგმის აწევისას ბრუნდება. ზედმეტი მოლოდინში მყოფი მოწვევები უქმდება.
async function applyTeamChoice(tx: Tx, businessId: string, userId: string, target: PaidTier, keep: unknown) {
    const context = await readDowngradeContext(tx, businessId, userId);
    const limits = PLAN_LIMITS[target];
    const provided = Array.isArray(keep);
    const keepIds = new Set(provided ? keep.filter((id): id is string => typeof id === "string") : []);
    for (const [group, limit, label] of [[context.coOwners, limits.coOwners, "თანამფლობელი"], [context.staff, limits.staff, "თანამშრომელი"]] as const) {
        if (group.length <= limit) continue;
        const you = group.find(member => member.isYou);
        // გეგმაზე, სადაც თანამფლობელი არ შედის, გადასვლა მხოლოდ დამფუძნებელს შეუძლია (თავს ვერ გაყინავს).
        if (you && limit === 0) throw new PlanActionError("ამ გეგმაზე გადასვლა მხოლოდ ბიზნესის დამფუძნებელს შეუძლია.", 403);
        if (limit > 0 && !provided) throw new PlanActionError(`აირჩიეთ, რომელი ${label} დარჩეს.`);
        const kept = limit === 0 ? [] : group.filter(member => keepIds.has(member.id));
        if (kept.length > limit) throw new PlanActionError(`ახალ გეგმაში მაქსიმუმ ${limit} ${label} რჩება.`);
        if (you && !keepIds.has(you.id)) throw new PlanActionError("საკუთარი თავის გაყინვა არ შეიძლება: მონიშნეთ თქვენც.");
        const frozen = group.filter(member => !kept.includes(member)).map(member => member.id);
        await tx.businessMembership.updateMany({ where: { id: { in: frozen }, businessId }, data: { status: "FROZEN" } });
    }
    const pending = await tx.businessInvite.findMany({ where: { businessId, status: "PENDING" }, select: { id: true, role: true } });
    const coOwnersLeft = Math.min(context.coOwners.length, limits.coOwners);
    const staffLeft = Math.min(context.staff.length, limits.staff);
    const cancel = [
        ...pending.filter(invite => invite.role === "OWNER").slice(Math.max(0, limits.coOwners - coOwnersLeft)),
        ...pending.filter(invite => invite.role !== "OWNER").slice(Math.max(0, limits.staff - staffLeft)),
    ].map(invite => invite.id);
    if (cancel.length) await tx.businessInvite.updateMany({ where: { id: { in: cancel } }, data: { status: "CANCELED" } });
}

// დაბალ გეგმაზე (ან წლიურიდან თვიურზე) გადასვლა დღესვე: არაფერს იხდის, ნაშთი ახალი გეგმის დღეებად იქცევა
// და ვადა არ მოკლდება. უფრო ძვირ გეგმაზე ან წლიურზე გადასვლა გადახდით ხდება (გადახდის გვერდი).
export async function downgradePlan(prisma: PrismaClient, userId: string, businessId: string, target: unknown, options: DowngradeOptions = {}) {
    if (!isPaidTier(target)) throw new PlanActionError("გეგმა არასწორია.");
    return prisma.$transaction(async tx => {
        const before = await lockSubscription(tx, businessId);
        const now = new Date();
        const current = await readCurrentPeriod(tx, userId, businessId, before, now);
        if (!current.tier || current.tier === "TRIAL") throw new PlanActionError("ახალი გეგმის ჩასართავად გადახდაა საჭირო.", 409);
        const interval: BillingInterval = isBillingInterval(options.interval) ? options.interval : current.interval;
        if (current.tier === target && current.interval === interval) throw new PlanActionError("ეს უკვე თქვენი გეგმაა.", 409);
        // უვადო გეგმა (ადმინის ჩართული) ნაშთს არ ითვლის: უბრალოდ გეგმა იცვლება.
        const quote = before.expiresAt
            ? quotePlanChange(current, target, interval, periodPrice((await priceForBusiness(tx, userId, businessId))[target].price, interval), now)
            : null;
        if (quote && quote.kind !== "downgrade") throw new PlanActionError("უფრო ძვირ გეგმაზე გადასასვლელად გადახდაა საჭირო.", 409);
        // „ორივე“ მიმართულება Business-ზე არ შედის: მფლობელი ირჩევს იმპორტს ან წარმოებას.
        const business = await tx.business.findUnique({ where: { id: businessId }, select: { mode: true } });
        if (business?.mode === "HYBRID" && target === "BUSINESS") {
            if (options.mode !== "IMPORT" && options.mode !== "MANUFACTURING") throw new PlanActionError("აირჩიეთ მიმართულება: იმპორტი ან წარმოება.");
            await tx.business.update({ where: { id: businessId }, data: { mode: options.mode } });
        }
        await applyTeamChoice(tx, businessId, userId, target, options.keep);
        const after = await tx.subscription.update({
            where: { businessId },
            data: {
                plan: target, billingInterval: interval, status: "ACTIVE", cancelAtPeriodEnd: false, canceledAt: null,
                // იგივე გეგმა თვიურზე: ლიმიტების თვე არ იცვლება, ახალი პერიოდი ვადის ბოლოს დაიწყება.
                ...(current.tier === target ? {} : { currentPeriodStart: now }),
                ...(quote ? { expiresAt: new Date(quote.expiresAt) } : {}),
            },
            select: subscriptionSelect,
        });
        await audit(tx, businessId, userId, before, after);
        await applyPlanMode(tx, businessId, target);
        await enforceTeamLimits(tx, businessId);
        const sameTier = current.tier === target;
        const title = sameTier ? `გადახვედით ${INTERVAL_ADJECTIVES[interval]} გადახდაზე` : `გადახვედით ${PLAN_ADJECTIVES[target]} გეგმაზე`;
        await notifyOwners(tx, {
            businessId, kind: "PLAN_CHANGED", key: `downgraded:${businessId}:${Date.now()}`,
            title,
            body: sameTier && quote
                ? `მიმდინარე გეგმა ${formatDay(quote.expiresAt)}-მდე უცვლელად მოქმედებს, შემდეგ კი ${INTERVAL_LABELS[interval]} ფასით განახლდება.`
                : quote
                    ? `ახალი გეგმა უკვე მოქმედებს. დაუხარჯავი თანხა ${quote.days} დღეს ფარავს, ასე რომ გეგმა ${formatDay(quote.expiresAt)}-მდე აქტიურია.`
                    : "ახალი გეგმა უკვე მოქმედებს. ფუნქციები, რომლებიც მასში არ შედის, დროებით დაიკეტა, მონაცემები კი სრულად შენახულია.",
        });
        return sameTier && quote
            ? `${title}. მიმდინარე ვადა ${formatDay(quote.expiresAt)}-მდე უცვლელია.`
            : quote
                ? `${title}. ნაშთი ${quote.days} დღეს ფარავს.`
                : `${title}.`;
    });
}
