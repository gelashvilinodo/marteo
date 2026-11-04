import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getAdminUser } from "./authorization";
import { AdminAccessError } from "./overview";
import { AdminActionError } from "./actions";
import { createPgReader } from "@/lib/database/pg-reader";

// The hourly cron's tasks (worker.mjs). Listed even before their first run, so a missing one stands out.
export const SYSTEM_JOBS = [
    { name: "subscription-expiry", label: "პაკეტების ვადის შემოწმება" },
    { name: "support-cleanup", label: "დახმარების ჩათის გასუფთავება (24 სთ)" },
    { name: "system-log-prune", label: "ძველი ჩანაწერების წაშლა" },
] as const;

const LATE_AFTER_MS = 2 * 3600_000;

export type SystemJobView = {
    name: string; label: string; state: "ok" | "failed" | "late" | "never";
    lastStartedAt: Date | null; lastFinishedAt: Date | null; lastError: string | null; lastResult: number | null; runs: number; failures: number;
};
export type SystemErrorView = { id: string; source: string; message: string; route: string | null; count: number; firstAt: Date; lastAt: Date; resolvedAt: Date | null };
export type SystemBannerView = { id: string; message: string; tone: string; startsAt: Date; endsAt: Date | null; canceledAt: Date | null; state: "active" | "scheduled" | "ended" };

export const ERRORS_PAGE_SIZE = 50;

export async function getSystemOverview(view: "open" | "resolved", page: number) {
    if (!await getAdminUser()) throw new AdminAccessError();
    const now = new Date();
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            const jobs = await tx.$queryRaw<Omit<SystemJobView, "label" | "state">[]>`
                SELECT name, "lastStartedAt", "lastFinishedAt", "lastError", "lastResult", runs, failures, "lastOk" FROM "SystemJob"
            `;
            const [counts] = await tx.$queryRaw<{ open: number; resolved: number; day: number }[]>`
                SELECT count(*) FILTER (WHERE "resolvedAt" IS NULL)::int AS open,
                    count(*) FILTER (WHERE "resolvedAt" IS NOT NULL)::int AS resolved,
                    count(*) FILTER (WHERE "resolvedAt" IS NULL AND "lastAt" >= ${new Date(now.getTime() - 86400000)})::int AS day
                FROM "SystemError"
            `;
            const errors = view === "open"
                ? await tx.$queryRaw<SystemErrorView[]>`
                    SELECT id, source, message, route, count, "firstAt", "lastAt", "resolvedAt" FROM "SystemError"
                    WHERE "resolvedAt" IS NULL ORDER BY "lastAt" DESC, id LIMIT ${ERRORS_PAGE_SIZE} OFFSET ${(page - 1) * ERRORS_PAGE_SIZE}`
                : await tx.$queryRaw<SystemErrorView[]>`
                    SELECT id, source, message, route, count, "firstAt", "lastAt", "resolvedAt" FROM "SystemError"
                    WHERE "resolvedAt" IS NOT NULL ORDER BY "resolvedAt" DESC, id LIMIT ${ERRORS_PAGE_SIZE} OFFSET ${(page - 1) * ERRORS_PAGE_SIZE}`;
            const banners = await tx.$queryRaw<Omit<SystemBannerView, "state">[]>`
                SELECT id, message, tone, "startsAt", "endsAt", "canceledAt" FROM "SystemBanner" ORDER BY "createdAt" DESC LIMIT 10
            `;
            const byName = new Map(jobs.map(job => [job.name, job as typeof job & { lastOk: boolean | null }]));
            return {
                jobs: SYSTEM_JOBS.map(({ name, label }): SystemJobView => {
                    const job = byName.get(name);
                    if (!job?.lastStartedAt) return { name, label, state: "never", lastStartedAt: null, lastFinishedAt: null, lastError: null, lastResult: null, runs: 0, failures: 0 };
                    const state = job.lastOk === false ? "failed" : now.getTime() - job.lastStartedAt.getTime() > LATE_AFTER_MS ? "late" : "ok";
                    return { name, label, state, lastStartedAt: job.lastStartedAt, lastFinishedAt: job.lastFinishedAt, lastError: job.lastError, lastResult: job.lastResult, runs: job.runs, failures: job.failures };
                }),
                counts: counts ?? { open: 0, resolved: 0, day: 0 },
                errors,
                banners: banners.map(banner => ({ ...banner, state: bannerState(banner, now) })),
            };
        });
    } finally { await db.$disconnect(); }
}

function bannerState(banner: { startsAt: Date; endsAt: Date | null; canceledAt: Date | null }, now: Date): SystemBannerView["state"] {
    if (banner.canceledAt || (banner.endsAt && banner.endsAt <= now)) return "ended";
    return banner.startsAt > now ? "scheduled" : "active";
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function resolveErrors(prisma: PrismaClient, adminId: string, input: { id?: unknown; all?: unknown }) {
    const now = new Date();
    if (input.all === true) {
        const result = await prisma.systemError.updateMany({ where: { resolvedAt: null }, data: { resolvedAt: now } });
        await prisma.adminAuditLog.create({ data: { adminId, action: "errors-resolve", targetType: "PLATFORM", targetId: "errors", after: { count: result.count } } });
        return `${result.count} შეცდომა მოგვარებულად მოინიშნა.`;
    }
    if (typeof input.id !== "string" || !ID.test(input.id)) throw new AdminActionError("შეცდომა ვერ მოიძებნა.", 404);
    const result = await prisma.systemError.updateMany({ where: { id: input.id, resolvedAt: null }, data: { resolvedAt: now } });
    if (!result.count) throw new AdminActionError("შეცდომა ვერ მოიძებნა ან უკვე მოგვარებულია.", 404);
    return "მოგვარებულად მოინიშნა. თუ ისევ მოხდება, სიაში დაბრუნდება.";
}

// "YYYY-MM-DDTHH:mm" from a datetime-local field, read as Tbilisi time.
function readLocal(value: unknown, field: string) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new AdminActionError(`${field} არასწორია.`);
    const date = new Date(`${value}:00+04:00`);
    if (Number.isNaN(date.getTime())) throw new AdminActionError(`${field} არასწორია.`);
    return date;
}

export async function createBanner(prisma: PrismaClient, adminId: string, input: { message?: unknown; tone?: unknown; startsAt?: unknown; endsAt?: unknown }) {
    const message = typeof input.message === "string" ? input.message.replace(/\s+/g, " ").trim() : "";
    if (!message) throw new AdminActionError("ბანერის ტექსტი ცარიელია.");
    if (message.length > 200) throw new AdminActionError("ტექსტი 200 სიმბოლოს არ უნდა აღემატებოდეს.");
    if (input.tone !== "INFO" && input.tone !== "WARNING") throw new AdminActionError("ფერი არასწორია.");
    const now = new Date();
    const startsAt = readLocal(input.startsAt, "დაწყების დრო") ?? now;
    const endsAt = readLocal(input.endsAt, "დასრულების დრო");
    if (endsAt && endsAt <= startsAt) throw new AdminActionError("დასრულება დაწყების შემდეგ უნდა იყოს.");
    if (endsAt && endsAt <= now) throw new AdminActionError("დასრულების დრო უკვე გასულია.");
    const banner = await prisma.systemBanner.create({ data: { message, tone: input.tone, startsAt, endsAt, createdById: adminId }, select: { id: true } });
    await prisma.adminAuditLog.create({ data: { adminId, action: "banner-create", targetType: "PLATFORM", targetId: banner.id, after: { message, tone: input.tone, startsAt: startsAt.toISOString(), endsAt: endsAt?.toISOString() ?? null } } });
    return startsAt > now ? "ბანერი დაიგეგმა." : "ბანერი გამოჩნდა ყველა მომხმარებლის დაშბორდზე.";
}

export async function cancelBanner(prisma: PrismaClient, adminId: string, bannerId: unknown) {
    if (typeof bannerId !== "string" || !ID.test(bannerId)) throw new AdminActionError("ბანერი ვერ მოიძებნა.", 404);
    const result = await prisma.systemBanner.updateMany({ where: { id: bannerId, canceledAt: null }, data: { canceledAt: new Date() } });
    if (!result.count) throw new AdminActionError("ბანერი ვერ მოიძებნა ან უკვე მოხსნილია.", 404);
    await prisma.adminAuditLog.create({ data: { adminId, action: "banner-cancel", targetType: "PLATFORM", targetId: bannerId } });
    return "ბანერი მოიხსნა.";
}

// Global log of admin actions: what was done, by whom and to which account or business.
export const AUDIT_GROUPS = {
    users: { label: "მომხმარებლები", actions: ["verify-email", "verify-phone", "suspend", "unsuspend", "end-sessions", "send-password-reset"] },
    billing: { label: "პაკეტი და გადახდები", actions: ["subscription", "subscription-auto", "payment", "payment-void"] },
    ai: { label: "მართეო AI", actions: ["ai-settings"] },
    exports: { label: "ექსპორტი", actions: ["export-users", "export-businesses", "export-payments"] },
    system: { label: "სისტემა", actions: ["banner-create", "banner-cancel", "errors-resolve"] },
} as const;

export type AuditGroup = keyof typeof AUDIT_GROUPS;
export const AUDIT_PAGE_SIZE = 50;

export type AuditLogRow = {
    id: string; action: string; createdAt: Date; targetType: string; targetId: string; before: unknown; after: unknown;
    adminName: string | null; targetName: string | null;
};

export async function getAuditLogPage(page: number, filters: { group: AuditGroup | ""; period: "" | "7" | "30" | "90" }) {
    if (!await getAdminUser()) throw new AdminAccessError();
    const actions: readonly string[] | null = filters.group ? AUDIT_GROUPS[filters.group].actions : null;
    const since = filters.period ? new Date(Date.now() - Number(filters.period) * 86400000) : new Date(0);
    const db = createPgReader();
    try {
        return await db.withReadTransaction(async tx => {
            const [{ total }] = await tx.$queryRaw<{ total: number }[]>`
                SELECT count(*)::int AS total FROM "AdminAuditLog" l
                WHERE l."createdAt" >= ${since} AND (${actions}::text[] IS NULL OR l.action = ANY(${actions}::text[]))
            `;
            const rows = await tx.$queryRaw<AuditLogRow[]>`
                SELECT l.id, l.action, l."createdAt", l."targetType", l."targetId", l.before, l.after,
                    nullif(trim(coalesce(a."firstName", '') || ' ' || coalesce(a."lastName", '')), '') AS "adminName",
                    CASE l."targetType" WHEN 'BUSINESS' THEN b.name WHEN 'USER' THEN coalesce(nullif(trim(coalesce(u."firstName", '') || ' ' || coalesce(u."lastName", '')), ''), u.email) END AS "targetName"
                FROM "AdminAuditLog" l
                LEFT JOIN "User" a ON a.id = l."adminId"
                LEFT JOIN "Business" b ON l."targetType" = 'BUSINESS' AND b.id = l."targetId"
                LEFT JOIN "User" u ON l."targetType" = 'USER' AND u.id = l."targetId"
                WHERE l."createdAt" >= ${since} AND (${actions}::text[] IS NULL OR l.action = ANY(${actions}::text[]))
                ORDER BY l."createdAt" DESC, l.id
                LIMIT ${AUDIT_PAGE_SIZE} OFFSET ${(page - 1) * AUDIT_PAGE_SIZE}
            `;
            return { total, rows };
        });
    } finally { await db.$disconnect(); }
}
