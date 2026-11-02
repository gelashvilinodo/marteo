import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import type { createPrismaClient } from "@/lib/prisma";
import { isAllowedSmsPhone, normalizePhone } from "@/lib/security/phone";
import { hashInviteToken, TeamError } from "./team-server";

type Db = ReturnType<typeof createPrismaClient>;

const SESSION_DURATION_DAYS = 30;
// შეუსაბამო მცდელობაც იგივე დროს ხარჯავს, რომ ანგარიშის არსებობა არ გამოჩნდეს.
const DUMMY_PASSWORD_HASH = "$2b$12$mcKp3BjwNCDbYmxmx/w/CuwumeMqzXCsU3YgwFrypd92wS98D2AEW";

export function readInviteToken(value: unknown) {
    return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : "";
}

export type InviteDetails = {
    email: string;
    role: "OWNER" | "MEMBER";
    permissions: string[];
    readOnly: boolean;
    businessName: string;
    inviterName: string;
    accountExists: boolean;
};

// null: ბმული არასწორია, უკვე გამოყენებულია ან გაუქმებულია.
export async function lookupInvite(db: Db, token: string): Promise<{ expired: true } | { expired: false; invite: InviteDetails } | null> {
    const invite = await db.businessInvite.findUnique({
        where: { tokenHash: hashInviteToken(token) },
        select: {
            email: true, role: true, permissions: true, readOnly: true, status: true, expiresAt: true,
            business: { select: { name: true } },
            invitedBy: { select: { firstName: true, lastName: true, email: true } },
        },
    });
    if (!invite || invite.status !== "PENDING") return null;
    if (invite.expiresAt <= new Date()) return { expired: true };
    const account = await db.user.findFirst({
        where: { email: { equals: invite.email, mode: "insensitive" } },
        select: { id: true },
    });
    const inviter = invite.invitedBy;
    return {
        expired: false,
        invite: {
            email: invite.email,
            role: invite.role === "OWNER" ? "OWNER" : "MEMBER",
            permissions: invite.permissions,
            readOnly: invite.readOnly,
            businessName: invite.business.name,
            inviterName: inviter ? [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") || inviter.email : "ბიზნესის მფლობელი",
            accountExists: Boolean(account),
        },
    };
}

export type NewAccount = { firstName: string; lastName: string; phone: string; password: string };

export function readNewAccount(body: Record<string, unknown>): NewAccount {
    const text = (key: string) => typeof body[key] === "string" ? (body[key] as string).trim() : "";
    const firstName = text("firstName"), lastName = text("lastName");
    const phone = normalizePhone(text("phone"));
    const password = typeof body.password === "string" ? body.password : "";
    if (!firstName || !lastName) throw new TeamError("ჩაწერე სახელი და გვარი.");
    if (firstName.length > 100 || lastName.length > 100) throw new TeamError("სახელი ან გვარი ძალიან გრძელია.");
    if (!isAllowedSmsPhone(phone)) throw new TeamError("ჩაწერე მობილურის ნომერი, მაგალითად 599123456.");
    if (password.length < 8) throw new TeamError("პაროლი მინიმუმ 8 სიმბოლო უნდა იყოს.");
    if (password.length > 200) throw new TeamError("პაროლი ძალიან გრძელია.");
    return { firstName, lastName, phone, password };
}

type AcceptInput =
    | { kind: "new"; account: NewAccount }
    | { kind: "existing"; password: string }
    | { kind: "signed-in"; userId: string };

// აბრუნებს ბიზნესს და, თუ საჭიროა, ახალ სესიას. ინვაიტი ერთჯერადია:
// მისი სტრიქონი იბლოკება, ამიტომ ორი ერთდროული მიღება ორ წევრობას ვერ შექმნის.
export async function acceptInvite(db: Db, token: string, input: AcceptInput) {
    const tokenHash = hashInviteToken(token);
    const passwordHash = input.kind === "new" ? await bcrypt.hash(input.account.password, 12) : null;

    const result = await db.$transaction(async tx => {
        const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "BusinessInvite" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
        `;
        const invite = locked && await tx.businessInvite.findUnique({
            where: { id: locked.id },
            select: {
                id: true, businessId: true, email: true, role: true, permissions: true, readOnly: true,
                status: true, expiresAt: true, invitedById: true, business: { select: { name: true } },
            },
        });
        if (!invite || invite.status !== "PENDING") throw new TeamError("მოწვევა ვერ მოიძებნა ან უკვე გამოყენებულია.", 404);
        const now = new Date();
        if (invite.expiresAt <= now) throw new TeamError("მოწვევის ბმულს ვადა გაუვიდა. სთხოვე მომწვევს ხელახლა გაგზავნა.", 410);

        const existing = await tx.user.findFirst({
            where: { email: { equals: invite.email, mode: "insensitive" } },
            select: { id: true, password: true, status: true, emailVerifiedAt: true },
        });

        let userId: string;
        if (input.kind === "new") {
            if (existing) throw new TeamError("ამ ელფოსტით ანგარიში უკვე არსებობს. შედი შენი პაროლით.", 409);
            const phoneTaken = await tx.user.findUnique({ where: { phone: input.account.phone }, select: { id: true } });
            if (phoneTaken) throw new TeamError("ეს ტელეფონის ნომერი უკვე გამოყენებულია.", 409);
            const created = await tx.user.create({
                data: {
                    email: invite.email,
                    password: passwordHash!,
                    firstName: input.account.firstName,
                    lastName: input.account.lastName,
                    phone: input.account.phone,
                    status: "ACTIVE",
                    // ბმული ამ ელფოსტაზე მივიდა, ეს საკმარისი დადასტურებაა.
                    emailVerifiedAt: now,
                },
                select: { id: true },
            });
            userId = created.id;
        } else if (input.kind === "existing") {
            const valid = await bcrypt.compare(input.password, existing?.password ?? DUMMY_PASSWORD_HASH);
            if (!existing || !valid) throw new TeamError("პაროლი არასწორია.", 401);
            if (existing.status === "SUSPENDED") throw new TeamError("ეს ანგარიში შეჩერებულია.", 403);
            userId = existing.id;
        } else {
            if (!existing || existing.id !== input.userId) {
                throw new TeamError("მოწვევა სხვა ელფოსტაზეა გაგზავნილი. შედი იმ ანგარიშით.", 403);
            }
            userId = existing.id;
        }
        // რეგისტრაცია, რომელიც შუაში შეჩერდა, მოწვევით სრულდება.
        if (existing && existing.status === "PENDING_VERIFICATION") {
            await tx.user.update({ where: { id: existing.id }, data: { status: "ACTIVE", emailVerifiedAt: existing.emailVerifiedAt ?? now } });
        }

        const already = await tx.businessMembership.findUnique({
            where: { userId_businessId: { userId, businessId: invite.businessId } },
            select: { id: true },
        });
        if (!already) {
            await tx.businessMembership.create({
                data: {
                    userId, businessId: invite.businessId, role: invite.role,
                    permissions: invite.role === "OWNER" ? [] : invite.permissions,
                    readOnly: invite.role === "OWNER" ? false : invite.readOnly,
                    invitedById: invite.invitedById,
                },
            });
        }
        await tx.businessInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED", acceptedAt: now } });

        const memberName = input.kind === "new"
            ? `${input.account.firstName} ${input.account.lastName}`
            : await tx.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, email: true } })
                .then(user => [user?.firstName, user?.lastName].filter(Boolean).join(" ") || invite.email);
        const roleText = invite.role === "OWNER" ? "თანამფლობელად" : "თანამშრომლად";
        const message = `${memberName} დაემატა ბიზნესში „${invite.business.name}“ ${roleText}.`;

        // მომწვევს ვატყობინებთ მხოლოდ მაშინ, თუ ის ჯერ კიდევ ამ ბიზნესშია.
        const inviter = invite.invitedById && invite.invitedById !== userId
            ? await tx.businessMembership.findUnique({
                where: { userId_businessId: { userId: invite.invitedById, businessId: invite.businessId } },
                select: { userId: true, status: true },
            })
            : null;
        if (inviter?.status === "ACTIVE") {
            await tx.notification.create({
                data: {
                    userId: inviter.userId, businessId: invite.businessId, kind: "TEAM",
                    title: "ახალი წევრი გუნდში", body: message,
                    actionLabel: "გუნდის ნახვა", actionUrl: "/dashboard/business-settings",
                    dedupeKey: `team-joined:${invite.id}`,
                },
            });
        }
        return { userId, businessId: invite.businessId, notifyUserId: inviter?.status === "ACTIVE" ? inviter.userId : null, message };
    });

    let session: { token: string; expiresAt: Date } | null = null;
    if (input.kind !== "signed-in") {
        const sessionToken = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 86400_000);
        await db.session.create({
            data: { userId: result.userId, tokenHash: createHash("sha256").update(sessionToken).digest("hex"), expiresAt },
        });
        session = { token: sessionToken, expiresAt };
    }
    return { ...result, session };
}
