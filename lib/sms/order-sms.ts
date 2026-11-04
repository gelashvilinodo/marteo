import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/prisma";
import { runInBackground } from "@/lib/push/web-push";
import { isAllowedSmsPhone, normalizePhone } from "@/lib/security/phone";
import { readUsagePeriod } from "@/lib/subscription/limits";
import { planAllows } from "@/lib/subscription/plan-state";
import { PLAN_LIMITS } from "@/lib/subscription/plans";
import { sendSms } from "./index";

type Db = PrismaClient | Prisma.TransactionClient;

// ქართული ტექსტი ერთ SMS-ში 70 სიმბოლომდე ეტევა; მეტი ორ SMS-ად ჩამოიჭრებოდა.
export const SMS_MAX_LENGTH = 70;

// შაბლონი: ბიზნესის სახელი ყოველთვის ჩანს, გრძელი სახელი კი მოკლდება, რომ ტექსტი ერთ SMS-ში დაეტიოს.
export function shippedMessage(businessName: string, orderNumber: number | null) {
    const tail = `: შეკვეთა${orderNumber ? ` #${orderNumber}` : ""} კურიერს გადაეცა, მალე მიიღებ.`;
    const room = SMS_MAX_LENGTH - tail.length;
    const name = businessName.trim().replace(/\s+/g, " ");
    return (name.length > room ? `${name.slice(0, Math.max(1, room - 1)).trimEnd()}…` : name) + tail;
}

export type SmsUsage = {
    allowed: boolean;
    enabled: boolean;
    // გეგმის SMS ამ პერიოდში (Pro: 500; ახალ პერიოდში ისევ 500-მდე ივსება, არ გროვდება).
    planIncluded: number;
    planUsed: number;
    // ნაყიდი პაკეტების ნაშთი: ვადა არ გასდის და გეგმის შეცვლისას რჩება.
    balance: number;
};

export async function getSmsUsage(db: Db, businessId: string, now = new Date()): Promise<SmsUsage> {
    const [business, period] = await Promise.all([
        db.business.findUnique({ where: { id: businessId }, select: { smsEnabled: true, smsBalance: true } }),
        readUsagePeriod(db, businessId, now),
    ]);
    const planIncluded = period.plan.tier ? PLAN_LIMITS[period.plan.tier].smsIncluded : 0;
    const planUsed = planIncluded
        ? await db.smsMessage.count({ where: { businessId, source: "PLAN", status: { not: "FAILED" }, createdAt: { gte: period.start } } })
        : 0;
    return {
        allowed: planAllows(period.plan, "sms"),
        enabled: business?.smsEnabled ?? false,
        planIncluded, planUsed,
        balance: business?.smsBalance ?? 0,
    };
}

// ლოკალურად და ტესტში პროვაიდერი არ გამოიძახება (ბაზა საერთოა და ნომრები რეალურია):
// ნამდვილი გაგზავნისთვის საჭიროა ORDER_SMS_LIVE=1.
const live = () => process.env.ORDER_SMS_LIVE === "1";

type Reserved = { id: string; phone: string; message: string; source: "PLAN" | "PACK"; businessId: string };

// ადგილის დაჯავშნა ბიზნესის ჩაკეტილი სტრიქონის ქვეშ: ჯერ გეგმის SMS, მერე ნაყიდი პაკეტი.
async function reserve(prisma: PrismaClient, businessId: string, orderId: string): Promise<Reserved | null> {
    return prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
        const [usage, business, order] = await Promise.all([
            getSmsUsage(tx, businessId),
            tx.business.findUnique({ where: { id: businessId }, select: { name: true } }),
            tx.order.findFirst({
                where: { id: orderId, businessId, status: "SHIPPED", deletedAt: null },
                select: { number: true, recipientPhone: true, fulfillmentCycle: true },
            }),
        ]);
        if (!usage.allowed || !usage.enabled || !order || !business) return null;
        const phone = normalizePhone(order.recipientPhone);
        if (!isAllowedSmsPhone(phone)) return null;
        // ერთი მიწოდების ციკლი — ერთი SMS (სტატუსის ორჯერ შეცვლა მეორეს არ გზავნის).
        const sent = await tx.smsMessage.findUnique({ where: { orderId_fulfillmentCycle: { orderId, fulfillmentCycle: order.fulfillmentCycle } }, select: { id: true } });
        if (sent) return null;
        let source: "PLAN" | "PACK";
        if (usage.planUsed < usage.planIncluded) source = "PLAN";
        else if (usage.balance > 0) {
            source = "PACK";
            await tx.business.update({ where: { id: businessId }, data: { smsBalance: { decrement: 1 } } });
        } else return null;
        const row = await tx.smsMessage.create({
            data: { businessId, orderId, fulfillmentCycle: order.fulfillmentCycle, phone, source },
            select: { id: true },
        });
        return { id: row.id, phone, source, businessId, message: shippedMessage(business.name, order.number) };
    });
}

async function deliver(prisma: PrismaClient, reserved: Reserved) {
    try {
        if (live()) await sendSms({ phone: reserved.phone, message: reserved.message, purpose: "order" });
        await prisma.smsMessage.update({ where: { id: reserved.id }, data: { status: live() ? "SENT" : "DRY_RUN" } });
    } catch (error) {
        console.error("Order SMS failed", error instanceof Error ? error.name : "UnknownError");
        // ვერ გაგზავნილი SMS ლიმიტს არ ხარჯავს: პაკეტის ერთეული ბრუნდება, გეგმისა FAILED-ით აღარ ითვლება.
        await prisma.$transaction([
            prisma.smsMessage.update({ where: { id: reserved.id }, data: { status: "FAILED" } }),
            ...(reserved.source === "PACK" ? [prisma.business.update({ where: { id: reserved.businessId }, data: { smsBalance: { increment: 1 } } })] : []),
        ]).catch(() => console.error("Order SMS refund failed"));
    }
}

export async function sendShippedSms(businessId: string, orderIds: readonly string[]) {
    if (!orderIds.length) return;
    const prisma = createPrismaClient();
    try {
        for (const orderId of orderIds) {
            const reserved = await reserve(prisma, businessId, orderId).catch(error => {
                console.error("Order SMS reserve failed", error instanceof Error ? error.name : "UnknownError");
                return null;
            });
            if (reserved) await deliver(prisma, reserved);
        }
    } finally {
        await prisma.$disconnect();
    }
}

// პასუხს არ აყოვნებს: Cloudflare-ზე გაგზავნა პასუხის შემდეგ გრძელდება.
export function queueShippedSms(businessId: string, orderIds: readonly string[]) {
    return runInBackground(sendShippedSms(businessId, orderIds));
}
