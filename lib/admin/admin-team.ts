import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { Resend } from "resend";
import type { PrismaClient } from "@/generated/prisma/client";
import { AdminActionError } from "./actions";
import type { AdminUser } from "./authorization";
import { consumeAdminCode } from "./two-factor";
import { sendAdminPush } from "./admin-push";
import { reserveEmail, sendTracked } from "@/lib/email/email-log";
import { getAppOrigin, readServerSetting } from "@/lib/auth/send-password-reset-email";
import { devDeliveryToConsole, logDevDelivery } from "@/lib/dev/dev-delivery";
import { escapeHtml } from "@/lib/security/html";

// ადმინის მოწვევის ბმული 48 საათი მოქმედებს და ერთჯერადია.
export const ADMIN_INVITE_HOURS = 48;
// ადმინები მოწვევებთან ერთად. ადმინ პანელი ყველაფერს ხედავს, ამიტომ წრე პატარაა.
export const MAX_ADMINS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_PASSWORD_HASH = "$2b$12$mcKp3BjwNCDbYmxmx/w/CuwumeMqzXCsU3YgwFrypd92wS98D2AEW";
const SESSION_DURATION_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(`marteo-admin-invite:${token}`).digest("hex");
const fullName = (user: { firstName: string | null; lastName: string | null; email: string }) =>
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

export function readAdminInviteToken(value: unknown) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : "";
}

/**
 * The platform owner is the admin who was not invited (set up with scripts/set-platform-admin.cjs).
 * Only the owner invites and removes admins, so an invited admin cannot lock the owner out.
 */
export async function isPlatformOwner(prisma: PrismaClient, userId: string) {
    const [user, invited] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true, status: true } }),
        prisma.adminInvite.count({ where: { acceptedById: userId, status: "ACCEPTED" } }),
    ]);
    return Boolean(user?.isPlatformAdmin && user.status === "ACTIVE" && invited === 0);
}

async function requireOwner(prisma: PrismaClient, admin: AdminUser) {
    if (!await isPlatformOwner(prisma, admin.id)) throw new AdminActionError("ადმინების მართვა მხოლოდ პლატფორმის მფლობელს შეუძლია.", 403);
}

export type AdminTeamMember = {
    id: string; name: string; email: string; isOwner: boolean; twoFactor: boolean; joinedAt: Date | null; invitedBy: string | null;
};
export type AdminTeamInvite = { id: string; email: string; createdAt: Date; expiresAt: Date; expired: boolean; invitedBy: string | null };

export async function getAdminTeam(prisma: PrismaClient) {
    const now = new Date();
    const [admins, invites] = await Promise.all([
        prisma.user.findMany({
            where: { isPlatformAdmin: true },
            orderBy: { createdAt: "asc" },
            select: {
                id: true, email: true, firstName: true, lastName: true, status: true,
                adminSecurity: { select: { totpEnabledAt: true } },
                acceptedAdminInvites: {
                    where: { status: "ACCEPTED" }, orderBy: { acceptedAt: "desc" }, take: 1,
                    select: { acceptedAt: true, invitedBy: { select: { firstName: true, lastName: true, email: true } } },
                },
            },
        }),
        prisma.adminInvite.findMany({
            where: { status: "PENDING" },
            orderBy: { createdAt: "desc" },
            select: { id: true, email: true, createdAt: true, expiresAt: true, invitedBy: { select: { firstName: true, lastName: true, email: true } } },
        }),
    ]);
    const members: AdminTeamMember[] = admins.map(admin => {
        const invite = admin.acceptedAdminInvites[0];
        return {
            id: admin.id, name: fullName(admin), email: admin.email, isOwner: !invite,
            twoFactor: Boolean(admin.adminSecurity?.totpEnabledAt),
            joinedAt: invite?.acceptedAt ?? null, invitedBy: invite?.invitedBy ? fullName(invite.invitedBy) : null,
        };
    });
    const pending: AdminTeamInvite[] = invites.map(invite => ({
        id: invite.id, email: invite.email, createdAt: invite.createdAt, expiresAt: invite.expiresAt,
        expired: invite.expiresAt <= now, invitedBy: invite.invitedBy ? fullName(invite.invitedBy) : null,
    }));
    return { members, pending };
}

async function audit(prisma: PrismaClient, adminId: string, action: string, targetId: string, after?: object) {
    await prisma.adminAuditLog.create({ data: { adminId, action, targetType: "USER", targetId, after: after ?? undefined } });
}

/** Owner only, with a fresh app code. Sends a one-time link; the invitee must already have a MARTEO account. */
export async function createAdminInvite(prisma: PrismaClient, admin: AdminUser, body: { email?: unknown; code?: unknown }, request: Request) {
    await requireOwner(prisma, admin);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new AdminActionError("ჩაწერე სწორი ელფოსტა.");
    if (email === admin.email.toLowerCase()) throw new AdminActionError("საკუთარი თავის მოწვევა შეუძლებელია.");
    await consumeAdminCode(prisma, admin.id, body.code, request);

    const now = new Date();
    const token = randomBytes(32).toString("hex");
    const invite = await prisma.$transaction(async tx => {
        // ორი ერთდროული მოწვევა ლიმიტს ვერ გადააჭარბებს.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('marteo-admin-invites'))`;
        const already = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, isPlatformAdmin: true }, select: { id: true } });
        if (already) throw new AdminActionError("ეს ადამიანი უკვე ადმინია.", 409);
        const pending = await tx.adminInvite.findFirst({ where: { email, status: "PENDING" }, select: { id: true, expiresAt: true } });
        if (pending && pending.expiresAt > now) throw new AdminActionError("ამ ელფოსტაზე მოწვევა უკვე გაგზავნილია. თუ არ მისულა, გააუქმე და თავიდან მოიწვიე.", 409);
        if (pending) await tx.adminInvite.update({ where: { id: pending.id }, data: { status: "CANCELED" } });
        const [admins, invites] = await Promise.all([
            tx.user.count({ where: { isPlatformAdmin: true } }),
            tx.adminInvite.count({ where: { status: "PENDING", expiresAt: { gt: now } } }),
        ]);
        if (admins + invites >= MAX_ADMINS) throw new AdminActionError(`მაქსიმუმ ${MAX_ADMINS} ადმინი (მოწვევების ჩათვლით).`, 409);
        return tx.adminInvite.create({
            data: { email, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + ADMIN_INVITE_HOURS * 3_600_000), invitedById: admin.id },
            select: { id: true },
        });
    });
    try {
        await sendAdminInviteEmail(email, token, fullName(admin));
    } catch (error) {
        // გაუგზავნელი მოწვევა სიაში არ უნდა დარჩეს.
        await prisma.adminInvite.update({ where: { id: invite.id }, data: { status: "CANCELED" } });
        throw error instanceof AdminActionError ? error : new AdminActionError("წერილი ვერ გაიგზავნა. სცადე ცოტა ხანში.", 502);
    }
    await audit(prisma, admin.id, "admin-invite", invite.id, { email });
    return "მოწვევა გაიგზავნა.";
}

export async function cancelAdminInvite(prisma: PrismaClient, admin: AdminUser, inviteId: string) {
    await requireOwner(prisma, admin);
    const { count } = await prisma.adminInvite.updateMany({ where: { id: inviteId, status: "PENDING" }, data: { status: "CANCELED" } });
    if (!count) throw new AdminActionError("მოწვევა ვერ მოიძებნა.", 404);
    await audit(prisma, admin.id, "admin-invite-cancel", inviteId);
    return "მოწვევა გაუქმდა.";
}

/** Owner only, with a fresh app code. The account stays; it just loses the admin panel and its devices/2FA. */
export async function removeAdmin(prisma: PrismaClient, admin: AdminUser, userId: string, body: { code?: unknown }, request: Request) {
    await requireOwner(prisma, admin);
    if (userId === admin.id) throw new AdminActionError("საკუთარი თავის მოხსნა შეუძლებელია.");
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, isPlatformAdmin: true } });
    if (!target?.isPlatformAdmin) throw new AdminActionError("ადმინი ვერ მოიძებნა.", 404);
    await consumeAdminCode(prisma, admin.id, body.code, request);
    await prisma.$transaction([
        prisma.user.update({ where: { id: userId }, data: { isPlatformAdmin: false } }),
        prisma.adminTrustedDevice.deleteMany({ where: { userId } }),
        // ხელახლა მოწვევისას 2FA თავიდან ირთვება.
        prisma.adminSecurity.deleteMany({ where: { userId } }),
    ]);
    await audit(prisma, admin.id, "admin-remove", userId, { email: target.email });
    return "ადმინი მოიხსნა.";
}

export type AdminInviteLookup =
    | { state: "invalid" } | { state: "expired" }
    | { state: "ready"; email: string; inviterName: string; accountExists: boolean };

export async function lookupAdminInvite(prisma: PrismaClient, token: string): Promise<AdminInviteLookup> {
    const invite = await prisma.adminInvite.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { email: true, status: true, expiresAt: true, invitedBy: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!invite || invite.status !== "PENDING") return { state: "invalid" };
    if (invite.expiresAt <= new Date()) return { state: "expired" };
    const account = await prisma.user.findFirst({ where: { email: { equals: invite.email, mode: "insensitive" } }, select: { id: true } });
    return { state: "ready", email: invite.email, inviterName: invite.invitedBy ? fullName(invite.invitedBy) : "MARTEO", accountExists: Boolean(account) };
}

type AcceptInput = { kind: "signed-in"; userId: string } | { kind: "password"; password: string };

/**
 * Makes the invitee an admin. Signed in as the invited e-mail, or the account's password here.
 * The admin panel itself still needs 2FA setup at /admin-login afterwards.
 */
export async function acceptAdminInvite(prisma: PrismaClient, token: string, input: AcceptInput) {
    const tokenHash = hashToken(token);
    const result = await prisma.$transaction(async tx => {
        const [locked] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "AdminInvite" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`;
        const invite = locked && await tx.adminInvite.findUnique({ where: { id: locked.id }, select: { id: true, email: true, status: true, expiresAt: true, invitedById: true } });
        if (!invite || invite.status !== "PENDING") throw new AdminActionError("მოწვევა ვერ მოიძებნა ან უკვე გამოყენებულია.", 404);
        const now = new Date();
        if (invite.expiresAt <= now) throw new AdminActionError("მოწვევის ბმულს ვადა გაუვიდა. სთხოვეთ ხელახლა მოწვევა.", 410);
        const user = await tx.user.findFirst({
            where: { email: { equals: invite.email, mode: "insensitive" } },
            select: { id: true, email: true, firstName: true, lastName: true, password: true, status: true, emailVerifiedAt: true, isPlatformAdmin: true },
        });
        if (input.kind === "password") {
            const valid = await bcrypt.compare(input.password, user?.password ?? DUMMY_PASSWORD_HASH);
            if (!user || !valid) throw new AdminActionError("პაროლი არასწორია.", 401);
        } else if (!user || user.id !== input.userId) {
            throw new AdminActionError("მოწვევა სხვა ელფოსტაზეა გაგზავნილი. შედით იმ ანგარიშით.", 403);
        }
        if (user.status !== "ACTIVE" || !user.emailVerifiedAt) throw new AdminActionError("ჯერ დაასრულეთ რეგისტრაცია (ელფოსტა და ტელეფონი), შემდეგ ბმული თავიდან გახსენით.", 403);
        if (!user.isPlatformAdmin) await tx.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
        await tx.adminInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED", acceptedById: user.id, acceptedAt: now } });
        await tx.adminAuditLog.create({ data: { adminId: user.id, action: "admin-invite-accept", targetType: "USER", targetId: user.id, after: { inviteId: invite.id, invitedById: invite.invitedById } } });
        return { userId: user.id, name: fullName(user) };
    });

    await sendAdminPush(prisma, {
        title: "ადმინ პანელს ახალი ადმინი შეემატა", body: `${result.name} მოწვევა მიიღო.`, url: "/admin/admins", tag: "admin-team",
    });

    if (input.kind === "signed-in") return { session: null };
    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 86_400_000);
    await prisma.session.create({ data: { userId: result.userId, tokenHash: createHash("sha256").update(sessionToken).digest("hex"), expiresAt } });
    return { session: { token: sessionToken, expiresAt } };
}

async function sendAdminInviteEmail(to: string, token: string, inviterName: string) {
    const url = new URL("/admin-invite", getAppOrigin());
    // ფრაგმენტი სერვერის ლოგებში არ ხვდება.
    url.hash = new URLSearchParams({ token }).toString();
    const link = url.toString();

    await reserveEmail("admin-invite", to);
    if (devDeliveryToConsole()) {
        logDevDelivery("email", to, `admin invite link=${link}`);
        return;
    }
    const apiKey = readServerSetting("RESEND_API_KEY");
    const from = readServerSetting("RESEND_FROM_EMAIL");
    if (!apiKey || !from) throw new Error("Missing email server configuration");
    const { error } = await sendTracked("admin-invite", to, () => new Resend(apiKey).emails.send({
        from,
        to: [to],
        subject: "MARTEO - მოწვევა ადმინ პანელში",
        text: [
            `${inviterName} გიწვევთ MARTEO-ს ადმინ პანელში ადმინად.`,
            "მოწვევის მისაღებად გახსენით ბმული:",
            link,
            `ბმული მოქმედებს ${ADMIN_INVITE_HOURS} საათის განმავლობაში და ერთჯერადია. მიღების შემდეგ ადმინ პანელი ორეტაპიან შესვლას ჩაგართვევინებთ.`,
            "თუ ამ მოწვევას არ ელოდით, უგულებელყავით ეს წერილი.",
        ].join("\n\n"),
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
                <h2>მოწვევა MARTEO-ს ადმინ პანელში</h2>
                <p><strong>${escapeHtml(inviterName)}</strong> გიწვევთ MARTEO-ს ადმინ პანელში ადმინად.</p>
                <a href="${link}" style="display:inline-block;margin:16px 0;padding:14px 22px;background:#16c45b;color:#081f16;text-decoration:none;font-weight:700;border-radius:12px">
                    მოწვევის მიღება
                </a>
                <p>ბმული მოქმედებს ${ADMIN_INVITE_HOURS} საათის განმავლობაში და ერთჯერადია. მიღების შემდეგ ადმინ პანელი ორეტაპიან შესვლას ჩაგართვევინებთ.</p>
                <p>თუ ამ მოწვევას არ ელოდით, უგულებელყავით ეს წერილი.</p>
                <p>MARTEO.GE</p>
            </div>
        `,
    }));
    if (error) throw new Error("Admin invite email delivery failed");
}
