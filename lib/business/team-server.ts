import "server-only";
import { readPlanState } from "@/lib/subscription/server";
import { teamTier } from "@/lib/subscription/plan-state";
import { createHash, randomBytes } from "node:crypto";
import { Resend } from "resend";
import type { createPrismaClient } from "@/lib/prisma";
import { getAppOrigin, readServerSetting } from "@/lib/auth/send-password-reset-email";
import { reserveDelivery } from "@/lib/security/delivery-limit";
import { escapeHtml } from "@/lib/security/html";
import { isBusinessPermission, type BusinessPermission } from "./permissions";
import { getTeamRequests } from "./team-manage";
import {
    INVITE_LIFETIME_HOURS,
    INVITE_MAX_RESENDS,
    INVITE_RESEND_COOLDOWN_SECONDS,
    PERMISSION_OPTIONS,
    planPermissions,
    TEAM_LIMITS,
    type TeamPlan,
    type TeamSnapshot,
} from "./team";

type Db = ReturnType<typeof createPrismaClient>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
type Reader = Db | Tx;

export class TeamError extends Error {
    constructor(message: string, readonly status = 422, readonly field: "email" | "role" | "permissions" | "form" = "form") {
        super(message);
    }
}

export const PLAN_PERMISSION_ERROR = "მონიშნული უფლება თქვენს გეგმაში არ შედის. მარაგი, შესყიდვები და წარმოება ბიზნეს გეგმიდან იხსნება.";

const EMAIL_PATTERN =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hashInviteToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

function newInviteToken() {
    const token = randomBytes(32).toString("hex");
    return { token, tokenHash: hashInviteToken(token) };
}

const inviteExpiry = (now: Date) => new Date(now.getTime() + INVITE_LIFETIME_HOURS * 3600_000);

// გუნდის ლიმიტის გეგმა. დაბლოკილი ბიზნესი (ვადაგასული, გადაუხდელი) ბოლო ფასიანი გეგმის ლიმიტს
// ინარჩუნებს, რომ წევრები არ გაიყინოს: ისინიც მხოლოდ ნახვის რეჟიმში არიან. დაბლოკილში ახალი
// მოწვევა მაინც არ შეიძლება, რადგან ცვლილებებს წვდომის ფენა კეტავს.
export async function readPlan(db: Reader, businessId: string, now: Date): Promise<TeamPlan> {
    return teamTier(await readPlanState(db, businessId, now)) ?? "FREE";
}

// დაკავებული ადგილები: აქტიური წევრები და ჯერ არ ვადაგასული მოწვევები.
// დამფუძნებელი მფლობელი თანამფლობელის ლიმიტში არ ითვლება.
async function readUsage(db: Reader, businessId: string, now: Date) {
    const [owners, staff, ownerInvites, staffInvites] = await Promise.all([
        db.businessMembership.count({ where: { businessId, status: "ACTIVE", role: "OWNER" } }),
        db.businessMembership.count({ where: { businessId, status: "ACTIVE", role: { in: ["ADMIN", "MEMBER"] } } }),
        db.businessInvite.count({ where: { businessId, status: "PENDING", role: "OWNER", expiresAt: { gt: now } } }),
        db.businessInvite.count({ where: { businessId, status: "PENDING", role: "MEMBER", expiresAt: { gt: now } } }),
    ]);
    return { coOwners: Math.max(0, owners - 1) + ownerInvites, staff: staff + staffInvites };
}

export async function getTeamSnapshot(db: Db, businessId: string, userId: string): Promise<TeamSnapshot> {
    const now = new Date();
    const [plan, used, memberships, invites] = await Promise.all([
        readPlan(db, businessId, now),
        readUsage(db, businessId, now),
        db.businessMembership.findMany({
            where: { businessId },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
                id: true, role: true, permissions: true, readOnly: true, status: true, createdAt: true, userId: true,
                user: { select: { firstName: true, lastName: true, email: true } },
            },
        }),
        db.businessInvite.findMany({
            where: { businessId, status: "PENDING" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, email: true, role: true, permissions: true, readOnly: true, expiresAt: true, sendCount: true, lastSentAt: true },
        }),
    ]);
    const founderId = memberships.find(member => member.role === "OWNER")?.id;
    return {
        plan,
        requests: await getTeamRequests(db, businessId, userId),
        limits: TEAM_LIMITS[plan],
        used,
        members: memberships.map(member => ({
            id: member.id,
            name: [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") || member.user.email,
            email: member.user.email,
            role: member.role,
            permissions: member.permissions,
            readOnly: member.readOnly,
            status: member.status,
            isYou: member.userId === userId,
            isFounder: member.id === founderId,
            joinedAt: member.createdAt.toISOString(),
        })),
        invites: invites.map(invite => ({
            id: invite.id,
            email: invite.email,
            role: invite.role === "OWNER" ? "OWNER" : "MEMBER",
            permissions: invite.permissions,
            readOnly: invite.readOnly,
            expiresAt: invite.expiresAt.toISOString(),
            expired: invite.expiresAt <= now,
            resendsLeft: Math.max(0, INVITE_MAX_RESENDS - (invite.sendCount - 1)),
            resendAvailableAt: new Date(invite.lastSentAt.getTime() + INVITE_RESEND_COOLDOWN_SECONDS * 1000).toISOString(),
        })),
    };
}

export type InviteInput = { email: string; role: "OWNER" | "MEMBER"; permissions: BusinessPermission[]; readOnly: boolean };

export function readInviteInput(body: unknown): InviteInput {
    const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) throw new TeamError("ჩაწერე სწორი ელფოსტა.", 422, "email");
    if (value.role !== "OWNER" && value.role !== "MEMBER") throw new TeamError("აირჩიე თანამფლობელი ან თანამშრომელი.", 422, "role");
    if (value.role === "OWNER") return { email, role: "OWNER", permissions: [], readOnly: false };
    const raw = Array.isArray(value.permissions) ? value.permissions : [];
    if (!raw.every(isBusinessPermission)) throw new TeamError("უფლებების სია არასწორია.", 422, "permissions");
    const permissions = PERMISSION_OPTIONS.map(option => option.value).filter(permission => raw.includes(permission));
    if (!permissions.length) throw new TeamError("მონიშნე ერთი უფლება მაინც.", 422, "permissions");
    return { email, role: "MEMBER", permissions, readOnly: value.readOnly === true };
}

async function lockBusiness(tx: Tx, businessId: string) {
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
}

export async function createInvite(db: Db, businessId: string, inviterId: string, input: InviteInput) {
    const now = new Date();
    const { token, tokenHash } = newInviteToken();
    const invite = await db.$transaction(async tx => {
        await lockBusiness(tx, businessId);
        const existingMember = await tx.businessMembership.findFirst({
            where: { businessId, user: { email: { equals: input.email, mode: "insensitive" } } },
            select: { userId: true },
        });
        if (existingMember?.userId === inviterId) throw new TeamError("საკუთარი თავის მოწვევა შეუძლებელია.", 422, "email");
        if (existingMember) throw new TeamError("ეს ადამიანი უკვე ამ ბიზნესის წევრია.", 409, "email");

        const pending = await tx.businessInvite.findFirst({
            where: { businessId, email: input.email, status: "PENDING" },
            select: { id: true, expiresAt: true },
        });
        if (pending && pending.expiresAt > now) {
            throw new TeamError("ამ ელფოსტაზე მოწვევა უკვე გაგზავნილია. საჭიროების შემთხვევაში ხელახლა გაუგზავნე სიიდან.", 409, "email");
        }
        // ვადაგასული მოწვევა ახალს ადგილს უთავისუფლებს.
        if (pending) await tx.businessInvite.update({ where: { id: pending.id }, data: { status: "CANCELED" } });

        const [plan, used] = await Promise.all([readPlan(tx, businessId, now), readUsage(tx, businessId, now)]);
        const limits = TEAM_LIMITS[plan];
        if (input.role === "OWNER" && used.coOwners >= limits.coOwners) {
            throw new TeamError(limits.coOwners
                ? `შენს გეგმაზე მაქსიმუმ ${limits.coOwners} თანამფლობელის დამატებაა შესაძლებელი. მეტისთვის გეგმა გააუმჯობესე.`
                : "თანამფლობელის დასამატებლად გეგმის გაუმჯობესებაა საჭირო.", 403, "role");
        }
        if (input.role === "MEMBER" && used.staff >= limits.staff) {
            throw new TeamError(limits.staff
                ? `შენს გეგმაზე მაქსიმუმ ${limits.staff} თანამშრომლის დამატებაა შესაძლებელი. მეტისთვის გეგმა გააუმჯობესე.`
                : "თანამშრომლის დასამატებლად გეგმის გაუმჯობესებაა საჭირო.", 403, "role");
        }
        if (input.permissions.some(permission => !planPermissions(plan).includes(permission))) {
            throw new TeamError(PLAN_PERMISSION_ERROR, 403, "permissions");
        }
        return tx.businessInvite.create({
            data: {
                businessId, email: input.email, role: input.role, permissions: input.permissions, readOnly: input.readOnly,
                tokenHash, expiresAt: inviteExpiry(now), lastSentAt: now, invitedById: inviterId,
            },
            select: { id: true, business: { select: { name: true } }, invitedBy: { select: { firstName: true, lastName: true, email: true } } },
        });
    });
    try {
        await sendInviteEmail({ to: input.email, token, role: input.role, businessName: invite.business.name, inviter: invite.invitedBy });
    } catch (error) {
        // გაუგზავნელი მოწვევა ადგილს არ უნდა იკავებდეს.
        await db.businessInvite.update({ where: { id: invite.id }, data: { status: "CANCELED" } });
        throw error;
    }
    return invite.id;
}

export async function resendInvite(db: Db, businessId: string, inviteId: string) {
    const now = new Date();
    const { token, tokenHash } = newInviteToken();
    const invite = await db.$transaction(async tx => {
        await lockBusiness(tx, businessId);
        const current = await tx.businessInvite.findFirst({
            where: { id: inviteId, businessId, status: "PENDING" },
            select: { sendCount: true, lastSentAt: true, expiresAt: true, role: true },
        });
        if (!current) throw new TeamError("მოწვევა ვერ მოიძებნა.", 404);
        if (current.sendCount - 1 >= INVITE_MAX_RESENDS) {
            throw new TeamError("ხელახლა გაგზავნის ლიმიტი ამოიწურა. გააუქმე მოწვევა და შექმენი ახალი.", 429);
        }
        const waitMs = current.lastSentAt.getTime() + INVITE_RESEND_COOLDOWN_SECONDS * 1000 - now.getTime();
        if (waitMs > 0) throw new TeamError(`ხელახლა გაგზავნა ${Math.ceil(waitMs / 1000)} წამში შეგიძლია.`, 429);
        // ვადაგასული მოწვევის განახლებისას ლიმიტი თავიდან მოწმდება.
        if (current.expiresAt <= now) {
            const [plan, used] = await Promise.all([readPlan(tx, businessId, now), readUsage(tx, businessId, now)]);
            const limits = TEAM_LIMITS[plan];
            if (current.role === "OWNER" ? used.coOwners >= limits.coOwners : used.staff >= limits.staff) {
                throw new TeamError("გეგმის ლიმიტი შევსებულია. მოწვევის განახლებისთვის გეგმა გააუმჯობესე.", 403);
            }
        }
        // ახალი ტოკენი ძველ ლინკს აუქმებს.
        return tx.businessInvite.update({
            where: { id: inviteId },
            data: { tokenHash, expiresAt: inviteExpiry(now), lastSentAt: now, sendCount: { increment: 1 } },
            select: {
                email: true, role: true,
                business: { select: { name: true } },
                invitedBy: { select: { firstName: true, lastName: true, email: true } },
            },
        });
    });
    await sendInviteEmail({
        to: invite.email, token, role: invite.role === "OWNER" ? "OWNER" : "MEMBER",
        businessName: invite.business.name, inviter: invite.invitedBy,
    });
}

export async function cancelInvite(db: Db, businessId: string, inviteId: string) {
    const { count } = await db.businessInvite.updateMany({
        where: { id: inviteId, businessId, status: "PENDING" },
        data: { status: "CANCELED" },
    });
    if (!count) throw new TeamError("მოწვევა ვერ მოიძებნა.", 404);
}

async function sendInviteEmail({ to, token, role, businessName, inviter }: {
    to: string;
    token: string;
    role: "OWNER" | "MEMBER";
    businessName: string;
    inviter: { firstName: string | null; lastName: string | null; email: string } | null;
}) {
    const apiKey = readServerSetting("RESEND_API_KEY");
    const from = readServerSetting("RESEND_FROM_EMAIL");
    if (!apiKey || !from) throw new Error("Missing email server configuration");

    const url = new URL("/invite", getAppOrigin());
    // ფრაგმენტი სერვერის ლოგებში არ ხვდება.
    url.hash = new URLSearchParams({ token }).toString();
    const link = url.toString();
    const inviterName = inviter ? [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") || inviter.email : "ბიზნესის მფლობელი";
    const roleText = role === "OWNER" ? "თანამფლობელად" : "თანამშრომლად";

    await reserveDelivery("email", to);
    const { error } = await new Resend(apiKey).emails.send({
        from,
        to: [to],
        subject: `MARTEO - მოწვევა ბიზნესში „${businessName}“`,
        text: [
            `${inviterName} გიწვევს ბიზნესში „${businessName}“ ${roleText}.`,
            "მოწვევის მისაღებად გახსენი ბმული:",
            link,
            `ბმული მოქმედებს ${INVITE_LIFETIME_HOURS} საათის განმავლობაში და ერთჯერადია.`,
            "თუ ამ ადამიანს არ იცნობ, უგულებელყავი ეს წერილი.",
        ].join("\n\n"),
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
                <h2>მოწვევა MARTEO-ში</h2>
                <p><strong>${escapeHtml(inviterName)}</strong> გიწვევს ბიზნესში <strong>„${escapeHtml(businessName)}“</strong> ${roleText}.</p>
                <a href="${link}" style="display:inline-block;margin:16px 0;padding:14px 22px;background:#16c45b;color:#081f16;text-decoration:none;font-weight:700;border-radius:12px">
                    მოწვევის მიღება
                </a>
                <p>ბმული მოქმედებს ${INVITE_LIFETIME_HOURS} საათის განმავლობაში და ერთჯერადია.</p>
                <p>თუ ამ ადამიანს არ იცნობ, უგულებელყავი ეს წერილი.</p>
                <p>MARTEO.GE</p>
            </div>
        `,
    });
    if (error) throw new Error("Invite email delivery failed");
}
