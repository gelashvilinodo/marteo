import "server-only";
import bcrypt from "bcryptjs";
import type { createPrismaClient } from "@/lib/prisma";
import { runInBackground, sendPushToUsers } from "@/lib/push/web-push";
import { createPrismaClient as newClient } from "@/lib/prisma";
import { isBusinessPermission, type BusinessPermission } from "./permissions";
import { PERMISSION_OPTIONS, TEAM_LIMITS, type TeamRequestView } from "./team";
import { readPlan, TeamError } from "./team-server";

type Db = ReturnType<typeof createPrismaClient>;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];

const SETTINGS_URL = "/dashboard/business-settings";

type Notice = { userIds: string[]; businessId: string | null; title: string; body: string; actionUrl: string | null; key: string };

const fullName = (user: { firstName: string | null; lastName: string | null; email: string } | null | undefined) =>
    user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : "წევრი";

async function lockBusiness(tx: Tx, businessId: string) {
    const [row] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Business" WHERE id = ${businessId} FOR UPDATE`;
    if (!row) throw new TeamError("ბიზნესი ვერ მოიძებნა.", 404);
}

async function activeOwners(tx: Tx, businessId: string) {
    return tx.businessMembership.findMany({
        where: { businessId, role: "OWNER", status: "ACTIVE" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { userId: true, user: { select: { firstName: true, lastName: true, email: true } } },
    });
}

async function requireOwner(tx: Tx, businessId: string, userId: string) {
    const member = await tx.businessMembership.findUnique({
        where: { userId_businessId: { userId, businessId } },
        select: { role: true, status: true, user: { select: { firstName: true, lastName: true, email: true, password: true } } },
    });
    if (!member || member.role !== "OWNER" || member.status !== "ACTIVE") throw new TeamError("ეს მხოლოდ ბიზნესის მფლობელს შეუძლია.", 403);
    return member;
}

async function writeNotices(tx: Tx, notices: Notice[]) {
    for (const notice of notices) {
        for (const userId of notice.userIds) {
            await tx.notification.create({
                data: {
                    userId, businessId: notice.businessId, kind: "TEAM", title: notice.title, body: notice.body,
                    actionLabel: notice.actionUrl ? "ნახვა" : null, actionUrl: notice.actionUrl,
                    dedupeKey: `${notice.key}:${userId}`,
                },
            });
        }
    }
}

// push ტრანზაქციის შემდეგ იგზავნება და მოთხოვნას არასოდეს აფერხებს.
function pushNotices(notices: Notice[]) {
    for (const notice of notices) {
        if (!notice.userIds.length) continue;
        const client = newClient();
        runInBackground(sendPushToUsers(client, notice.userIds, {
            title: notice.title, body: notice.body, url: notice.actionUrl ?? "/dashboard", tag: "team",
        }).finally(() => client.$disconnect()));
    }
}

// გეგმის ლიმიტის მიღმა დარჩენილი წევრები იყინება: ბოლოს დამატებული პირველი.
// ადგილის გათავისუფლებისას ჯერ ყველაზე ადრე დამატებული იღვიძებს.
// დამფუძნებელი (პირველი მფლობელი) არასოდეს იყინება.
export async function enforceTeamLimits(tx: Tx, businessId: string) {
    const limits = TEAM_LIMITS[await readPlan(tx, businessId, new Date())];
    const members = await tx.businessMembership.findMany({
        where: { businessId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, role: true, status: true },
    });
    const owners = members.filter(member => member.role === "OWNER");
    const coOwners = owners.slice(1);
    const staff = members.filter(member => member.role !== "OWNER");
    const wanted = new Map<string, "ACTIVE" | "FROZEN">();
    if (owners[0]) wanted.set(owners[0].id, "ACTIVE");
    coOwners.forEach((member, index) => wanted.set(member.id, index < limits.coOwners ? "ACTIVE" : "FROZEN"));
    staff.forEach((member, index) => wanted.set(member.id, index < limits.staff ? "ACTIVE" : "FROZEN"));
    for (const member of members) {
        const status = wanted.get(member.id)!;
        if (member.status !== status) await tx.businessMembership.update({ where: { id: member.id }, data: { status } });
    }
}

export async function enforceTeamLimitsFor(db: Db, businessIds: string[]) {
    for (const businessId of businessIds) {
        await db.$transaction(async tx => {
            await lockBusiness(tx, businessId);
            await enforceTeamLimits(tx, businessId);
        }).catch(error => console.error("Team limit check failed", error instanceof Error ? error.message : "UnknownError"));
    }
}

function readPermissions(body: Record<string, unknown>) {
    const raw = Array.isArray(body.permissions) ? body.permissions : [];
    if (!raw.every(isBusinessPermission)) throw new TeamError("უფლებების სია არასწორია.");
    const permissions = PERMISSION_OPTIONS.map(option => option.value).filter(value => raw.includes(value)) as BusinessPermission[];
    if (!permissions.length) throw new TeamError("მონიშნე ერთი უფლება მაინც.");
    return { permissions, readOnly: body.readOnly === true };
}

export async function updateStaffAccess(db: Db, businessId: string, actorId: string, membershipId: string, body: Record<string, unknown>) {
    const input = readPermissions(body);
    await db.$transaction(async tx => {
        await lockBusiness(tx, businessId);
        await requireOwner(tx, businessId, actorId);
        const target = await tx.businessMembership.findFirst({ where: { id: membershipId, businessId }, select: { role: true } });
        if (!target) throw new TeamError("წევრი ვერ მოიძებნა.", 404);
        if (target.role === "OWNER") throw new TeamError("თანამფლობელის უფლებები არ იცვლება.", 403);
        await tx.businessMembership.update({ where: { id: membershipId }, data: input });
    });
}

export async function leaveBusiness(db: Db, businessId: string, userId: string) {
    const notices: Notice[] = [];
    await db.$transaction(async tx => {
        await lockBusiness(tx, businessId);
        const member = await tx.businessMembership.findUnique({
            where: { userId_businessId: { userId, businessId } },
            select: { id: true, role: true, user: { select: { firstName: true, lastName: true, email: true } }, business: { select: { name: true } } },
        });
        if (!member) throw new TeamError("ამ ბიზნესის წევრი აღარ ხარ.", 404);
        const owners = await activeOwners(tx, businessId);
        if (member.role === "OWNER" && owners.length <= 1 && owners.some(owner => owner.userId === userId)) {
            throw new TeamError("შენ ერთადერთი მფლობელი ხარ. ბიზნესის დატოვება მხოლოდ მისი წაშლით შეიძლება.", 409);
        }
        await tx.businessMembership.delete({ where: { id: member.id } });
        // მის შესახებ ღია მოთხოვნებს აზრი აღარ აქვს.
        await tx.businessConsentRequest.updateMany({
            where: { businessId, status: "PENDING", targetUserId: userId },
            data: { status: "CANCELED", resolvedAt: new Date() },
        });
        await tx.businessConsentVote.deleteMany({ where: { userId, request: { businessId, status: "PENDING" } } });
        const remaining = owners.filter(owner => owner.userId !== userId).map(owner => owner.userId);
        notices.push({
            userIds: remaining, businessId, title: "წევრმა დატოვა ბიზნესი",
            body: `${fullName(member.user)}-მა დატოვა ბიზნესი „${member.business.name}“.`,
            actionUrl: SETTINGS_URL, key: `team-left:${member.id}`,
        });
        await writeNotices(tx, notices);
        // მფლობელის წასვლით შეიძლება ღია მოთხოვნას ყველა თანხმობა უკვე ჰქონდეს.
        const pending = await tx.businessConsentRequest.findMany({ where: { businessId, status: "PENDING" }, select: { id: true } });
        for (const request of pending) notices.push(...await settle(tx, request.id));
    });
    pushNotices(notices);
}

async function requestNames(tx: Tx, requestId: string) {
    return tx.businessConsentRequest.findUnique({
        where: { id: requestId },
        select: {
            id: true, businessId: true, kind: true, status: true, targetUserId: true, targetName: true, requestedById: true,
            business: { select: { name: true } },
            requestedBy: { select: { firstName: true, lastName: true, email: true } },
            votes: { select: { userId: true, approve: true } },
        },
    });
}

// ყველა აქტიური მფლობელი თანახმაა: ქმედება სრულდება.
async function settle(tx: Tx, requestId: string): Promise<Notice[]> {
    const request = await requestNames(tx, requestId);
    if (!request || request.status !== "PENDING") return [];
    const owners = await activeOwners(tx, request.businessId);
    const approved = new Set(request.votes.filter(vote => vote.approve).map(vote => vote.userId));
    if (!owners.length || !owners.every(owner => approved.has(owner.userId))) return [];

    const now = new Date();
    await tx.businessConsentRequest.update({ where: { id: request.id }, data: { status: "APPROVED", resolvedAt: now } });
    if (request.kind === "REMOVE_MEMBER") {
        const removed = request.targetUserId
            ? await tx.businessMembership.deleteMany({ where: { businessId: request.businessId, userId: request.targetUserId, role: { not: "OWNER" } } })
            : { count: 0 };
        if (!removed.count) return [];
        const notices: Notice[] = [
            {
                userIds: owners.map(owner => owner.userId), businessId: request.businessId, title: "წევრი გუნდიდან გავიდა",
                body: `${request.targetName ?? "წევრი"} აღარ არის ბიზნესის „${request.business.name}“ წევრი.`,
                actionUrl: SETTINGS_URL, key: `consent-done:${request.id}`,
            },
            {
                userIds: [request.targetUserId!], businessId: null, title: "ბიზნესზე წვდომა დასრულდა",
                body: `ბიზნესის „${request.business.name}“ მფლობელებმა გუნდიდან გაგიყვანეს.`,
                actionUrl: null, key: `consent-removed:${request.id}`,
            },
        ];
        await writeNotices(tx, notices);
        return notices;
    }
    // ბიზნესის წაშლა: შეტყობინება ბიზნესზე არ მიება, რომ წაშლას გადაურჩეს.
    const members = await tx.businessMembership.findMany({ where: { businessId: request.businessId }, select: { userId: true } });
    await tx.business.delete({ where: { id: request.businessId } });
    const notices: Notice[] = [{
        userIds: members.map(member => member.userId), businessId: null, title: "ბიზნესი წაიშალა",
        body: `ბიზნესი „${request.business.name}“ ყველა მფლობელის თანხმობით წაიშალა.`,
        actionUrl: null, key: `business-deleted:${request.id}`,
    }];
    await writeNotices(tx, notices);
    return notices;
}

async function openRequest(db: Db, businessId: string, actorId: string, kind: "REMOVE_MEMBER" | "DELETE_BUSINESS",
    prepare: (tx: Tx, actor: Awaited<ReturnType<typeof requireOwner>>) => Promise<{ targetUserId: string | null; targetName: string | null; text: (business: string) => string }>) {
    const notices: Notice[] = [];
    let done = false;
    await db.$transaction(async tx => {
        await lockBusiness(tx, businessId);
        const actor = await requireOwner(tx, businessId, actorId);
        const target = await prepare(tx, actor);
        const existing = await tx.businessConsentRequest.findFirst({
            where: { businessId, kind, status: "PENDING", targetUserId: target.targetUserId },
            select: { id: true },
        });
        if (existing) throw new TeamError("ეს მოთხოვნა უკვე გაგზავნილია და მფლობელების თანხმობას ელოდება.", 409);
        const request = await tx.businessConsentRequest.create({
            data: {
                businessId, kind, targetUserId: target.targetUserId, targetName: target.targetName, requestedById: actorId,
                votes: { create: { userId: actorId, approve: true } },
            },
            select: { id: true, business: { select: { name: true } } },
        });
        const finished = await settle(tx, request.id);
        if (finished.length) {
            notices.push(...finished);
            done = true;
            return;
        }
        const others = (await activeOwners(tx, businessId)).filter(owner => owner.userId !== actorId).map(owner => owner.userId);
        const ask: Notice = {
            userIds: others, businessId, title: kind === "DELETE_BUSINESS" ? "ბიზნესის წაშლა თანხმობას ელოდება" : "წევრის გაშვება თანხმობას ელოდება",
            body: `${fullName(actor.user)}-ს სურს ${target.text(request.business.name)} ეთანხმები?`,
            actionUrl: SETTINGS_URL, key: `consent-ask:${request.id}`,
        };
        await writeNotices(tx, [ask]);
        notices.push(ask);
    });
    pushNotices(notices);
    return done;
}

export function requestRemoval(db: Db, businessId: string, actorId: string, membershipId: string) {
    return openRequest(db, businessId, actorId, "REMOVE_MEMBER", async tx => {
        const target = await tx.businessMembership.findFirst({
            where: { id: membershipId, businessId },
            select: { userId: true, role: true, user: { select: { firstName: true, lastName: true, email: true } } },
        });
        if (!target) throw new TeamError("წევრი ვერ მოიძებნა.", 404);
        if (target.role === "OWNER") throw new TeamError("თანამფლობელს ვერავინ გაუშვებს. ის ბიზნესს მხოლოდ თავისი ნებით დატოვებს.", 403);
        const name = fullName(target.user);
        return { targetUserId: target.userId, targetName: name, text: business => `${name}-ის გაშვება ბიზნესიდან „${business}“.` };
    });
}

export function requestDeletion(db: Db, businessId: string, actorId: string, body: Record<string, unknown>) {
    const confirmName = typeof body.confirmName === "string" ? body.confirmName.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    return openRequest(db, businessId, actorId, "DELETE_BUSINESS", async (tx, actor) => {
        const business = await tx.business.findUnique({ where: { id: businessId }, select: { name: true } });
        if (!business || confirmName !== business.name.trim()) throw new TeamError("ბიზნესის სახელი არ ემთხვევა.", 422);
        if (!password || !(await bcrypt.compare(password, actor.user.password))) throw new TeamError("პაროლი არასწორია.", 401);
        return { targetUserId: null, targetName: null, text: name => `ბიზნესის „${name}“ სამუდამოდ წაშლა.` };
    });
}

export async function voteOnRequest(db: Db, businessId: string, actorId: string, requestId: string, approve: boolean) {
    const notices: Notice[] = [];
    let deleted = false;
    await db.$transaction(async tx => {
        await lockBusiness(tx, businessId);
        const actor = await requireOwner(tx, businessId, actorId);
        const request = await requestNames(tx, requestId);
        if (!request || request.businessId !== businessId || request.status !== "PENDING") throw new TeamError("მოთხოვნა უკვე დახურულია.", 409);
        await tx.businessConsentVote.upsert({
            where: { requestId_userId: { requestId, userId: actorId } },
            create: { requestId, userId: actorId, approve },
            update: { approve },
        });
        if (!approve) {
            await tx.businessConsentRequest.update({ where: { id: requestId }, data: { status: "REJECTED", resolvedAt: new Date() } });
            const owners = (await activeOwners(tx, businessId)).map(owner => owner.userId).filter(id => id !== actorId);
            const notice: Notice = {
                userIds: owners, businessId, title: "მოთხოვნა უარყოფილია",
                body: `${fullName(actor.user)} არ დაეთანხმა ${request.kind === "DELETE_BUSINESS" ? "ბიზნესის წაშლას" : `${request.targetName ?? "წევრის"} გაშვებას`}.`,
                actionUrl: SETTINGS_URL, key: `consent-rejected:${requestId}`,
            };
            await writeNotices(tx, [notice]);
            notices.push(notice);
            return;
        }
        const finished = await settle(tx, requestId);
        deleted = finished.length > 0 && request.kind === "DELETE_BUSINESS";
        notices.push(...finished);
    });
    pushNotices(notices);
    return { deleted };
}

export async function cancelRequest(db: Db, businessId: string, actorId: string, requestId: string) {
    const { count } = await db.businessConsentRequest.updateMany({
        where: { id: requestId, businessId, status: "PENDING", requestedById: actorId },
        data: { status: "CANCELED", resolvedAt: new Date() },
    });
    if (!count) throw new TeamError("მოთხოვნა ვერ მოიძებნა ან უკვე დახურულია.", 404);
}

export async function getTeamRequests(db: Db, businessId: string, userId: string): Promise<TeamRequestView[]> {
    const [requests, owners] = await Promise.all([
        db.businessConsentRequest.findMany({
            where: { businessId, status: "PENDING" },
            orderBy: { createdAt: "asc" },
            select: {
                id: true, kind: true, targetName: true, requestedById: true,
                requestedBy: { select: { firstName: true, lastName: true, email: true } },
                votes: { where: { approve: true }, select: { userId: true } },
            },
        }),
        db.businessMembership.findMany({
            where: { businessId, role: "OWNER", status: "ACTIVE" },
            select: { userId: true, user: { select: { firstName: true, lastName: true, email: true } } },
        }),
    ]);
    return requests.map(request => {
        const approved = new Set(request.votes.map(vote => vote.userId));
        return {
            id: request.id,
            kind: request.kind,
            targetName: request.targetName,
            requestedByName: fullName(request.requestedBy),
            requestedByYou: request.requestedById === userId,
            youApproved: approved.has(userId),
            waitingFor: owners.filter(owner => !approved.has(owner.userId)).map(owner => fullName(owner.user)),
        };
    });
}
