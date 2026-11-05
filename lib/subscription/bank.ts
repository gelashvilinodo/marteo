import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getAppOrigin } from "@/lib/auth/send-password-reset-email";
import { enforceTeamLimits } from "@/lib/business/team-manage";
import { notifyPaymentConfirmed } from "@/lib/notifications/sync";
import {
    BogError, bogConfigured, chargeSavedCard, createBogOrder, deleteSavedCard, getBogReceipt, saveCardForSubscription, type BogReceipt,
} from "@/lib/payments/bog";
import { priceForBusiness } from "./billing";
import { PlanActionError, quoteForBusiness } from "./manage";
import { notifyOwners, notifyPaymentFailed, queueNoticeChannels } from "./notices";
import { addBillingMonths } from "./period";
import { isPaidTier, PLAN_ADJECTIVES, PLAN_LABELS, type PaidTier } from "./plans";
import { applyPlanMode } from "./server";

const DAY = 86_400_000;
const HOUR = 3_600_000;
// ავტოგანახლება: ვადამდე 2 საათით ადრე, მერე 1 და 3 დღის შემდეგ. ამის შემდეგ მფლობელი ხელით იხდის.
const RENEWAL_ATTEMPTS_AT = [-2 * HOUR, DAY, 3 * DAY];
// ამაზე ძველი პასუხგაუცემელი მცდელობის სტატუსს ბანკს თავად ვეკითხებით (callback შეიძლება დაიკარგოს).
const POLL_AFTER_MS = 5 * 60_000;

// გადახდის დაწყება: ბანკში იქმნება შეკვეთა, ბარათი ავტოგანახლებისთვის ინახება და მომხმარებელი
// ბანკის გვერდზე გადადის. გეგმა მხოლოდ დადასტურებული გადახდის შემდეგ ირთვება (applyBankReceipt).
export async function startCheckout(prisma: PrismaClient, userId: string, businessId: string, target: unknown) {
    if (!isPaidTier(target)) throw new PlanActionError("გეგმა არასწორია.");
    if (!bogConfigured()) throw new PlanActionError("ბარათით გადახდა დროებით მიუწვდომელია. სცადეთ მოგვიანებით.", 503);
    const { quote } = await quoteForBusiness(prisma, userId, businessId, target);
    if (quote.kind === "downgrade") throw new PlanActionError("დაბალ გეგმაზე გადასვლას გადახდა არ სჭირდება.", 409);
    if (quote.amountDue <= 0) throw new PlanActionError("გადასახდელი თანხა არასწორია.", 409);
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
    const row = await prisma.bankPayment.create({
        data: { businessId, userId, kind: "CHECKOUT", plan: target, amount: quote.amountDue.toFixed(2), bonusDays: quote.kind === "upgrade" ? quote.days : 0 },
        select: { id: true },
    });
    const back = `${getAppOrigin()}/dashboard/billing?payment=${row.id}`;
    try {
        const order = await createBogOrder({
            externalOrderId: row.id,
            amount: quote.amountDue,
            itemId: `plan-${target.toLowerCase()}`,
            description: `MARTEO ${PLAN_LABELS[target]} - ${business?.name ?? ""}`.slice(0, 120),
            successUrl: back,
            failUrl: back,
            idempotencyKey: randomUUID(),
        });
        await prisma.bankPayment.update({ where: { id: row.id }, data: { bankOrderId: order.orderId } });
        await saveCardForSubscription(order.orderId);
        return order.redirectUrl;
    } catch (error) {
        await prisma.bankPayment.update({ where: { id: row.id }, data: { status: "REJECTED", bankStatus: "request_failed" } });
        console.error("BOG checkout failed", error instanceof BogError ? `${error.message} ${error.status}` : error instanceof Error ? error.name : "UnknownError");
        throw new PlanActionError("ბანკთან დაკავშირება ვერ მოხერხდა. სცადეთ ხელახლა.", 502);
    }
}

// ბანკის პასუხის (callback, დაბრუნება ან cron) დამუშავება. სტატუსი ყოველთვის ბანკის API-დან მოდის.
// განმეორებით გამოძახება უსაფრთხოა: გადახდა მხოლოდ ერთხელ აღირიცხება.
export async function applyBankReceipt(prisma: PrismaClient, receipt: BogReceipt) {
    const row = await prisma.bankPayment.findUnique({ where: { bankOrderId: receipt.order_id } });
    if (!row || row.status !== "PENDING") return row?.status ?? null;
    const status = receipt.order_status?.key ?? "";
    const cardMask = receipt.payment_detail?.payer_identifier?.slice(-8) ?? null;
    if (status === "completed") {
        const paid = Number(receipt.purchase_units?.transfer_amount ?? receipt.purchase_units?.request_amount ?? 0);
        if (Math.abs(paid - Number(row.amount)) > 0.009) {
            console.error("BOG paid amount mismatch", row.id);
            await prisma.bankPayment.update({ where: { id: row.id }, data: { bankStatus: "amount_mismatch" } });
            return "PENDING";
        }
        await completePayment(prisma, row.id, cardMask);
        return "COMPLETED";
    }
    if (status === "rejected") {
        await rejectPayment(prisma, row.id, status, cardMask);
        return "REJECTED";
    }
    if (status && status !== row.bankStatus) await prisma.bankPayment.update({ where: { id: row.id }, data: { bankStatus: status } });
    return "PENDING";
}

export async function syncBankOrder(prisma: PrismaClient, bankOrderId: string) {
    return applyBankReceipt(prisma, await getBogReceipt(bankOrderId));
}

async function completePayment(prisma: PrismaClient, id: string, cardMask: string | null) {
    const replacedCard = await prisma.$transaction(async tx => {
        const row = await tx.bankPayment.findUniqueOrThrow({ where: { id } });
        if (!row.businessId || !isPaidTier(row.plan)) {
            await tx.bankPayment.update({ where: { id }, data: { status: "COMPLETED", bankStatus: "completed", completedAt: new Date(), cardMask } });
            return null;
        }
        const businessId = row.businessId;
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
        // სხვა პროცესმა (callback/cron) უკვე დაამუშავა.
        const claimed = await tx.bankPayment.updateMany({ where: { id, status: "PENDING" }, data: { status: "COMPLETED", bankStatus: "completed", completedAt: new Date(), cardMask } });
        if (!claimed.count) return null;
        const now = new Date();
        const plan = row.plan as PaidTier;
        const business = await tx.business.findUniqueOrThrow({
            where: { id: businessId },
            select: { name: true, subscription: { select: { plan: true, status: true, expiresAt: true, bankCardOrderId: true } } },
        });
        const before = business.subscription;
        let start = now, end: Date;
        if (row.kind === "RENEWAL" && before?.expiresAt && before.expiresAt.getTime() > now.getTime() - 7 * DAY) {
            // განახლება ძველი ვადიდან გრძელდება, რომ გადახდის დღე არ გადაიწიოს.
            start = before.expiresAt;
            end = addBillingMonths(start, 1);
            if (end <= now) { start = now; end = addBillingMonths(now, 1); }
        } else {
            end = new Date(addBillingMonths(now, 1).getTime() + row.bonusDays * DAY);
        }
        const payment = await tx.subscriptionPayment.create({
            data: {
                businessId, businessName: business.name, plan, amount: row.amount, method: "CARD", months: 1, paidAt: now,
                periodStart: start, periodEnd: end, note: `საქართველოს ბანკი${cardMask ? ` · ${cardMask}` : ""}`, createdById: null,
            },
            select: { id: true },
        });
        await tx.bankPayment.update({ where: { id }, data: { subscriptionPaymentId: payment.id } });
        const card = row.kind === "CHECKOUT" ? { bankCardOrderId: row.bankOrderId, bankCardAmount: row.amount, bankCardMask: cardMask } : {};
        const after = await tx.subscription.upsert({
            where: { businessId },
            create: { businessId, plan, status: "ACTIVE", startedAt: now, expiresAt: end, currentPeriodStart: start, ...card },
            update: { plan, status: "ACTIVE", expiresAt: end, currentPeriodStart: start, canceledAt: null, cancelAtPeriodEnd: false, ...card },
            select: { plan: true, status: true, expiresAt: true },
        });
        await tx.adminAuditLog.create({
            data: {
                adminId: null, action: "payment-bank", targetType: "BUSINESS", targetId: businessId,
                before: before ? { plan: before.plan, status: before.status, expiresAt: before.expiresAt?.toISOString() ?? null } : undefined,
                after: { plan: after.plan, status: after.status, expiresAt: after.expiresAt?.toISOString() ?? null, paymentId: payment.id, amount: row.amount.toFixed(2), kind: row.kind },
            },
        });
        await applyPlanMode(tx, businessId, plan);
        await enforceTeamLimits(tx, businessId);
        await notifyPaymentConfirmed(tx, { businessId, plan, paymentId: payment.id, now });
        // ახალი ბარათი ძველს ცვლის: ძველს ბანკშიც ვშლით.
        return row.kind === "CHECKOUT" && before?.bankCardOrderId && before.bankCardOrderId !== row.bankOrderId ? before.bankCardOrderId : null;
    });
    const row = await prisma.bankPayment.findUnique({ where: { id }, select: { businessId: true } });
    if (row?.businessId) void queueNoticeChannels(row.businessId);
    if (replacedCard) await deleteSavedCard(replacedCard).catch(() => console.error("BOG old card delete failed"));
}

async function rejectPayment(prisma: PrismaClient, id: string, bankStatus: string, cardMask: string | null) {
    await prisma.$transaction(async tx => {
        const claimed = await tx.bankPayment.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", bankStatus, completedAt: new Date(), cardMask } });
        if (!claimed.count) return;
        const row = await tx.bankPayment.findUniqueOrThrow({ where: { id } });
        // ხელით გადახდის უარს მომხმარებელი გვერდზე ხედავს; ავტოგანახლების უარზე ვატყობინებთ (ერთხელ თითო ვადაზე).
        if (row.kind === "RENEWAL" && row.businessId) {
            await notifyPaymentFailed(tx, { businessId: row.businessId, attemptId: `${row.businessId}:${row.renewsExpiresAt?.toISOString() ?? id}`, plan: PLAN_LABELS[row.plan as PaidTier] ?? row.plan });
        }
    });
    const row = await prisma.bankPayment.findUnique({ where: { id }, select: { businessId: true, kind: true } });
    if (row?.kind === "RENEWAL" && row.businessId) void queueNoticeChannels(row.businessId);
}

// დაბრუნების გვერდისთვის: მომხმარებელს ვაჩვენებთ მხოლოდ საკუთარი ბიზნესის გადახდას.
export async function readCheckoutResult(prisma: PrismaClient, businessId: string, id: string) {
    const row = await prisma.bankPayment.findFirst({ where: { id, businessId }, select: { id: true, status: true, bankOrderId: true, plan: true, amount: true } });
    if (!row) return null;
    let status = row.status;
    if (status === "PENDING" && row.bankOrderId && bogConfigured()) {
        status = await syncBankOrder(prisma, row.bankOrderId).catch(() => "PENDING" as const) as typeof status;
    }
    return { status, plan: row.plan, amount: row.amount.toFixed(2) };
}

// საათობრივი cron: ვადაზე მისული გეგმების ჩამოჭრა შენახული ბარათიდან და დაკარგული პასუხების გადამოწმება.
export async function runBankRenewals(prisma: PrismaClient, now = new Date()) {
    if (!bogConfigured()) return { charged: 0, synced: 0 };
    let synced = 0;
    const pending = await prisma.bankPayment.findMany({
        where: { status: "PENDING", bankOrderId: { not: null }, createdAt: { lt: new Date(now.getTime() - POLL_AFTER_MS), gt: new Date(now.getTime() - 2 * DAY) } },
        select: { bankOrderId: true }, take: 100,
    });
    for (const row of pending) {
        try { if (await syncBankOrder(prisma, row.bankOrderId!) !== "PENDING") synced++; }
        catch { console.error("BOG receipt sync failed"); }
    }

    let charged = 0;
    const due = await prisma.subscription.findMany({
        where: {
            plan: { in: ["START", "BUSINESS", "PRO"] }, status: { in: ["ACTIVE", "PAST_DUE"] }, cancelAtPeriodEnd: false,
            bankCardOrderId: { not: null },
            expiresAt: { lte: new Date(now.getTime() - RENEWAL_ATTEMPTS_AT[0]), gt: new Date(now.getTime() - 4 * DAY) },
        },
        select: { businessId: true, plan: true, expiresAt: true, bankCardOrderId: true, bankCardAmount: true },
        take: 200,
    });
    for (const sub of due) {
        try { if (await renewOne(prisma, sub, now)) charged++; }
        catch { console.error("BOG renewal failed"); }
    }
    return { charged, synced };
}

type DueSubscription = { businessId: string; plan: string; expiresAt: Date | null; bankCardOrderId: string | null; bankCardAmount: Prisma.Decimal | null };

async function renewOne(prisma: PrismaClient, sub: DueSubscription, now: Date) {
    if (!sub.expiresAt || !sub.bankCardOrderId || !sub.bankCardAmount || !isPaidTier(sub.plan)) return false;
    const attempts = await prisma.bankPayment.findMany({
        where: { businessId: sub.businessId, kind: "RENEWAL", renewsExpiresAt: sub.expiresAt },
        select: { status: true },
    });
    if (attempts.some(attempt => attempt.status !== "REJECTED")) return false;
    const next = RENEWAL_ATTEMPTS_AT[attempts.length];
    if (next === undefined || now.getTime() < sub.expiresAt.getTime() + next) return false;

    // ბანკი შენახულ ბარათზე პირველი გადახდის თანხას ჩამოჭრის. თუ ფასი შეიცვალა (მაგ. დაბალ გეგმაზე გადასვლა),
    // ავტომატურად აღარ ვიხდით: მფლობელი ერთხელ ხელით იხდის და ბარათი ახალ თანხაზე ინახება.
    const owner = await prisma.businessMembership.findFirst({
        where: { businessId: sub.businessId, role: "OWNER", status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { userId: true },
    });
    const price = owner ? (await priceForBusiness(prisma, owner.userId, sub.businessId))[sub.plan].price : null;
    if (price === null || Math.abs(price - Number(sub.bankCardAmount)) > 0.009) {
        if (now >= sub.expiresAt) {
            const created = await notifyOwners(prisma, {
                businessId: sub.businessId, kind: "PAYMENT_FAILED", key: `card-amount:${sub.businessId}:${sub.expiresAt.toISOString()}`,
                title: "გეგმის განახლება ხელით გადახდას საჭიროებს",
                body: `${PLAN_ADJECTIVES[sub.plan]} გეგმის ფასი შეიცვალა, ამიტომ შენახული ბარათიდან ავტომატურად ვერ ჩამოიჭრება. გადაიხადეთ ერთხელ ბარათით და შემდეგი თვეები ისევ ავტომატურად განახლდება.`,
                actionLabel: "გადახდა", actionUrl: `/dashboard/plans/checkout?plan=${sub.plan.toLowerCase()}`,
            });
            if (created) void queueNoticeChannels(sub.businessId);
        }
        return false;
    }

    const business = await prisma.business.findUnique({ where: { id: sub.businessId }, select: { id: true } });
    if (!business) return false;
    const row = await prisma.bankPayment.create({
        data: {
            businessId: sub.businessId, kind: "RENEWAL", plan: sub.plan, amount: sub.bankCardAmount,
            parentOrderId: sub.bankCardOrderId, renewsExpiresAt: sub.expiresAt,
        },
        select: { id: true },
    });
    try {
        const orderId = await chargeSavedCard(sub.bankCardOrderId, row.id, randomUUID());
        await prisma.bankPayment.update({ where: { id: row.id }, data: { bankOrderId: orderId } });
    } catch (error) {
        console.error("BOG renewal charge failed", error instanceof BogError ? `${error.message} ${error.status}` : "UnknownError");
        await rejectPayment(prisma, row.id, "request_failed", null);
        return false;
    }
    return true;
}
