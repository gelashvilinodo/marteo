import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { createPrismaClient } from "@/lib/prisma";
import { getAdminUser } from "@/lib/admin/authorization";
import { AdminAccessError } from "@/lib/admin/overview";
import { isBusinessMode, type BusinessMode } from "@/lib/business/business-mode";
import { audienceMatch, PLAN_AUDIENCES, type Audience, type PlanAudience } from "./audience";

export class CampaignInputError extends Error {}

export type CampaignInput = {
    title: string; body: string; actionLabel: string | null; actionUrl: string | null;
    audience: Audience; deliverAt: Date;
};

const LIMITS = { title: 120, body: 2000, actionLabel: 40, actionUrl: 300 };
const MAX_SCHEDULE_MS = 366 * 86400000;

function text(value: unknown, field: keyof typeof LIMITS, required: boolean) {
    const result = typeof value === "string" ? value.trim() : "";
    if (required && !result) throw new CampaignInputError(field === "title" ? "სათაური აუცილებელია." : "ტექსტი აუცილებელია.");
    if (result.length > LIMITS[field]) throw new CampaignInputError(`ველი ძალიან გრძელია (მაქს. ${LIMITS[field]} სიმბოლო).`);
    return result || null;
}

// Links stay inside MARTEO: a relative path, never "//host", a scheme or backslashes.
function internalPath(value: unknown) {
    const path = text(value, "actionUrl", false);
    if (path && (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))) {
        throw new CampaignInputError("ბმული უნდა იწყებოდეს „/“-ით, მაგ. /dashboard/inventory.");
    }
    return path;
}

/** "YYYY-MM-DDTHH:mm" from a datetime-local input, interpreted as Tbilisi time (UTC+4, no DST). */
export function parseTbilisiDateTime(value: unknown, now = new Date()) {
    if (value === null || value === undefined || value === "") return now;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new CampaignInputError("თარიღი არასწორია.");
    const date = new Date(`${value}:00+04:00`);
    if (Number.isNaN(date.getTime())) throw new CampaignInputError("თარიღი არასწორია.");
    if (date.getTime() - now.getTime() > MAX_SCHEDULE_MS) throw new CampaignInputError("დაგეგმვა შესაძლებელია მაქსიმუმ ერთი წლით ადრე.");
    return date < now ? now : date;
}

export function parseAudience(value: unknown): Audience {
    const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
    const modes = Array.isArray(raw.modes) ? [...new Set(raw.modes.filter(isBusinessMode))] as BusinessMode[] : [];
    const plan = PLAN_AUDIENCES.some(p => p.value === raw.plan) ? raw.plan as PlanAudience : "ALL";
    const days = raw.registeredWithinDays === null || raw.registeredWithinDays === undefined || raw.registeredWithinDays === "" ? null : Number(raw.registeredWithinDays);
    if (days !== null && (!Number.isSafeInteger(days) || days < 1 || days > 365)) throw new CampaignInputError("რეგისტრაციის პერიოდი უნდა იყოს 1–365 დღე.");
    return { modes: modes.length === 3 ? [] : modes, plan, registeredWithinDays: days };
}

export function parseCampaignInput(body: Record<string, unknown>, now = new Date()): CampaignInput {
    const actionUrl = internalPath(body.actionUrl);
    return {
        title: text(body.title, "title", true)!,
        body: text(body.body, "body", true)!,
        actionLabel: actionUrl ? text(body.actionLabel, "actionLabel", false) : null,
        actionUrl,
        audience: parseAudience(body.audience),
        deliverAt: parseTbilisiDateTime(body.deliverAt, now),
    };
}

async function withAdmin<T>(run: (db: ReturnType<typeof createPrismaClient>, adminId: string) => Promise<T>) {
    // Check at the data boundary too: layout checks alone do not protect data.
    const admin = await getAdminUser();
    if (!admin) throw new AdminAccessError();
    const db = createPrismaClient();
    try { return await run(db, admin.id); } finally { await db.$disconnect(); }
}

export function countAudience(audience: Audience, deliverAt: Date) {
    return withAdmin(async db => {
        const match = audienceMatch({
            modes: Prisma.sql`${audience.modes}::"BusinessMode"[]`, plan: Prisma.sql`${audience.plan}::text`,
            days: Prisma.sql`${audience.registeredWithinDays}::int`, deliverAt: Prisma.sql`${deliverAt}::timestamp(3)`,
        });
        const [row] = await db.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM "User" u WHERE u.status = 'ACTIVE' AND ${match}`;
        return row?.total ?? 0;
    });
}

export type CampaignRow = {
    id: string; title: string; body: string; actionLabel: string | null; actionUrl: string | null;
    modes: BusinessMode[]; plan: PlanAudience; registeredWithinDays: number | null;
    deliverAt: Date; canceledAt: Date | null; createdAt: Date; delivered: number; read: number;
};

const CAMPAIGN_COLUMNS = Prisma.sql`c.id, c.title, c.body, c."actionLabel", c."actionUrl", c.modes::text[] AS modes, c.plan::text AS plan,
    c."registeredWithinDays", c."deliverAt", c."canceledAt", c."createdAt",
    (SELECT count(*)::int FROM "Notification" n WHERE n."campaignId" = c.id) AS delivered,
    (SELECT count(*)::int FROM "Notification" n WHERE n."campaignId" = c.id AND n."readAt" IS NOT NULL) AS read`;

export function listCampaigns() {
    return withAdmin(db => db.$queryRaw<CampaignRow[]>`
        SELECT ${CAMPAIGN_COLUMNS} FROM "NotificationCampaign" c ORDER BY c."deliverAt" DESC, c.id LIMIT 200
    `);
}

export function getCampaign(id: string) {
    return withAdmin(async db => {
        const [row] = await db.$queryRaw<CampaignRow[]>`SELECT ${CAMPAIGN_COLUMNS} FROM "NotificationCampaign" c WHERE c.id = ${id}`;
        return row ?? null;
    });
}

export function createCampaign(input: CampaignInput) {
    return withAdmin(async (db, adminId) => {
        const [row] = await db.$queryRaw<{ id: string }[]>`
            INSERT INTO "NotificationCampaign" (id, title, body, "actionLabel", "actionUrl", modes, plan, "registeredWithinDays", "deliverAt", "createdById", "createdAt", "updatedAt")
            VALUES (gen_random_uuid()::text, ${input.title}, ${input.body}, ${input.actionLabel}, ${input.actionUrl},
                ${input.audience.modes}::"BusinessMode"[], ${input.audience.plan}::"NotificationPlanAudience", ${input.audience.registeredWithinDays}::int,
                ${input.deliverAt}, ${adminId}, now(), now())
            RETURNING id
        `;
        return row.id;
    });
}

// Only still-scheduled campaigns change: once delivered, recipients already have their copy.
export function updateCampaign(id: string, input: CampaignInput, now = new Date()) {
    return withAdmin(async db => {
        const count = await db.$executeRaw`
            UPDATE "NotificationCampaign" SET title = ${input.title}, body = ${input.body}, "actionLabel" = ${input.actionLabel}, "actionUrl" = ${input.actionUrl},
                modes = ${input.audience.modes}::"BusinessMode"[], plan = ${input.audience.plan}::"NotificationPlanAudience",
                "registeredWithinDays" = ${input.audience.registeredWithinDays}::int, "deliverAt" = ${input.deliverAt}, "updatedAt" = now()
            WHERE id = ${id} AND "canceledAt" IS NULL AND "deliverAt" > ${now}
        `;
        if (!count) throw new CampaignInputError("შეცვლა შეუძლებელია: შეტყობინება უკვე გაიგზავნა ან გაუქმდა.");
    });
}

export function cancelCampaign(id: string, now = new Date()) {
    return withAdmin(async db => {
        const count = await db.$executeRaw`
            UPDATE "NotificationCampaign" SET "canceledAt" = ${now}, "updatedAt" = now()
            WHERE id = ${id} AND "canceledAt" IS NULL AND "deliverAt" > ${now}
        `;
        if (!count) throw new CampaignInputError("გაუქმება შეუძლებელია: შეტყობინება უკვე გაიგზავნა ან გაუქმდა.");
    });
}

export type WelcomeTemplate = { title: string; body: string; actionLabel: string | null; actionUrl: string | null; updatedAt: Date };

export function getWelcomeTemplate() {
    return withAdmin(async db => {
        const [row] = await db.$queryRaw<WelcomeTemplate[]>`
            SELECT title, body, "actionLabel", "actionUrl", "updatedAt" FROM "NotificationTemplate" WHERE key = 'WELCOME'
        `;
        return row ?? null;
    });
}

export function updateWelcomeTemplate(body: Record<string, unknown>) {
    const actionUrl = internalPath(body.actionUrl);
    const values = {
        title: text(body.title, "title", true)!, body: text(body.body, "body", true)!,
        actionLabel: actionUrl ? text(body.actionLabel, "actionLabel", false) : null, actionUrl,
    };
    // Upsert keeps the original createdAt, which decides who is "new" enough to be greeted.
    return withAdmin(db => db.$executeRaw`
        INSERT INTO "NotificationTemplate" (key, title, body, "actionLabel", "actionUrl", "updatedAt")
        VALUES ('WELCOME', ${values.title}, ${values.body}, ${values.actionLabel}, ${values.actionUrl}, now())
        ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body,
            "actionLabel" = EXCLUDED."actionLabel", "actionUrl" = EXCLUDED."actionUrl", "updatedAt" = now()
    `);
}
