import "server-only";
import { randomBytes } from "crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hashEmailChangeValue } from "@/lib/profile/email-change";
import { PASSWORD_RESET_LIFETIME_MS, sendPasswordResetEmail } from "@/lib/auth/send-password-reset-email";

export class AdminActionError extends Error {
    constructor(message: string, public status = 422) {
        super(message);
        this.name = "AdminActionError";
    }
}

type Tx = Prisma.TransactionClient;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export const USER_ACTIONS = ["verify-email", "verify-phone", "suspend", "unsuspend", "end-sessions", "send-password-reset"] as const;
export type UserAction = typeof USER_ACTIONS[number];

function audit(tx: Tx, adminId: string, action: string, targetType: "USER" | "BUSINESS", targetId: string, before: unknown, after: unknown) {
    return tx.adminAuditLog.create({
        data: {
            adminId, action, targetType, targetId,
            before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
            after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
        },
    });
}

async function lockUser(tx: Tx, userId: string) {
    // Serializes concurrent admin actions on the same account.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, password: true, status: true, emailVerifiedAt: true, phoneVerifiedAt: true, isPlatformAdmin: true },
    });
    if (!user) throw new AdminActionError("მომხმარებელი ვერ მოიძებნა.", 404);
    return user;
}

function snapshot(user: { status: string; emailVerifiedAt: Date | null; phoneVerifiedAt: Date | null }, sessions?: number) {
    return {
        status: user.status,
        emailVerified: Boolean(user.emailVerifiedAt),
        phoneVerified: Boolean(user.phoneVerifiedAt),
        ...(sessions === undefined ? {} : { sessions }),
    };
}

const userView = { status: true, emailVerifiedAt: true, phoneVerifiedAt: true } as const;

export async function runUserAction(prisma: PrismaClient, adminId: string, userId: unknown, action: unknown) {
    if (typeof userId !== "string" || !ID.test(userId)) throw new AdminActionError("მომხმარებელი ვერ მოიძებნა.", 404);
    if (!(USER_ACTIONS as readonly unknown[]).includes(action)) throw new AdminActionError("მოქმედება არასწორია.");
    const kind = action as UserAction;

    let resetDelivery: { email: string; token: string } | null = null;
    const message = await prisma.$transaction(async tx => {
        const user = await lockUser(tx, userId);
        if ((kind === "suspend" || kind === "end-sessions") && (user.id === adminId || user.isPlatformAdmin)) {
            throw new AdminActionError("პლატფორმის ადმინის ანგარიშზე ეს მოქმედება დაუშვებელია.", 403);
        }
        const now = new Date();

        if (kind === "verify-email" || kind === "verify-phone") {
            const email = kind === "verify-email";
            if (email ? user.emailVerifiedAt : user.phoneVerifiedAt) throw new AdminActionError(email ? "ელფოსტა უკვე დადასტურებულია." : "ტელეფონი უკვე დადასტურებულია.", 409);
            const bothVerified = (email || Boolean(user.emailVerifiedAt)) && (!email || Boolean(user.phoneVerifiedAt));
            // Like registration: ACTIVE only once both are confirmed; a suspension is never lifted here.
            const activate = user.status === "PENDING_VERIFICATION" && bothVerified;
            const updated = await tx.user.update({
                where: { id: user.id },
                data: { ...(email ? { emailVerifiedAt: now } : { phoneVerifiedAt: now }), ...(activate ? { status: "ACTIVE" } : {}) },
                select: userView,
            });
            // Pending registration codes are no longer needed.
            await tx.verificationToken.deleteMany({ where: { userId: user.id, type: email ? "EMAIL" : "PHONE", usedAt: null } });
            await audit(tx, adminId, kind, "USER", user.id, snapshot(user), snapshot(updated));
            return activate
                ? "დადასტურდა. ანგარიში ახლა აქტიურია და მომხმარებელს შესვლა შეუძლია."
                : email ? "ელფოსტა დადასტურდა." : "ტელეფონი დადასტურდა.";
        }

        if (kind === "suspend") {
            if (user.status === "SUSPENDED") throw new AdminActionError("ანგარიში უკვე შეჩერებულია.", 409);
            const sessions = await tx.session.deleteMany({ where: { userId: user.id } });
            const updated = await tx.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" }, select: userView });
            await audit(tx, adminId, kind, "USER", user.id, snapshot(user, sessions.count), snapshot(updated, 0));
            return "ანგარიში შეჩერდა და მომხმარებელი ყველა მოწყობილობიდან გავიდა.";
        }

        if (kind === "unsuspend") {
            if (user.status !== "SUSPENDED") throw new AdminActionError("ანგარიში შეჩერებული არ არის.", 409);
            const status = user.emailVerifiedAt && user.phoneVerifiedAt ? "ACTIVE" : "PENDING_VERIFICATION";
            const updated = await tx.user.update({ where: { id: user.id }, data: { status }, select: userView });
            await audit(tx, adminId, kind, "USER", user.id, snapshot(user), snapshot(updated));
            return status === "ACTIVE" ? "ანგარიში აღდგა." : "ანგარიში აღდგა, მაგრამ დადასტურება ჯერ არ დასრულებულა.";
        }

        if (kind === "end-sessions") {
            const sessions = await tx.session.deleteMany({ where: { userId: user.id } });
            await audit(tx, adminId, kind, "USER", user.id, { sessions: sessions.count }, { sessions: 0 });
            return sessions.count ? `მომხმარებელი გავიდა ${sessions.count} მოწყობილობიდან.` : "აქტიური სესიები არ ჰქონდა.";
        }

        // send-password-reset: same eligibility as the public reset form.
        if (user.status !== "ACTIVE" || !user.emailVerifiedAt) throw new AdminActionError("ბმულის გაგზავნა შესაძლებელია მხოლოდ აქტიურ, დადასტურებულ ანგარიშზე.", 409);
        const token = randomBytes(32).toString("hex");
        await tx.passwordResetRequest.create({
            data: {
                userId: user.id,
                email: user.email,
                tokenHash: hashEmailChangeValue(token),
                passwordFingerprint: hashEmailChangeValue(user.password),
                expiresAt: new Date(now.getTime() + PASSWORD_RESET_LIFETIME_MS),
            },
        });
        // The token itself is never logged.
        await audit(tx, adminId, kind, "USER", user.id, null, { email: user.email });
        resetDelivery = { email: user.email, token };
        return `პაროლის აღდგენის ბმული გაიგზავნა: ${user.email} (მოქმედებს 15 წუთი).`;
    });

    const delivery = resetDelivery as { email: string; token: string } | null;
    if (delivery) {
        await sendPasswordResetEmail({ to: delivery.email, token: delivery.token }).catch(() => {
            throw new AdminActionError("ბმული შეიქმნა, მაგრამ წერილი ვერ გაიგზავნა. სცადე ხელახლა.", 502);
        });
    }
    return message;
}

export const PLANS = ["FREE", "START", "BUSINESS", "PRO"] as const;
export const SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIALING", "CANCELED", "EXPIRED", "PAST_DUE"] as const;

type SubscriptionInput = { plan?: unknown; status?: unknown; expiresAt?: unknown };

function readExpiry(value: unknown) {
    if (value === null || value === "" || value === undefined) return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AdminActionError("ვადის თარიღი არასწორია.");
    // End of that day in Tbilisi, so a plan "until 30 Nov" covers all of 30 Nov.
    const date = new Date(`${value}T23:59:59+04:00`);
    const year = date.getUTCFullYear();
    if (Number.isNaN(date.getTime()) || year < 2024 || year > new Date().getUTCFullYear() + 10) throw new AdminActionError("ვადის თარიღი არასწორია.");
    return date;
}

type SubscriptionView = { plan: string; status: string; expiresAt: string | null } | null;

function subscriptionView(value: { plan: string; status: string; expiresAt: Date | null } | null): SubscriptionView {
    return value ? { plan: value.plan, status: value.status, expiresAt: value.expiresAt?.toISOString() ?? null } : null;
}

export async function updateSubscription(prisma: PrismaClient, adminId: string, businessId: unknown, input: SubscriptionInput) {
    if (typeof businessId !== "string" || !ID.test(businessId)) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
    if (!(PLANS as readonly unknown[]).includes(input.plan)) throw new AdminActionError("პაკეტი არასწორია.");
    if (!(SUBSCRIPTION_STATUSES as readonly unknown[]).includes(input.status)) throw new AdminActionError("სტატუსი არასწორია.");
    const plan = input.plan as typeof PLANS[number];
    const status = input.status as typeof SUBSCRIPTION_STATUSES[number];
    const expiresAt = readExpiry(input.expiresAt);

    return prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
        const business = await tx.business.findUnique({
            where: { id: businessId },
            select: { id: true, subscription: { select: { plan: true, status: true, expiresAt: true, canceledAt: true } } },
        });
        if (!business) throw new AdminActionError("ბიზნესი ვერ მოიძებნა.", 404);
        const before = business.subscription;
        const now = new Date();
        const canceledAt = status === "CANCELED" ? before?.canceledAt ?? now : null;
        const after = await tx.subscription.upsert({
            where: { businessId },
            create: { businessId, plan, status, expiresAt, canceledAt, startedAt: now },
            update: { plan, status, expiresAt, canceledAt },
            select: { plan: true, status: true, expiresAt: true },
        });
        if (JSON.stringify(subscriptionView(before)) === JSON.stringify(subscriptionView(after))) throw new AdminActionError("ცვლილება არ არის.", 409);
        await audit(tx, adminId, "subscription", "BUSINESS", businessId, subscriptionView(before), subscriptionView(after));
        return "პაკეტი განახლდა.";
    });
}

export type AuditEntry = {
    id: string; action: string; createdAt: string; adminName: string | null;
    before: unknown; after: unknown;
};

export async function getAuditLog(prisma: PrismaClient, targetType: "USER" | "BUSINESS", targetId: string): Promise<AuditEntry[]> {
    const rows = await prisma.adminAuditLog.findMany({
        where: { targetType, targetId },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, action: true, createdAt: true, before: true, after: true, admin: { select: { firstName: true, lastName: true, email: true } } },
    });
    return rows.map(row => ({
        id: row.id,
        action: row.action,
        createdAt: row.createdAt.toISOString(),
        adminName: row.admin ? [row.admin.firstName, row.admin.lastName].filter(Boolean).join(" ") || row.admin.email : null,
        before: row.before,
        after: row.after,
    }));
}
