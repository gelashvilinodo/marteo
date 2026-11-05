import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AdminActionError } from "./actions";
import { MAX_MONTHS, PAID_PLANS, PAYMENT_METHODS, paymentPeriod, toTbilisiDay, type PaidPlan, type PaymentMethod } from "./payment-period";
import { enforceTeamLimits } from "@/lib/business/team-manage";
import { applyPlanMode } from "@/lib/subscription/server";
import { notifyPaymentConfirmed } from "@/lib/notifications/sync";
import { queueNoticeChannels } from "@/lib/subscription/notices";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export type AdminPayment = {
    id: string; plan: string; amount: string; method: string; months: number;
    paidAt: string; periodStart: string; periodEnd: string; note: string | null;
    createdBy: string | null; createdAt: string;
    voidedAt: string | null; voidedBy: string | null; voidReason: string | null;
};

type PaymentInput = { plan?: unknown; amount?: unknown; method?: unknown; months?: unknown; paidAt?: unknown; note?: unknown };

function businessKey(value: unknown) {
    if (typeof value !== "string" || !ID.test(value)) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
    return value;
}

function readAmount(value: unknown) {
    const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(",", ".") : "";
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) throw new AdminActionError("თანხა არასწორია (მაგ.: 49 ან 49.90).");
    return Number(raw).toFixed(2);
}

function readPaidAt(value: unknown, now: Date) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AdminActionError("გადახდის თარიღი არასწორია.");
    const date = new Date(`${value}T12:00:00+04:00`);
    if (Number.isNaN(date.getTime()) || value < "2024-01-01" || value > toTbilisiDay(now)) throw new AdminActionError("გადახდის თარიღი მომავალში ვერ იქნება.");
    return date;
}

function readNote(value: unknown, max = 500) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") throw new AdminActionError("შენიშვნა არასწორია.");
    const trimmed = value.trim();
    if (trimmed.length > max) throw new AdminActionError(`შენიშვნა ${max} სიმბოლოს არ უნდა აღემატებოდეს.`);
    return trimmed || null;
}

const personName = (user: { firstName: string | null; lastName: string | null; email: string } | null) =>
    user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : null;

const person = { select: { firstName: true, lastName: true, email: true } } as const;

export async function listPayments(prisma: PrismaClient | Prisma.TransactionClient, businessId: string): Promise<AdminPayment[]> {
    const rows = await prisma.subscriptionPayment.findMany({
        where: { businessId },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: { createdBy: person, voidedBy: person },
    });
    return rows.map(row => ({
        id: row.id, plan: row.plan, amount: row.amount.toFixed(2), method: row.method, months: row.months,
        paidAt: row.paidAt.toISOString(), periodStart: row.periodStart.toISOString(), periodEnd: row.periodEnd.toISOString(),
        note: row.note, createdBy: personName(row.createdBy), createdAt: row.createdAt.toISOString(),
        voidedAt: row.voidedAt?.toISOString() ?? null, voidedBy: personName(row.voidedBy), voidReason: row.voidReason,
    }));
}

const subscriptionView = (value: { plan: string; status: string; expiresAt: Date | null } | null) =>
    value ? { plan: value.plan, status: value.status, expiresAt: value.expiresAt?.toISOString() ?? null } : null;

/** Records a payment and extends the plan in one transaction, then notifies the owners. */
export async function recordPayment(prisma: PrismaClient, adminId: string, businessId: unknown, input: PaymentInput) {
    const key = businessKey(businessId);
    if (!(PAID_PLANS as readonly unknown[]).includes(input.plan)) throw new AdminActionError("აირჩიეთ ფასიანი პაკეტი.");
    if (!(PAYMENT_METHODS as readonly unknown[]).includes(input.method)) throw new AdminActionError("გადახდის მეთოდი არასწორია.");
    const months = Number(input.months);
    if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) throw new AdminActionError(`პერიოდი 1-დან ${MAX_MONTHS} თვემდე უნდა იყოს.`);
    const plan = input.plan as PaidPlan;
    const method = input.method as PaymentMethod;
    const now = new Date();
    const amount = readAmount(input.amount);
    const paidAt = readPaidAt(input.paidAt, now);
    const note = readNote(input.note);

    const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${key} FOR UPDATE`;
        const business = await tx.business.findUnique({
            where: { id: key },
            select: { name: true, subscription: { select: { plan: true, status: true, expiresAt: true } } },
        });
        if (!business) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
        const before = business.subscription;
        const period = paymentPeriod(before, plan, months, now);
        const payment = await tx.subscriptionPayment.create({
            data: {
                businessId: key, businessName: business.name, plan, amount, method, months, paidAt,
                periodStart: period.start, periodEnd: period.end, note, createdById: adminId,
            },
            select: { id: true },
        });
        // ახალი გეგმა (ან განახლება ვადის გასვლის შემდეგ) ლიმიტების ახალ პერიოდს იწყებს;
        // იმავე გეგმის წინასწარი განახლება ათვლის თარიღს არ ცვლის.
        const after = await tx.subscription.upsert({
            where: { businessId: key },
            create: { businessId: key, plan, status: "ACTIVE", expiresAt: period.end, startedAt: now, currentPeriodStart: period.start },
            update: {
                plan, status: "ACTIVE", expiresAt: period.end, canceledAt: null, cancelAtPeriodEnd: false,
                ...(period.continues ? {} : { currentPeriodStart: period.start }),
            },
            select: { plan: true, status: true, expiresAt: true },
        });
        await applyPlanMode(tx, key, plan);
        await tx.adminAuditLog.create({
            data: {
                adminId, action: "payment", targetType: "BUSINESS", targetId: key,
                before: subscriptionView(before) ?? undefined,
                after: { ...subscriptionView(after)!, paymentId: payment.id, amount, method, months },
            },
        });
        await enforceTeamLimits(tx, key);
        await notifyPaymentConfirmed(tx, { businessId: key, plan, paymentId: payment.id, now });
        return { message: `გადახდა აღირიცხა. ${plan} მოქმედებს ${toTbilisiDay(period.end)}-ის ჩათვლით.`, payments: await listPayments(tx, key) };
    });
    // დადასტურება მფლობელებს მეილითა და პუშითაც.
    void queueNoticeChannels(key);
    return result;
}

/** Marks a payment as a mistake. The plan term is left as is: the admin corrects it in the plan editor if needed. */
export async function voidPayment(prisma: PrismaClient, adminId: string, businessId: unknown, paymentId: unknown, reason: unknown) {
    const key = businessKey(businessId);
    if (typeof paymentId !== "string" || !ID.test(paymentId)) throw new AdminActionError("გადახდა ვერ მოიძებნა.", 404);
    const why = readNote(reason, 300);
    if (!why) throw new AdminActionError("მიუთითეთ გაუქმების მიზეზი.");
    return prisma.$transaction(async tx => {
        const updated = await tx.subscriptionPayment.updateMany({
            where: { id: paymentId, businessId: key, voidedAt: null },
            data: { voidedAt: new Date(), voidedById: adminId, voidReason: why },
        });
        if (!updated.count) throw new AdminActionError("გადახდა ვერ მოიძებნა ან უკვე გაუქმებულია.", 404);
        const payment = await tx.subscriptionPayment.findUniqueOrThrow({ where: { id: paymentId }, select: { amount: true, plan: true } });
        await tx.adminAuditLog.create({
            data: { adminId, action: "payment-void", targetType: "BUSINESS", targetId: key, after: { paymentId, amount: payment.amount.toFixed(2), plan: payment.plan, reason: why } },
        });
        return { message: "გადახდა გაუქმდა. პაკეტის ვადა არ შეცვლილა: საჭიროების შემთხვევაში ზემოთ შეასწორეთ.", payments: await listPayments(tx, key) };
    });
}
