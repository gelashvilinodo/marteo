import "server-only";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminActionError } from "./actions";
import { hashDeviceToken, type AdminUser } from "./authorization";
import { hashBackupCode, matchTotp, newBackupCodes, newTotpSecret, normalizeBackupCode, otpauthUri } from "./totp";
import { RateLimitError, reserveLimits, requestIp } from "@/lib/security/rate-limit";
import { runInBackground, sendPushToUsers } from "@/lib/push/web-push";
import { adminPushEnabled } from "./admin-push";
import { createPrismaClient } from "@/lib/prisma";

const DAY = 86_400_000;
// „დამიმახსოვრე“: 30 დღე. მის გარეშე მხოლოდ ამ ბრაუზერის სესიისთვის (სერვერზე მაქსიმუმ 12 საათი).
export const TRUSTED_DAYS = 30;
const SHORT_TRUST_MS = 12 * 3_600_000;

export type TwoFactorState = { enabled: boolean; backupLeft: number };

export async function getTwoFactorState(prisma: PrismaClient, userId: string): Promise<TwoFactorState> {
    const row = await prisma.adminSecurity.findUnique({ where: { userId }, select: { totpEnabledAt: true, backupCodes: true } });
    return { enabled: Boolean(row?.totpEnabledAt), backupLeft: row?.backupCodes.length ?? 0 };
}

async function limit(prisma: PrismaClient, adminId: string, request: Request) {
    try {
        await reserveLimits(prisma, [
            { scope: "admin-2fa-user", identity: adminId, maximum: 8, seconds: 600 },
            { scope: "admin-2fa-ip", identity: requestIp(request), maximum: 20, seconds: 600 },
        ]);
    } catch (error) {
        if (error instanceof RateLimitError) throw new AdminActionError(`ძალიან ბევრი მცდელობა. სცადეთ ${Math.ceil(error.retryAfter / 60)} წუთში.`, 429);
        throw error;
    }
}

async function checkPassword(prisma: PrismaClient, userId: string, password: unknown) {
    if (typeof password !== "string" || !password || password.length > 200) throw new AdminActionError("შეიყვანეთ პაროლი.");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user || !await bcrypt.compare(password, user.password)) throw new AdminActionError("პაროლი არასწორია.", 403);
}

function readCode(value: unknown) {
    return typeof value === "string" ? value.trim().replace(/\s/g, "").slice(0, 32) : "";
}

async function audit(prisma: PrismaClient, adminId: string, action: string, after?: object) {
    await prisma.adminAuditLog.create({ data: { adminId, action, targetType: "USER", targetId: adminId, after: after ?? undefined } });
}

/**
 * Checks a 6-digit app code or a one-time backup code and consumes it. Used for the second login step and
 * again before dangerous actions (delete, refund). Returns how it was confirmed.
 */
export async function consumeAdminCode(prisma: PrismaClient, adminId: string, rawCode: unknown, request: Request) {
    const code = readCode(rawCode);
    if (!code) throw new AdminActionError("შეიყვანეთ კოდი აპიდან.");
    await limit(prisma, adminId, request);
    const security = await prisma.adminSecurity.findUnique({ where: { userId: adminId } });
    if (!security?.totpSecret || !security.totpEnabledAt) throw new AdminActionError("ორეტაპიანი შესვლა ჯერ არ არის ჩართული.", 409);

    if (/^\d{6}$/.test(code)) {
        const step = matchTotp(security.totpSecret, code, security.lastTotpStep);
        if (step === null) throw new AdminActionError("კოდი არასწორია ან ვადა გაუვიდა. შეიყვანეთ აპში ახლა ნაჩვენები კოდი.", 403);
        // ერთდროული ორი მოთხოვნიდან მხოლოდ ერთი გაივლის ერთი და იგივე კოდით.
        const claimed = await prisma.adminSecurity.updateMany({ where: { userId: adminId, lastTotpStep: { lt: step } }, data: { lastTotpStep: step } });
        if (!claimed.count) throw new AdminActionError("ეს კოდი უკვე გამოყენებულია. დაელოდეთ შემდეგს.", 403);
        return "app" as const;
    }
    if (normalizeBackupCode(code).length === 10) {
        const hash = hashBackupCode(code);
        if (!security.backupCodes.includes(hash)) throw new AdminActionError("სარეზერვო კოდი არასწორია ან უკვე გამოყენებულია.", 403);
        const rest = security.backupCodes.filter(item => item !== hash);
        const claimed = await prisma.adminSecurity.updateMany({ where: { userId: adminId, backupCodes: { has: hash } }, data: { backupCodes: rest } });
        if (!claimed.count) throw new AdminActionError("სარეზერვო კოდი უკვე გამოყენებულია.", 403);
        await audit(prisma, adminId, "admin-backup-used", { left: rest.length });
        return "backup" as const;
    }
    throw new AdminActionError("კოდი 6 ციფრია (ან სარეზერვო კოდი xxxxx-xxxxx).");
}

// ბრაუზერისა და სისტემის მოკლე სახელი მოწყობილობების სიისთვის. სრული User-Agent არ ინახება.
export function deviceLabel(userAgent: string | null) {
    const ua = userAgent ?? "";
    const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "უცნობი სისტემა";
    const browser = /Edg\//.test(ua) ? "Edge" : /Brave/.test(ua) ? "Brave" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "ბრაუზერი";
    return `${browser} · ${os}`;
}

export type TrustedDevice = { token: string; expiresAt: Date; remember: boolean };

async function trustDevice(prisma: PrismaClient, admin: AdminUser, request: Request, remember: boolean): Promise<TrustedDevice> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + (remember ? TRUSTED_DAYS * DAY : SHORT_TRUST_MS));
    const label = deviceLabel(request.headers.get("user-agent"));
    const device = await prisma.adminTrustedDevice.create({ data: { userId: admin.id, tokenHash: hashDeviceToken(token), label, expiresAt }, select: { id: true } });
    await audit(prisma, admin.id, "admin-device-trust", { deviceId: device.id, label, remember });
    // ადმინის ყველა მოწყობილობაზე: თუ ეს შენ არ იყავი, მაშინვე გაიგებ.
    // ლოკალურად (QA, dev) ტელეფონზე push არ იგზავნება, თუ ADMIN_PUSH_LOCAL=1 არ არის.
    if (!adminPushEnabled()) return { token, expiresAt, remember };
    const pushClient = createPrismaClient();
    await runInBackground(sendPushToUsers(pushClient, [admin.id], {
        title: "ადმინ პანელში შესვლა ახალი მოწყობილობიდან",
        body: `${label}. თუ ეს შენ არ იყავი, გააუქმე მოწყობილობა და შეცვალე პაროლი.`,
        url: "/admin/security", tag: `admin-device-${device.id}`, requireInteraction: true,
    }).finally(() => pushClient.$disconnect()));
    return { token, expiresAt, remember };
}

/** Step 1 of setup: password again (a stolen session cookie alone must not be enough), then a new secret. */
export async function startSetup(prisma: PrismaClient, admin: AdminUser, password: unknown, request: Request) {
    await limit(prisma, admin.id, request);
    await checkPassword(prisma, admin.id, password);
    const existing = await prisma.adminSecurity.findUnique({ where: { userId: admin.id }, select: { totpEnabledAt: true } });
    if (existing?.totpEnabledAt) throw new AdminActionError("ორეტაპიანი შესვლა უკვე ჩართულია.", 409);
    const secret = newTotpSecret();
    await prisma.adminSecurity.upsert({ where: { userId: admin.id }, create: { userId: admin.id, pendingSecret: secret }, update: { pendingSecret: secret } });
    const uri = otpauthUri(secret, admin.email);
    const qr = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return { secret: secret.replace(/(.{4})/g, "$1 ").trim(), uri, qr };
}

/** Step 2 of setup: the first code proves the app has the secret. Returns backup codes, shown only once. */
export async function enableTwoFactor(prisma: PrismaClient, admin: AdminUser, rawCode: unknown, remember: boolean, request: Request) {
    await limit(prisma, admin.id, request);
    const code = readCode(rawCode);
    const security = await prisma.adminSecurity.findUnique({ where: { userId: admin.id } });
    if (security?.totpEnabledAt) throw new AdminActionError("ორეტაპიანი შესვლა უკვე ჩართულია.", 409);
    if (!security?.pendingSecret) throw new AdminActionError("ჯერ დაასკანერეთ QR კოდი.", 409);
    const step = matchTotp(security.pendingSecret, code, 0);
    if (step === null) throw new AdminActionError("კოდი არ ემთხვევა. შეამოწმეთ, რომ ტელეფონის დრო ავტომატურადაა დაყენებული.", 403);
    const backupCodes = newBackupCodes();
    const enabled = await prisma.adminSecurity.updateMany({
        where: { userId: admin.id, totpEnabledAt: null, pendingSecret: security.pendingSecret },
        data: { totpSecret: security.pendingSecret, pendingSecret: null, totpEnabledAt: new Date(), lastTotpStep: step, backupCodes: backupCodes.map(hashBackupCode) },
    });
    if (!enabled.count) throw new AdminActionError("ორეტაპიანი შესვლა უკვე ჩართულია.", 409);
    await audit(prisma, admin.id, "admin-2fa-enable");
    return { backupCodes, device: await trustDevice(prisma, admin, request, remember) };
}

/** The second step on a new device. */
export async function verifySecondStep(prisma: PrismaClient, admin: AdminUser, rawCode: unknown, remember: boolean, request: Request) {
    const via = await consumeAdminCode(prisma, admin.id, rawCode, request);
    const device = await trustDevice(prisma, admin, request, remember);
    const left = via === "backup" ? (await getTwoFactorState(prisma, admin.id)).backupLeft : null;
    return { device, backupLeft: left };
}

export type AdminDeviceRow = { id: string; label: string; createdAt: string; expiresAt: string; current: boolean };

export async function listDevices(prisma: PrismaClient, adminId: string, currentId: string | null): Promise<AdminDeviceRow[]> {
    const rows = await prisma.adminTrustedDevice.findMany({
        where: { userId: adminId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" }, take: 50,
    });
    return rows.map(row => ({ id: row.id, label: row.label, createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(), current: row.id === currentId }));
}

/** Revokes one device, or every device except the current one when deviceId is "others". */
export async function revokeDevices(prisma: PrismaClient, adminId: string, currentId: string, deviceId: unknown) {
    if (deviceId === "others") {
        const result = await prisma.adminTrustedDevice.updateMany({ where: { userId: adminId, revokedAt: null, id: { not: currentId } }, data: { revokedAt: new Date() } });
        await audit(prisma, adminId, "admin-device-revoke", { count: result.count, scope: "others" });
        return result.count ? `${result.count} მოწყობილობა გაუქმდა.` : "სხვა სანდო მოწყობილობა არ არის.";
    }
    if (typeof deviceId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(deviceId)) throw new AdminActionError("მოწყობილობა ვერ მოიძებნა.", 404);
    if (deviceId === currentId) throw new AdminActionError("ამ მოწყობილობის გასაუქმებლად გამოიყენეთ „ამ მოწყობილობიდან გასვლა“.", 409);
    const result = await prisma.adminTrustedDevice.updateMany({ where: { id: deviceId, userId: adminId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) throw new AdminActionError("მოწყობილობა ვერ მოიძებნა.", 404);
    await audit(prisma, adminId, "admin-device-revoke", { count: 1, deviceId });
    return "მოწყობილობა გაუქმდა: იქ ადმინ პანელი კვლავ კოდს მოითხოვს.";
}

export async function forgetCurrentDevice(prisma: PrismaClient, adminId: string, currentId: string) {
    await prisma.adminTrustedDevice.updateMany({ where: { id: currentId, userId: adminId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(prisma, adminId, "admin-device-revoke", { count: 1, deviceId: currentId, scope: "current" });
}

export async function regenerateBackupCodes(prisma: PrismaClient, adminId: string, code: unknown, request: Request) {
    await consumeAdminCode(prisma, adminId, code, request);
    const backupCodes = newBackupCodes();
    await prisma.adminSecurity.update({ where: { userId: adminId }, data: { backupCodes: backupCodes.map(hashBackupCode) } });
    await audit(prisma, adminId, "admin-backup-regenerate");
    return backupCodes;
}

/** New phone: password + a current code turn 2FA off and revoke every device; the next visit starts setup. */
export async function resetTwoFactor(prisma: PrismaClient, adminId: string, password: unknown, code: unknown, request: Request) {
    await checkPassword(prisma, adminId, password);
    await consumeAdminCode(prisma, adminId, code, request);
    await prisma.$transaction([
        prisma.adminSecurity.update({ where: { userId: adminId }, data: { totpSecret: null, pendingSecret: null, totpEnabledAt: null, lastTotpStep: 0, backupCodes: [] } }),
        prisma.adminTrustedDevice.updateMany({ where: { userId: adminId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await audit(prisma, adminId, "admin-2fa-reset");
}
