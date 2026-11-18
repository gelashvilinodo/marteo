import "server-only";
import { createHash } from "crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AdminActionError } from "./actions";
import { listPayments, type AdminPayment } from "./payments";
import { BogError, bogConfigured, deleteSavedCard, refundBogOrder } from "@/lib/payments/bog";
import { syncBankOrder } from "@/lib/subscription/bank";
import { enforceTeamLimits } from "@/lib/business/team-manage";
import { planStateFrom } from "@/lib/subscription/plan-state";
import { applyPlanMode } from "@/lib/subscription/server";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export type AdminBankAttempt = {
    id: string; kind: "CHECKOUT" | "RENEWAL" | "SMS_PACK"; status: "PENDING" | "COMPLETED" | "REJECTED";
    plan: string; interval: string; amount: string; bankStatus: string | null; cardMask: string | null;
    hasBankOrder: boolean; refundedAmount: string; refundedAt: string | null;
    createdAt: string; completedAt: string | null; renewsExpiresAt: string | null; smsCount: number | null;
};

export type AdminBankCard = { mask: string | null; amount: string | null; interval: string; autoRenew: boolean } | null;

export type BankPanelData = { attempts: AdminBankAttempt[]; card: AdminBankCard; configured: boolean };

function key(value: unknown, message: string) {
    if (typeof value !== "string" || !ID.test(value)) throw new AdminActionError(message, 404);
    return value;
}

export async function getBankPanel(prisma: PrismaClient | Prisma.TransactionClient, businessId: string): Promise<BankPanelData> {
    const [rows, subscription] = await Promise.all([
        prisma.bankPayment.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 50 }),
        prisma.subscription.findUnique({ where: { businessId }, select: { bankCardOrderId: true, bankCardMask: true, bankCardAmount: true, billingInterval: true, cancelAtPeriodEnd: true } }),
    ]);
    return {
        configured: bogConfigured(),
        card: subscription?.bankCardOrderId ? {
            mask: subscription.bankCardMask, amount: subscription.bankCardAmount?.toFixed(2) ?? null,
            interval: subscription.billingInterval, autoRenew: !subscription.cancelAtPeriodEnd,
        } : null,
        attempts: rows.map(row => ({
            id: row.id, kind: row.kind, status: row.status, plan: row.plan, interval: row.interval, amount: row.amount.toFixed(2),
            bankStatus: row.bankStatus, cardMask: row.cardMask, hasBankOrder: Boolean(row.bankOrderId),
            refundedAmount: row.refundedAmount.toFixed(2), refundedAt: row.refundedAt?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null,
            renewsExpiresAt: row.renewsExpiresAt?.toISOString() ?? null, smsCount: row.smsCount,
        })),
    };
}

async function panelResult(prisma: PrismaClient, businessId: string, message: string): Promise<{ message: string; bank: BankPanelData; payments: AdminPayment[] }> {
    const [bank, payments] = await Promise.all([getBankPanel(prisma, businessId), listPayments(prisma, businessId)]);
    return { message, bank, payments };
}

/** Asks the bank for the current status of one attempt (a lost callback leaves it PENDING). */
export async function syncBankPayment(prisma: PrismaClient, businessId: unknown, attemptId: unknown) {
    const business = key(businessId, "ბიზნესი ვერ მოიძებნა.");
    const id = key(attemptId, "გადახდა ვერ მოიძებნა.");
    const row = await prisma.bankPayment.findFirst({ where: { id, businessId: business }, select: { bankOrderId: true, status: true } });
    if (!row) throw new AdminActionError("გადახდა ვერ მოიძებნა.", 404);
    if (!row.bankOrderId) throw new AdminActionError("ეს მცდელობა ბანკამდე არ მისულა, შესამოწმებელი არაფერია.", 409);
    if (!bogConfigured()) throw new AdminActionError("ბანკის გასაღებები არ არის დაყენებული.", 503);
    let status: string | null;
    try {
        status = await syncBankOrder(prisma, row.bankOrderId);
    } catch (error) {
        console.error("BOG admin sync failed", error instanceof BogError ? `${error.message} ${error.status}` : "UnknownError");
        throw new AdminActionError("ბანკმა ვერ უპასუხა. სცადეთ ცოტა ხანში.", 502);
    }
    const text = status === "COMPLETED" ? "ბანკი: გადახდა წარმატებულია." : status === "REJECTED" ? "ბანკი: გადახდა უარყოფილია." : "ბანკი ჯერ საბოლოო პასუხს არ იძლევა.";
    return panelResult(prisma, business, text);
}

// ბანკი Idempotency-Key-ად UUID v4-ს ელის. ერთი და იგივე მცდელობისთვის გასაღები ყოველთვის ერთია,
// ამიტომ ორჯერ დაჭერა ან ხელახლა ცდა თანხას ორჯერ ვერ დააბრუნებს.
function refundKey(id: string) {
    const hex = createHash("sha256").update(`marteo-refund:${id}`).digest("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Full refund of one completed card payment. The linked revenue record is voided; with endPlan the business
 * also loses the plan right away and the saved card is removed, so nothing renews.
 */
export async function refundBankPayment(prisma: PrismaClient, adminId: string, businessId: unknown, attemptId: unknown, input: { reason?: unknown; endPlan?: unknown }) {
    const business = key(businessId, "ბიზნესი ვერ მოიძებნა.");
    const id = key(attemptId, "გადახდა ვერ მოიძებნა.");
    const reason = typeof input.reason === "string" ? input.reason.trim().slice(0, 300) : "";
    if (!reason) throw new AdminActionError("მიუთითეთ დაბრუნების მიზეზი.");
    if (!bogConfigured()) throw new AdminActionError("ბანკის გასაღებები არ არის დაყენებული.", 503);

    const row = await prisma.bankPayment.findFirst({ where: { id, businessId: business } });
    if (!row) throw new AdminActionError("გადახდა ვერ მოიძებნა.", 404);
    if (row.status !== "COMPLETED" || !row.bankOrderId) throw new AdminActionError("დაბრუნება მხოლოდ წარმატებულ გადახდაზეა შესაძლებელი.", 409);
    // SMS პაკეტის დაბრუნება გეგმას არ ეხება: ნაშთს მხოლოდ ჯერ დაუხარჯავი SMS აკლდება.
    const smsPack = row.kind === "SMS_PACK";
    const endPlan = !smsPack && input.endPlan === true;

    // ჯერ ვიკავებთ (ორი ადმინი ან ორი დაჭერა ერთდროულად ვერ დააბრუნებს), მერე ბანკს ვთხოვთ.
    const claimed = await prisma.bankPayment.updateMany({
        where: { id, status: "COMPLETED", refundedAt: null },
        data: { refundedAmount: row.amount, refundedAt: new Date(), bankStatus: "refund_requested" },
    });
    if (!claimed.count) throw new AdminActionError("ამ გადახდის თანხა უკვე დაბრუნებულია.", 409);
    try {
        await refundBogOrder(row.bankOrderId, refundKey(id));
    } catch (error) {
        await prisma.bankPayment.update({ where: { id }, data: { refundedAmount: 0, refundedAt: null, bankStatus: row.bankStatus } });
        console.error("BOG refund failed", error instanceof BogError ? `${error.message} ${error.status}` : "UnknownError");
        throw new AdminActionError("ბანკმა დაბრუნება ვერ მიიღო. არაფერი შეცვლილა, სცადეთ ცოტა ხანში.", 502);
    }

    const removeCard = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${business} FOR UPDATE`;
        const now = new Date();
        if (row.subscriptionPaymentId) {
            await tx.subscriptionPayment.updateMany({
                where: { id: row.subscriptionPaymentId, voidedAt: null },
                data: { voidedAt: now, voidedById: adminId, voidReason: `თანხა დაბრუნდა ბარათზე: ${reason}`.slice(0, 300) },
            });
        }
        if (smsPack) {
            const current = await tx.business.findUnique({ where: { id: business }, select: { smsBalance: true } });
            const removed = Math.min(row.smsCount ?? 0, current?.smsBalance ?? 0);
            const after = removed ? await tx.business.update({ where: { id: business }, data: { smsBalance: { decrement: removed } }, select: { smsBalance: true } }) : current;
            await tx.adminAuditLog.create({
                data: {
                    adminId, action: "payment-refund", targetType: "BUSINESS", targetId: business,
                    before: { smsBalance: current?.smsBalance ?? 0 },
                    after: { smsBalance: after?.smsBalance ?? 0, smsRemoved: removed, smsCount: row.smsCount, amount: row.amount.toFixed(2), reason, attemptId: id },
                },
            });
            return null;
        }
        const before = await tx.subscription.findUnique({ where: { businessId: business }, select: { plan: true, status: true, expiresAt: true, bankCardOrderId: true } });
        let after = before;
        if (endPlan && before) {
            after = await tx.subscription.update({
                where: { businessId: business },
                data: {
                    plan: "FREE", status: "ACTIVE", expiresAt: null, canceledAt: null, cancelAtPeriodEnd: false, currentPeriodStart: now,
                    bankCardOrderId: null, bankCardAmount: null, bankCardMask: null,
                },
                select: { plan: true, status: true, expiresAt: true, bankCardOrderId: true },
            });
            await applyPlanMode(tx, business, planStateFrom(after, now).tier);
            await enforceTeamLimits(tx, business);
        }
        const view = (value: typeof before) => value ? { plan: value.plan, status: value.status, expiresAt: value.expiresAt?.toISOString() ?? null } : undefined;
        await tx.adminAuditLog.create({
            data: {
                adminId, action: "payment-refund", targetType: "BUSINESS", targetId: business,
                before: view(before),
                after: { ...view(after), amount: row.amount.toFixed(2), plan: row.plan, reason, endPlan, attemptId: id },
            },
        });
        return endPlan ? before?.bankCardOrderId ?? null : null;
    });
    if (removeCard) await deleteSavedCard(removeCard).catch(() => console.error("BOG card delete after refund failed"));

    const message = smsPack
        ? `${row.amount.toFixed(2)} ₾ დაბრუნების მოთხოვნა ბანკს გაეგზავნა. ნაშთს დაუხარჯავი SMS გამოაკლდა (მაქსიმუმ ${row.smsCount ?? 0}).`
        : endPlan
        ? `${row.amount.toFixed(2)} ₾ დაბრუნების მოთხოვნა ბანკს გაეგზავნა. გეგმა გაითიშა და შენახული ბარათი მოიხსნა.`
        : `${row.amount.toFixed(2)} ₾ დაბრუნების მოთხოვნა ბანკს გაეგზავნა. გეგმა უცვლელია.`;
    return panelResult(prisma, business, message);
}
