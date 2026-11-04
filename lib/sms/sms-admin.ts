import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AdminActionError } from "@/lib/admin/actions";
import { SMS_PACKS } from "@/lib/subscription/plan-catalog";
import { getSmsUsage, type SmsUsage } from "./order-sms";

export type BusinessSmsView = SmsUsage & {
    sentThisMonth: number;
    packs: { id: string; count: number; price: string; createdAt: string }[];
};

export async function getBusinessSms(db: PrismaClient | Prisma.TransactionClient, businessId: string): Promise<BusinessSmsView> {
    const monthAgo = new Date(Date.now() - 30 * 86_400_000);
    const [usage, sentThisMonth, packs] = await Promise.all([
        getSmsUsage(db, businessId),
        db.smsMessage.count({ where: { businessId, status: { not: "FAILED" }, createdAt: { gte: monthAgo } } }),
        db.smsPackPurchase.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, count: true, price: true, createdAt: true } }),
    ]);
    return { ...usage, sentThisMonth, packs: packs.map(pack => ({ id: pack.id, count: pack.count, price: pack.price.toFixed(2), createdAt: pack.createdAt.toISOString() })) };
}

// ბანკის გადახდამდე პაკეტს ადმინი ამატებს (მაგ. გადარიცხვის შემდეგ). ნაშთი ვადით არ იწურება.
export async function addSmsPack(prisma: PrismaClient, adminId: string, businessId: unknown, count: unknown, note: unknown) {
    if (typeof businessId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(businessId)) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
    const pack = SMS_PACKS.find(item => item.count === count);
    if (!pack) throw new AdminActionError("პაკეტი არასწორია.");
    const text = typeof note === "string" ? note.trim().slice(0, 300) || null : null;
    return prisma.$transaction(async tx => {
        const business = await tx.business.findUnique({ where: { id: businessId }, select: { smsBalance: true } });
        if (!business) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
        await tx.smsPackPurchase.create({ data: { businessId, count: pack.count, price: pack.price, note: text, createdById: adminId } });
        const after = await tx.business.update({ where: { id: businessId }, data: { smsBalance: { increment: pack.count } }, select: { smsBalance: true } });
        await tx.adminAuditLog.create({
            data: {
                adminId, action: "sms-pack", targetType: "BUSINESS", targetId: businessId,
                before: { balance: business.smsBalance }, after: { balance: after.smsBalance, count: pack.count, price: pack.price },
            },
        });
        return `${pack.count} SMS დაემატა. ნაშთი: ${after.smsBalance}.`;
    });
}
